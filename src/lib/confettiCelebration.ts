import confetti from 'canvas-confetti';

/** Short celebration burst (same palette as dashboard1 onboarding). */
export function fireProfileOnboardingConfetti(): void {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1', '#9400D3'];
  const zIndex = 20_000;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
      zIndex,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
      zIndex,
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  frame();

  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors,
      zIndex,
    });
  }, 500);
}

/** Celebration when HL deposit credits successfully.
 *  zIndex must sit ABOVE the funds modal backdrop (z-index: 10160) —
 *  canvas-confetti defaults to 100, which hides particles behind the blur. */
export function fireDepositSuccessConfetti(): void {
  const colors = ['#12aaff', '#14b8a6', '#22c55e', '#FFD700', '#ffffff'];
  const zIndex = 20_000;
  confetti({
    particleCount: 100,
    spread: 110,
    origin: { y: 0.45 },
    colors,
    scalar: 1.15,
    zIndex,
  });
  window.setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 75,
      origin: { x: 0.05, y: 0.6 },
      colors,
      zIndex,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 75,
      origin: { x: 0.95, y: 0.6 },
      colors,
      zIndex,
    });
  }, 220);
}
