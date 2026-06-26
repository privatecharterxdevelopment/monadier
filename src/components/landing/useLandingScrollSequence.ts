import { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureScrollLock,
  getScrollLockOwner,
  isBodyScrollLocked,
  lockPageScroll,
  readScrollY,
  registerLandingWheelConsumer,
  resolveEngageScrollY,
  sectionReleaseScrollY,
  unlockPageScroll,
  unregisterLandingWheelConsumer,
} from '../../lib/landingScrollLock';

type ContinuousOptions = {
  lockId: string;
  mode?: 'continuous';
  scrollPx: number;
};

type StepOptions = {
  lockId: string;
  mode: 'step';
  stepCount: number;
  wheelThreshold?: number;
};

type Options = ContinuousOptions | StepOptions;

export function useLandingScrollSequence(options: Options) {
  const lockId = options.lockId;
  const isStepMode = options.mode === 'step';
  const scrollPx = isStepMode ? 1 : options.scrollPx;
  const stepCount = isStepMode ? options.stepCount : 1;

  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const stepRef = useRef(0);
  const stepCooldownRef = useRef(false);
  const stepCooldownTimerRef = useRef<number | null>(null);
  const engagedRef = useRef(false);
  const completeRef = useRef(false);
  const unlockedRef = useRef(false);
  const touchYRef = useRef<number | null>(null);
  const lockSnapshotRef = useRef<{ scrollY: number } | null>(null);

  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [complete, setComplete] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const syncProgressFromStep = useCallback(
    (step: number) => {
      const maxStep = Math.max(1, stepCount - 1);
      const p = step / maxStep;
      progressRef.current = p;
      setProgress(p);
    },
    [stepCount]
  );

  const markCompleteIfNeeded = useCallback(
    (step: number) => {
      if (step >= stepCount - 1 && !completeRef.current) {
        completeRef.current = true;
        setComplete(true);
      }
    },
    [stepCount]
  );

  const releaseLock = useCallback(
    (forward = true, continueDelta = 0) => {
      if (unlockedRef.current) return;

      const snapshot = lockSnapshotRef.current;
      lockSnapshotRef.current = null;

      const lockedScrollY = snapshot?.scrollY ?? readScrollY();
      const exitY = sectionReleaseScrollY(lockedScrollY, forward, continueDelta);

      unlockedRef.current = true;
      engagedRef.current = false;
      unlockPageScroll({ scrollY: exitY }, lockId);

      requestAnimationFrame(() => {
        window.scrollTo(0, exitY);
        requestAnimationFrame(() => {
          setLocked(false);
          setUnlocked(true);
        });
      });
    },
    [lockId]
  );

  const applyProgress = useCallback((next: number) => {
    const p = Math.min(1, Math.max(0, next));
    progressRef.current = p;
    setProgress(p);
    if (p >= 1 && !completeRef.current) {
      completeRef.current = true;
      setComplete(true);
    }
  }, []);

  const applyStep = useCallback(
    (next: number) => {
      const step = Math.min(stepCount - 1, Math.max(0, next));
      stepRef.current = step;
      setStepIndex(step);
      syncProgressFromStep(step);
      markCompleteIfNeeded(step);
    },
    [markCompleteIfNeeded, stepCount, syncProgressFromStep]
  );

  const engage = useCallback(() => {
    const section = sectionRef.current;
    if (!section || unlockedRef.current || engagedRef.current) return false;

    const owner = getScrollLockOwner();
    if (owner && owner !== lockId) return false;

    const rect = section.getBoundingClientRect();
    const aligned = Math.abs(rect.top) <= 24;
    const inView = aligned && rect.bottom > window.innerHeight * 0.42;
    if (!inView) return false;

    const scrollY = resolveEngageScrollY(section);
    if (scrollY < 8) return false;
    lockSnapshotRef.current = captureScrollLock(scrollY);
    engagedRef.current = true;
    setLocked(true);
    lockPageScroll(scrollY, lockId);
    return true;
  }, [lockId]);

  const isSectionNearViewport = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return false;
    const rect = section.getBoundingClientRect();
    return rect.top <= window.innerHeight * 0.92 && rect.bottom >= window.innerHeight * 0.08;
  }, []);

  const tryEngage = useCallback(() => {
    if (unlockedRef.current || engagedRef.current) return;
    if (isBodyScrollLocked() && getScrollLockOwner() !== lockId) return;
    if (!isSectionNearViewport()) return;
    engage();
  }, [engage, isSectionNearViewport, lockId]);

  const advanceStep = useCallback(
    (direction: 1 | -1) => {
      applyStep(stepRef.current + direction);
    },
    [applyStep]
  );

  const bumpStep = useCallback(
    (direction: 1 | -1) => {
      if (stepCooldownRef.current) return;
      stepCooldownRef.current = true;
      if (stepCooldownTimerRef.current != null) {
        window.clearTimeout(stepCooldownTimerRef.current);
      }
      advanceStep(direction);
      stepCooldownTimerRef.current = window.setTimeout(() => {
        stepCooldownRef.current = false;
        stepCooldownTimerRef.current = null;
      }, 720);
    },
    [advanceStep]
  );

  const handleWheelDelta = useCallback(
    (deltaY: number) => {
      if (unlockedRef.current) return false;

      if (!engagedRef.current) {
        if (isBodyScrollLocked() && getScrollLockOwner() !== lockId) return false;
        engage();
        if (!engagedRef.current) return false;
      }

      if (Math.abs(deltaY) < 2) return true;

      if (isStepMode) {
        if (deltaY > 0) {
          if (completeRef.current) {
            releaseLock(true, deltaY);
            return false;
          }
          bumpStep(1);
        } else {
          if (completeRef.current) {
            completeRef.current = false;
            setComplete(false);
          }
          bumpStep(-1);
        }
        return true;
      }

      if (completeRef.current) {
        if (deltaY > 0) {
          releaseLock(true, deltaY);
          return false;
        }
        applyProgress(progressRef.current + deltaY / scrollPx);
        return true;
      }

      applyProgress(progressRef.current + deltaY / scrollPx);
      return true;
    },
    [applyProgress, bumpStep, engage, isStepMode, lockId, releaseLock, scrollPx]
  );

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      completeRef.current = true;
      unlockedRef.current = true;
      setComplete(true);
      setUnlocked(true);
      if (isStepMode) applyStep(stepCount - 1);
      else applyProgress(1);
      return undefined;
    }

    registerLandingWheelConsumer({
      id: lockId,
      isActive: () => {
        if (unlockedRef.current) return false;
        const owner = getScrollLockOwner();
        if (owner === lockId || engagedRef.current) return true;
        if (isBodyScrollLocked()) return false;
        return isSectionNearViewport();
      },
      onWheel: handleWheelDelta,
    });

    const onScroll = () => {
      tryEngage();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (unlockedRef.current) return;
      touchYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (unlockedRef.current || touchYRef.current == null) return;
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      const delta = touchYRef.current - y;
      touchYRef.current = y;
      if (Math.abs(delta) < 2) return;
      const consumed = handleWheelDelta(delta);
      if (consumed) e.preventDefault();
    };

    const onTouchEnd = () => {
      touchYRef.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (unlockedRef.current || !engagedRef.current) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        if (isStepMode) {
          if (completeRef.current) releaseLock(true, 48);
          else bumpStep(1);
          return;
        }
        if (completeRef.current) releaseLock(true, 48);
        else applyProgress(progressRef.current + 0.12);
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (isStepMode) {
          if (completeRef.current) {
            completeRef.current = false;
            setComplete(false);
          }
          bumpStep(-1);
          return;
        }
        applyProgress(progressRef.current - 0.12);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unregisterLandingWheelConsumer(lockId);
      if (stepCooldownTimerRef.current != null) {
        window.clearTimeout(stepCooldownTimerRef.current);
      }
      if (engagedRef.current && !unlockedRef.current) {
        const snapshot = lockSnapshotRef.current;
        if (snapshot) unlockPageScroll(snapshot, lockId);
      }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    applyProgress,
    applyStep,
    bumpStep,
    handleWheelDelta,
    isSectionNearViewport,
    isStepMode,
    lockId,
    releaseLock,
    stepCount,
    tryEngage,
  ]);

  return {
    sectionRef,
    progress,
    progressRef,
    stepIndex,
    locked,
    complete,
    unlocked,
    applyProgress,
  };
}
