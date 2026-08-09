/**
 * HyperGain landing assistant — knowledge answers + human-handoff detection.
 * Intentional: grounded product facts only; never invent yields or custody claims.
 */

export type AssistReply = {
  text: string;
  /** Offer register → support CTA */
  handoff?: boolean;
};

type Entry = {
  keys: string[];
  answer: string;
};

const ENTRIES: Entry[] = [
  {
    keys: ['what is hypergain', 'what is this', 'who are you', 'about hypergain', 'explain'],
    answer:
      'HyperGain is a non-custodial Hyperliquid trading platform: an AI perpetuals bot that can run 24/7 on your HL account, plus pro perps and on-chain sports/outcome betting — one interface. We supply automation; your USDC stays on Hyperliquid.',
  },
  {
    keys: ['non-custodial', 'custody', 'keys', 'private key', 'withdraw', 'safe', 'scam', 'trust'],
    answer:
      'Yes — non-custodial. Your USDC stays on your Hyperliquid account in your name. We never hold your private keys. The trading agent can place trades after you approve it once, but cannot withdraw. Withdrawals always need your wallet on HL.',
  },
  {
    keys: ['how it works', 'how does it work', 'get started', 'start', 'setup', 'onboard'],
    answer:
      'Four steps: (1) Connect wallet / create account, (2) Bridge USDC to Hyperliquid from Arbitrum One, (3) Approve the trading agent once, (4) Press Start bot. Min ~$20 USDC on HL for the bot. Deposit only native USDC on Arbitrum — not other chains.',
  },
  {
    keys: ['deposit', 'bridge', 'fund', 'usdc', 'arbitrum', 'how much'],
    answer:
      'Fund with native USDC on Arbitrum One via the in-app Funds flow into your Hyperliquid account. HL min deposit is $5; the bot needs about $20+ to run. Wrong chain / wrong USDC variant will not work.',
  },
  {
    keys: ['fee', 'fees', 'pricing', 'cost', 'price', 'subscription', 'builder'],
    answer:
      'Hyperliquid trading fees apply on perp fills. HyperGain may charge a builder fee on HL orders and subscription tiers for bot access — see Pricing in the site or fee settings in the app. Platform fees on bot closes are only when a trade is profitable (check current app terms).',
  },
  {
    keys: ['bot', 'auto', '24/7', 'trading bot', 'ai bot', 'leverage', 'stop loss', 'take profit'],
    answer:
      'The bot runs on HyperGain servers (not your laptop). While Start bot is on and you have enough USDC on HL, it scans 200+ Hyperliquid perps, opens/closes with your TP/SL/leverage settings, around the clock. Stop bot anytime; you can also close positions manually in the terminal.',
  },
  {
    keys: ['betting', 'sports', 'world cup', 'prediction'],
    answer:
      'AI Sports Betting uses Hyperliquid outcome markets from your HL spot balance. Pick Yes/No at live odds, track open bets, cash out when liquidity allows, or hold to settlement. Same non-custodial model — funds stay on HL.',
  },
  {
    keys: ['leaderboard', 'proof', 'hypurrscan', 'transparent'],
    answer:
      'The public leaderboard shows real closed Hyperliquid bot trades. Wallets are masked on the site; full addresses are verifiable on HypurrScan. Live rows refresh from HL closes.',
  },
  {
    keys: ['guarantee', 'returns', 'profit', 'apy', 'passive income', 'make money'],
    answer:
      'No promised or guaranteed returns. Leveraged crypto trading is high risk — you can lose money. Past P/L on the leaderboard does not predict future results. Only trade what you can afford to lose. Not financial advice.',
  },
  {
    keys: ['wallet', 'metamask', 'walletconnect', 'connect'],
    answer:
      'Sign in and connect MetaMask or WalletConnect. You approve the HyperGain trading agent once so the bot can trade on HL — that approval is for trading only, not withdrawals.',
  },
  {
    keys: ['computer', 'laptop', 'browser', 'offline', 'server'],
    answer:
      'You do not need to keep your browser open. After Start bot with a funded HL account, automation runs on HyperGain’s servers 24/7 until you stop it.',
  },
  {
    keys: ['support', 'help', 'contact', 'email'],
    answer:
      'For product help use Help center on the site, or email administration@hypergain.io. Prefer talking to a person? Register free and message support from the app.',
  },
  {
    keys: ['register', 'sign up', 'account', 'free'],
    answer:
      'Registration is free. Hit Try for free / Launch app, create your account, connect a wallet, fund HL with Arbitrum USDC, approve the agent, then Start bot.',
  },
];

const HUMAN_RE =
  /\b(human|real person|real human|live (agent|support|person)|talk to (a |someone|support|agent|human)|connect me to|speak (to|with)|customer service|call me|operator)\b/i;

const ANGER_RE =
  /\b(scam|fraud|stolen|steal|lawsuit|lawyer|fuck|shit|idiot|useless|garbage|worst|hate this|ripoff|rip.?off|refund|angry|pissed|bullshit|bs)\b/i;

function score(query: string, keys: string[]): number {
  const q = query.toLowerCase();
  let best = 0;
  for (const key of keys) {
    if (q.includes(key)) best = Math.max(best, key.length);
    else {
      const parts = key.split(/\s+/).filter((w) => w.length > 2);
      const hits = parts.filter((w) => q.includes(w)).length;
      if (hits > 0) best = Math.max(best, hits * 3 + (hits === parts.length ? 8 : 0));
    }
  }
  return best;
}

export function detectHumanHandoff(input: string): boolean {
  return HUMAN_RE.test(input) || ANGER_RE.test(input);
}

export function answerLandingAssist(input: string): AssistReply {
  const trimmed = input.trim();
  if (!trimmed) {
    return { text: 'Ask anything about HyperGain — bot, fees, custody, betting, or getting started.' };
  }

  if (detectHumanHandoff(trimmed)) {
    return {
      handoff: true,
      text:
        'Want to talk to a human? Register free and chat with support in the app — the team can pick up from there.',
    };
  }

  let best: Entry | null = null;
  let bestScore = 0;
  for (const entry of ENTRIES) {
    const s = score(trimmed, entry.keys);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }

  if (best && bestScore >= 4) {
    return { text: best.answer };
  }

  return {
    text:
      'I can help with how HyperGain works, non-custodial funds, deposits (Arbitrum USDC → HL), the trading bot, fees, sports betting, or the on-chain leaderboard. Or say “talk to a human” if you’d rather reach support.',
  };
}

export const LANDING_ASSIST_WELCOME =
  'Hey — I’m the HyperGain assistant. Ask about the bot, custody, fees, betting, or how to start. Prefer a person? Just say so.';
