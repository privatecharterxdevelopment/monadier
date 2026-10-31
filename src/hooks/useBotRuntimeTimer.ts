import { useEffect, useState } from 'react';
import {
  formatBotRuntime,
  markBotRuntimeStarted,
  readBotRuntimeStartMs,
} from '../lib/botRuntimeTimer';

export function useBotRuntimeTimer(wallet: string | undefined, running: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!running || !wallet) {
      setElapsedSeconds(0);
      return;
    }

    let startMs = readBotRuntimeStartMs(wallet);
    if (startMs == null) {
      startMs = Date.now();
      markBotRuntimeStarted(wallet, startMs);
    }

    const tick = () => {
      const sec = Math.floor((Date.now() - startMs!) / 1000);
      setElapsedSeconds(Math.max(0, sec));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, wallet]);

  return {
    elapsedSeconds,
    formatted: running && wallet ? formatBotRuntime(elapsedSeconds) : '',
  };
}
