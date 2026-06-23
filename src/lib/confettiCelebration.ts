import confetti from 'canvas-confetti';

/** Short celebration burst (same palette as dashboard1 onboarding). */
export function fireProfileOnboardingConfetti(): void {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1', '#9400D3'];

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
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
    });
  }, 500);
}

/** Celebration when HL deposit credits successfully. */
export function fireDepositSuccessConfetti(): void {
  const colors = ['#12aaff', '#14b8a6', '#22c55e', '#FFD700', '#ffffff'];
  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.55 },
    colors,
    scalar: 1.05,
  });
  window.setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.65 },
      colors,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.65 },
      colors,
    });
  }, 220);
}
