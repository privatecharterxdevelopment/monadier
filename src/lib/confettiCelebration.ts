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
