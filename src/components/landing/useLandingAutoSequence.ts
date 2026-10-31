import { useCallback, useEffect, useRef, useState } from 'react';

type AutoContinuousOptions = {
  mode?: 'continuous';
  durationMs: number;
  visibilityThreshold?: number;
  rootMargin?: string;
};

type AutoStepOptions = {
  mode: 'step';
  stepCount: number;
  stepDurationMs: number;
  visibilityThreshold?: number;
  rootMargin?: string;
};

type Options = AutoContinuousOptions | AutoStepOptions;

/** Time-based section animation — no scroll lock / wheel hijack. */
export function useLandingAutoSequence(options: Options) {
  const isStepMode = options.mode === 'step';
  const stepCount = isStepMode ? options.stepCount : 1;
  const durationMs = isStepMode ? 0 : options.durationMs;
  const stepDurationMs = isStepMode ? options.stepDurationMs : 0;
  const visibilityThreshold = options.visibilityThreshold ?? 0.3;
  const rootMargin = options.rootMargin ?? '0px 0px -8% 0px';

  const sectionRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);
  const completeRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [started, setStarted] = useState(false);

  const markComplete = useCallback(() => {
    if (completeRef.current) return;
    completeRef.current = true;
    setComplete(true);
    if (isStepMode) {
      setStepIndex(Math.max(0, stepCount - 1));
      setProgress(1);
    } else {
      setProgress(1);
    }
  }, [isStepMode, stepCount]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      markComplete();
      return undefined;
    }

    const section = sectionRef.current;
    if (!section) return undefined;

    const clearTimers = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (stepTimerRef.current != null) {
        window.clearTimeout(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    };

    const startContinuous = () => {
      startTimeRef.current = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTimeRef.current) / durationMs);
        setProgress(t);
        if (t >= 1) {
          markComplete();
          rafRef.current = null;
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const startStep = () => {
      let step = 0;
      setStepIndex(0);
      setProgress(0);

      const advance = () => {
        if (step >= stepCount - 1) {
          markComplete();
          return;
        }
        step += 1;
        setStepIndex(step);
        const maxStep = Math.max(1, stepCount - 1);
        setProgress(step / maxStep);
        stepTimerRef.current = window.setTimeout(advance, stepDurationMs);
      };

      stepTimerRef.current = window.setTimeout(advance, stepDurationMs);
    };

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setStarted(true);
      if (isStepMode) startStep();
      else startContinuous();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (entry.intersectionRatio < visibilityThreshold) return;
        start();
      },
      { threshold: [0, visibilityThreshold, 0.55, 1], rootMargin }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [
    durationMs,
    isStepMode,
    markComplete,
    rootMargin,
    stepCount,
    stepDurationMs,
    visibilityThreshold,
  ]);

  const unlockInPlace = useCallback(() => {}, []);

  return {
    sectionRef,
    progress,
    stepIndex,
    locked: false,
    unlocked: true,
    complete,
    started,
    unlockInPlace,
  };
}
