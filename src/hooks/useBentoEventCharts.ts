import { useEffect, useState } from 'react';
import {
  fetchBentoSportsBetCards,
  type BentoSportsBetCard,
} from '../lib/landing/bentoEventCardData';

const REFRESH_MS = 30_000;

export function useBentoSportsBetCarousel() {
  const [cards, setCards] = useState<BentoSportsBetCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchBentoSportsBetCards();
        if (!cancelled) {
          setCards(next);
        }
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { cards, loading };
}

/** @deprecated use useBentoSportsBetCarousel */
export function useBentoEventCharts() {
  return useBentoSportsBetCarousel();
}
