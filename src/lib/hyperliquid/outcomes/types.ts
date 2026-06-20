export type OutcomeSideIndex = 0 | 1;

export type HlOutcomeSideSpec = {
  name: string;
};

export type HlOutcomeRaw = {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: HlOutcomeSideSpec[];
  quoteToken?: string;
};

export type HlOutcomeQuestionRaw = {
  question: number;
  name: string;
  description: string;
  fallbackOutcome: number;
  namedOutcomes: number[];
  settledNamedOutcomes?: number[];
};

export type HlOutcomeMetaRaw = {
  outcomes: HlOutcomeRaw[];
  questions?: HlOutcomeQuestionRaw[];
};

export type HlOutcomeMarket = {
  outcomeId: number;
  name: string;
  description: string;
  quoteToken: string;
  yesLabel: string;
  noLabel: string;
};

export type HlOutcomeQuestion = {
  questionId: number;
  name: string;
  description: string;
  category: string;
  subCategory?: string;
  fallbackOutcomeId: number;
  legs: HlOutcomeMarket[];
  settledLegIds: number[];
};

export type OutcomeBookLevel = {
  px: number;
  sz: number;
  n: number;
};

export type OutcomeSideBook = {
  outcomeId: number;
  side: OutcomeSideIndex;
  orderCoin: string;
  bids: OutcomeBookLevel[];
  asks: OutcomeBookLevel[];
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
};

export type OutcomeLegQuote = {
  outcomeId: number;
  name: string;
  yes: OutcomeSideBook;
  no: OutcomeSideBook;
  impliedYesPct: number;
};

export type HlOutcomePosition = {
  outcomeId: number;
  side: OutcomeSideIndex;
  sideLabel: string;
  marketName: string;
  balanceCoin: string;
  orderCoin: string;
  size: number;
  entryNtl: number;
  avgEntryPx: number;
  markPx: number;
  valueUsd: number;
  unrealizedPnl: number;
};

export type OutcomeOrderSide = 'buy' | 'sell';
