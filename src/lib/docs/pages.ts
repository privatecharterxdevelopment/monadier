/**
 * HyperGain Docs — Aave-style documentation structure.
 */

export type DocsSectionId = 'introduction' | 'getting-started' | 'agent' | 'funds' | 'betting';

export type DocsNavItem = {
  slug: string;
  title: string;
  description: string;
  section: DocsSectionId;
};

export type DocsSection = {
  id: DocsSectionId;
  title: string;
  items: DocsNavItem[];
};

export type DocsArticle = DocsNavItem & {
  body: string[];
};

const ARTICLES: DocsArticle[] = [
  {
    slug: 'what-is-hypergain-io',
    title: 'What is HyperGain.io?',
    description:
      'HyperGain.io is a Hyperliquid AI crypto trading agent — not the Hyper Gain protein / mass-gainer supplement brand.',
    section: 'introduction',
    body: [
      'HyperGain.io (hypergain.io) is non-custodial trading software for Hyperliquid: an AI perpetuals agent, pro perps terminal, and on-chain outcome markets — one interface.',
      'It is not affiliated with any “Hyper Gain”, “Hypergain”, or similar fitness / protein / mass-gainer supplement products. If you searched for muscle powder and landed here, you want a different brand.',
      'Our product lives at hypergain.io and app.hypergain.io. Official social: @HyperGainAi on X. Support: administration@hypergain.io.',
      'You fund native USDC on Arbitrum into your own Hyperliquid account, approve the trading agent once, and can run full-auto scanning across 200+ HL perps. HyperGain never holds private keys and never takes custody into a company wallet.',
      'There are no promised or guaranteed returns. Leveraged crypto trading is high risk. Not financial advice.',
    ],
  },
  {
    slug: 'overview',
    title: 'Overview',
    description: 'What HyperGain is and how the non-custodial agent fits on Hyperliquid.',
    section: 'introduction',
    body: [
      'HyperGain.io is a non-custodial Hyperliquid trading platform: an AI perpetuals agent that can run 24/7 on your HL account, plus pro perps and on-chain sports/outcome betting — one interface.',
      'We supply the automation layer. Your USDC stays on Hyperliquid in your name. HyperGain never holds private keys and never takes custody of deposits into a company wallet.',
      'The agent scans 200+ Hyperliquid perps while Start bot is on, opens and closes according to your risk settings (slots, leverage, trailing), and can be stopped anytime. You can also close positions manually in the terminal.',
      'There are no promised or guaranteed returns. Leveraged crypto trading is high risk — you can lose money. Past P/L on the leaderboard does not predict future results. Not financial advice.',
      'Brand note: HyperGain.io is crypto trading software. It is unrelated to Hyper Gain protein or mass-gainer supplements that share a similar name.',
    ],
  },
  {
    slug: 'hypergain-101',
    title: 'HyperGain 101',
    description: 'Learn the basics — wallet, USDC on Arbitrum, agent approval, and Start bot.',
    section: 'introduction',
    body: [
      'HyperGain is built for people who want Hyperliquid perpetuals automation without babysitting charts or handing over keys.',
      'Create a free account, connect MetaMask or WalletConnect, and make sure you are on Arbitrum One. Fund with native USDC on Arbitrum — other chains or USDC variants will not credit correctly into the HL flow.',
      'Deposit into your Hyperliquid account via the in-app Funds flow. HL’s minimum deposit is $5; the agent typically needs about $20+ USDC on HL to run usefully.',
      'Approve the trading agent once. That approval is for trading only — not withdrawals. Withdrawals always require your wallet on Hyperliquid.',
      'Press Start bot when funded. You do not need to keep the browser open; automation runs on HyperGain servers until you stop it.',
    ],
  },
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Four steps from signup to live automation.',
    section: 'getting-started',
    body: [
      'Step 1 — Account & wallet: Register free, sign in, and connect MetaMask or WalletConnect on Arbitrum One.',
      'Step 2 — Fund Hyperliquid: Use the Funds tab to bridge native Arbitrum USDC into your HL account. Wrong chain / wrong USDC variant will not work.',
      'Step 3 — Approve once: Grant the HyperGain trading agent permission to place orders on your HL account. It cannot withdraw.',
      'Step 4 — Start bot: Choose slots / risk preferences if needed, then press Start bot. While it is on and you have enough free margin, the agent scans and may open or close positions around the clock.',
      'Stop bot anytime. Open positions remain yours on Hyperliquid until you close them (manually or via the agent’s exit logic). Always size for risk you can afford to lose.',
    ],
  },
  {
    slug: 'non-custodial',
    title: 'Non-custodial funds',
    description: 'Keys, withdrawals, and what the agent can (and cannot) do.',
    section: 'funds',
    body: [
      'Custody is the first question serious users ask. HyperGain does not take deposits into a platform hot wallet. Your USDC lives on Hyperliquid under your account.',
      'We never hold your private keys. Signing in and connecting a wallet does not give HyperGain the ability to drain funds.',
      'After you approve the trading agent, it can place and manage trades on Hyperliquid according to your settings. It cannot withdraw USDC off HL. Withdrawals always need your wallet action on Hyperliquid.',
      'If someone asks you to seed a “company wallet” or share a seed phrase to use HyperGain — that is not us. Keep keys offline and only approve the official agent flow in the app.',
    ],
  },
  {
    slug: 'profit-trailing',
    title: 'Profit trailing',
    description: 'How winners are trailed and when the agent cuts a pullback.',
    section: 'agent',
    body: [
      'When a position turns profitable, the agent can arm a trailing stop that follows favorable price and exits on a defined pullback — so winners can run without requiring you to watch every candle.',
      'For longs, the trail sits below the high (favorable extreme) and ratchets up as price makes new highs. For shorts, the trail sits above the low and ratchets down.',
      'The trail should never sit on the wrong side of the market (e.g. a long stop above mark). If something looks inverted, stop the agent and review the position in the terminal.',
      'Per-position “let run” overrides trail for that coin only when you turn it on — useful when you want to manage an exit manually. Default is trail-capable when the position is in profit and let run is off.',
    ],
  },
  {
    slug: 'leaderboard',
    title: 'On-chain leaderboard',
    description: 'Why closes are public and how to verify on HypurrScan.',
    section: 'agent',
    body: [
      'Marketing screenshots are easy to fake. HyperGain’s public leaderboard is wired to real Hyperliquid closes from agent activity.',
      'Wallets are masked on the site for privacy. Full addresses and fills can be verified on HypurrScan and other HL explorers.',
      'Use the board as transparency — not as a yield promise. Past results do not predict future performance, and leveraged trading can lose money quickly.',
    ],
  },
  {
    slug: 'fees',
    title: 'Fees',
    description: 'Hyperliquid trading fees, builder fees, and platform success fees.',
    section: 'funds',
    body: [
      'Hyperliquid charges trading fees on perp fills (maker/taker style depending on the venue fill). Those fees are part of trading on HL whether or not you use HyperGain.',
      'HyperGain may charge a builder fee on HL orders and subscription tiers for agent access. Check Pricing on the site and fee settings in the app for current numbers.',
      'Platform success fees on agent closes typically apply only when a trade is profitable — see current terms in the app. Losing closes should not be billed as “success.”',
      'Deposits and bridging into Hyperliquid do not include an extra HyperGain deposit fee — see Deposit successful (no HyperGain deposit fee). Always leave enough free margin for HL fees and adverse moves.',
    ],
  },
  {
    slug: 'depositing-bridging-hyperliquid',
    title: 'Depositing / bridging on Hyperliquid',
    description:
      'How HyperGain bridges native Arbitrum USDC into your Hyperliquid account — wallet sign, Arbitrum confirm, then HL credit.',
    section: 'funds',
    body: [
      'Open Funds → Deposit in HyperGain. Connect a wallet on Arbitrum One and deposit native USDC only — not BNB, BSC, ETH mainnet, or USDC on other chains.',
      'After you sign in your wallet, HyperGain shows Depositing to Hyperliquid with three steps: Wallet signed → Arbitrum confirmed → Hyperliquid credit. The first two usually finish quickly; HL credit often takes about 1–3 minutes.',
      'You can open the Arbitrum transaction and your HypurrScan wallet from the modal to verify the bridge on-chain. Until Hyperliquid credit completes, the new USDC will not appear as trading balance.',
      'HyperGain never takes custody into a company wallet. The deposit lands on your Hyperliquid account in your name. Wrong chain or the wrong USDC variant will not credit correctly.',
    ],
  },
  {
    slug: 'deposit-successful-no-extra-fees',
    title: 'Deposit successful — no HyperGain deposit fee',
    description:
      'When HL credit completes, USDC shows on your Hyperliquid balance. HyperGain does not charge an extra deposit or bridge fee — only Hyperliquid / network fees apply.',
    section: 'funds',
    body: [
      'When the bridge finishes, the modal shows Deposit successful with the amount credited and your updated Hyperliquid total. Press Done to return to Funds.',
      'HyperGain does not charge anything extra to deposit or bridge USDC into Hyperliquid. There is no HyperGain deposit markup, bridge surcharge, or “processing” fee on top of the transfer.',
      'You may still pay normal network gas on Arbitrum and whatever Hyperliquid protocol costs apply to the deposit path — those are Hyperliquid / chain fees, not HyperGain fees.',
      'Trading later still follows Hyperliquid trading fees and any HyperGain agent success / builder fees described under Fees. The deposit itself stays free of HyperGain add-ons.',
    ],
  },
  {
    slug: 'sports-betting',
    title: 'AI sports betting',
    description: 'Outcome markets from HL spot — same non-custodial model.',
    section: 'betting',
    body: [
      'HyperGain also surfaces Hyperliquid outcome markets for sports and macro-style events. Funding comes from your HL spot balance — same non-custodial model as the trading agent.',
      'Pick Yes/No at live odds, size the stake you can afford, and track open bets in the app. Cash out when liquidity allows, or hold to settlement.',
      'Odds and available size depend on HL market liquidity. Thin books can mean wider prices or limited cash-out. This is not a sportsbook deposit account; funds stay on Hyperliquid.',
    ],
  },
];

export const DOCS_FEATURED = {
  slug: 'what-is-hypergain-io',
  title: 'What is HyperGain.io?',
  description:
    'HyperGain.io is the Hyperliquid AI crypto trading agent — not a protein or mass-gainer brand. Domain: hypergain.io.',
};

export const DOCS_FAMILIAR = [
  {
    slug: 'what-is-hypergain-io',
    title: 'What is HyperGain.io?',
    description: 'Crypto trading agent on Hyperliquid — not supplements.',
  },
  {
    slug: 'depositing-bridging-hyperliquid',
    title: 'Depositing / bridging',
    description: 'Wallet sign → Arbitrum confirm → Hyperliquid credit.',
  },
  {
    slug: 'deposit-successful-no-extra-fees',
    title: 'Deposit successful',
    description: 'No HyperGain deposit fee — only HL / network fees.',
  },
  {
    slug: 'fees',
    title: 'Fees',
    description: 'HL trading fees, builder fees, and when success fees apply.',
  },
];

/** Locales with full docs article translations (others fall back to English). */
export const DOCS_ARTICLE_LOCALES = new Set(['en', 'de']);

type DocsArticleCopy = Pick<DocsArticle, 'title' | 'description' | 'body'>;

const DE_ARTICLES: Record<string, DocsArticleCopy> = {
  'what-is-hypergain-io': {
    title: 'Was ist HyperGain.io?',
    description:
      'HyperGain.io ist ein Hyperliquid-AI-Crypto-Trading-Agent — nicht die Protein-/Mass-Gainer-Marke „Hyper Gain“.',
    body: [
      'HyperGain.io (hypergain.io) ist non-custodial Trading-Software für Hyperliquid: AI-Perps-Agent, Pro-Perps-Terminal und On-Chain-Outcome-Märkte — eine Oberfläche.',
      'Es besteht keine Verbindung zu „Hyper Gain“, „Hypergain“ oder ähnlichen Fitness-/Protein-/Mass-Gainer-Produkten. Wenn du Muskelpulver gesucht hast, bist du hier falsch.',
      'Produkt unter hypergain.io und app.hypergain.io. Offiziell auf X: @HyperGainAi. Support: administration@hypergain.io.',
      'Du zahlst natives USDC auf Arbitrum auf dein eigenes Hyperliquid-Konto ein, gibst den Trading-Agent einmal frei und kannst 200+ HL-Perps vollautomatisch scannen lassen. HyperGain hält keine Private Keys und verwahrt keine Kundengelder.',
      'Keine versprochenen oder garantierten Renditen. Hebel-Crypto ist hochriskant. Keine Finanzberatung.',
    ],
  },
  overview: {
    title: 'Überblick',
    description: 'Was HyperGain ist und wie der non-custodial Agent auf Hyperliquid sitzt.',
    body: [
      'HyperGain.io ist eine non-custodial Hyperliquid-Trading-Plattform: AI-Perps-Agent 24/7 auf deinem HL-Konto, plus Pro-Perps und On-Chain-Sport-/Outcome-Betting — eine Oberfläche.',
      'Wir liefern die Automation. Dein USDC bleibt auf Hyperliquid auf deinen Namen. HyperGain hält keine Private Keys und nimmt keine Einlagen in eine Firmen-Wallet.',
      'Der Agent scannt 200+ Hyperliquid-Perps solange Start bot an ist, öffnet und schließt nach deinen Risk-Settings und kann jederzeit gestoppt werden. Manuelles Schließen im Terminal geht immer.',
      'Keine garantierten Renditen. Hebel-Crypto ist hochriskant — Verluste sind möglich. Leaderboard-P/L sagt nichts über die Zukunft. Keine Finanzberatung.',
      'Markenhinweis: HyperGain.io ist Crypto-Trading-Software und hat nichts mit Hyper-Gain-Protein oder Mass-Gainern zu tun.',
    ],
  },
  'hypergain-101': {
    title: 'HyperGain 101',
    description: 'Basics — Wallet, USDC auf Arbitrum, Agent-Freigabe und Start bot.',
    body: [
      'HyperGain ist für Leute, die Hyperliquid-Perps-Automation wollen — ohne Charts zu babysitten oder Keys abzugeben.',
      'Kostenloses Konto, MetaMask oder WalletConnect, Netzwerk Arbitrum One. Nur natives USDC auf Arbitrum — andere Chains/Varianten creditten nicht korrekt.',
      'Einzahlung über in-app Funds auf dein Hyperliquid-Konto. HL-Minimum $5; für den Agent typisch ab ca. $20+ USDC auf HL.',
      'Trading-Agent einmal freigeben — nur Trading, kein Withdraw. Auszahlungen immer mit deiner Wallet auf Hyperliquid.',
      'Start bot wenn funded. Browser muss nicht offen bleiben; Automation läuft auf HyperGain-Servern bis du stoppst.',
    ],
  },
  'getting-started': {
    title: 'Erste Schritte',
    description: 'Vier Schritte von Signup bis Live-Automation.',
    body: [
      'Schritt 1 — Konto & Wallet: Registrieren, einloggen, MetaMask/WalletConnect auf Arbitrum One.',
      'Schritt 2 — Hyperliquid funden: Funds-Tab, natives Arbitrum-USDC aufs HL-Konto. Falsche Chain/Variante funktioniert nicht.',
      'Schritt 3 — Einmal freigeben: HyperGain-Agent darf Orders setzen, nicht abheben.',
      'Schritt 4 — Start bot: Slots/Risk wählen, Start bot. Mit genug Free Margin scannt der Agent rund um die Uhr.',
      'Stop bot jederzeit. Offene Positionen bleiben deine auf Hyperliquid bis Close (manuell oder Exit-Logik). Nur Risiko handeln, das du tragen kannst.',
    ],
  },
  'non-custodial': {
    title: 'Non-custodial Funds',
    description: 'Keys, Withdrawals und was der Agent (nicht) darf.',
    body: [
      'Custody ist die erste ernsthafte Frage. HyperGain nimmt keine Einlagen in eine Hot-Wallet. Dein USDC liegt auf Hyperliquid unter deinem Konto.',
      'Wir halten keine Private Keys. Login + Wallet-Connect heißt nicht, dass wir Funds abziehen können.',
      'Nach Agent-Freigabe darf er laut Settings traden — nicht USDC von HL abheben. Withdrawals brauchen immer deine Wallet-Aktion.',
      'Wer nach „Company Wallet“ oder Seed Phrase für HyperGain fragt, ist nicht wir. Keys offline halten, nur den offiziellen Agent-Flow in der App freigeben.',
    ],
  },
  'profit-trailing': {
    title: 'Profit-Trailing',
    description: 'Wie Gewinner getrailt werden und wann ein Pullback geschnitten wird.',
    body: [
      'Wird eine Position profitabel, kann der Agent einen Trailing-Stop schärfen, der dem Preis folgt und bei definiertem Pullback schließt — ohne jede Kerze zu watchen.',
      'Longs: Trail unter dem High, zieht nach oben. Shorts: Trail über dem Low, zieht nach unten.',
      'Der Trail darf nie auf der falschen Marktseite sitzen. Wirkt er verdreht: Agent stoppen und Position im Terminal prüfen.',
      'Pro-Position „let run“ überschreibt den Trail nur für diese Coin, wenn du es einschaltest. Default: Trail möglich im Profit, wenn let run aus ist.',
    ],
  },
  leaderboard: {
    title: 'On-Chain-Leaderboard',
    description: 'Warum Closes öffentlich sind und wie du auf HypurrScan verifizierst.',
    body: [
      'Marketing-Screenshots sind leicht zu faken. Das öffentliche HyperGain-Leaderboard hängt an echten Hyperliquid-Closes aus Agent-Aktivität.',
      'Wallets sind auf der Site maskiert. Volle Adressen und Fills auf HypurrScan und anderen HL-Explorern.',
      'Board = Transparenz, kein Yield-Versprechen. Vergangene Ergebnisse predikten nicht die Zukunft — Hebel-Trading kann schnell Geld kosten.',
    ],
  },
  fees: {
    title: 'Gebühren',
    description: 'Hyperliquid-Trading-Fees, Builder-Fees und Plattform-Success-Fees.',
    body: [
      'Hyperliquid berechnet Trading-Fees auf Perp-Fills (Maker/Taker je nach Fill). Die fallen auf HL an — mit oder ohne HyperGain.',
      'HyperGain kann Builder-Fees auf HL-Orders und Subscription-Tiers für Agent-Zugang berechnen. Aktuelle Zahlen: Pricing und App.',
      'Platform-Success-Fees typischerweise nur bei profitablen Agent-Closes — siehe Terms/App. Verlust-Closes sind kein „Success“.',
      'Einzahlung/Bridge nach Hyperliquid ohne extra HyperGain-Deposit-Fee — siehe „Deposit successful“. Genug Free Margin für HL-Fees und Moves lassen.',
    ],
  },
  'depositing-bridging-hyperliquid': {
    title: 'Einzahlen / Bridgen auf Hyperliquid',
    description:
      'So bridgt HyperGain natives Arbitrum-USDC auf dein Hyperliquid-Konto — Wallet-Sign, Arbitrum-Confirm, dann HL-Credit.',
    body: [
      'Funds → Deposit in HyperGain. Wallet auf Arbitrum One, nur natives USDC — kein BNB/BSC, kein ETH-Mainnet, kein USDC anderer Chains.',
      'Nach Signatur: Depositing to Hyperliquid mit Wallet signed → Arbitrum confirmed → Hyperliquid credit. Die ersten beiden oft schnell; HL-Credit ca. 1–3 Min.',
      'Arbitrum-Tx und HypurrScan-Wallet im Modal prüfen. Bis HL-Credit fertig ist, erscheint neues USDC nicht als Trading-Balance.',
      'Keine Custody in eine Firmen-Wallet. Deposit landet auf deinem HL-Konto. Falsche Chain/Variante creditet falsch.',
    ],
  },
  'deposit-successful-no-extra-fees': {
    title: 'Deposit erfolgreich — keine HyperGain-Deposit-Fee',
    description:
      'Nach HL-Credit siehst du USDC auf dem Hyperliquid-Saldo. HyperGain verlangt keine extra Deposit-/Bridge-Fee — nur HL-/Netzwerk-Fees.',
    body: [
      'Wenn die Bridge fertig ist: Deposit successful mit Betrag und neuem HL-Total. Done bringt dich zurück zu Funds.',
      'HyperGain verlangt nichts Extra für Deposit/Bridge. Kein Markup, kein Bridge-Aufschlag, keine „Processing“-Fee oben drauf.',
      'Arbitrum-Gas und HL-Protokollkosten der Deposit-Strecke können anfallen — das sind Chain-/HL-Fees, keine HyperGain-Fees.',
      'Späteres Trading folgt HL-Trading-Fees und ggf. HyperGain Success-/Builder-Fees unter Gebühren. Der Deposit selbst bleibt ohne HyperGain-Aufschlag.',
    ],
  },
  'sports-betting': {
    title: 'AI Sports Betting',
    description: 'Outcome-Märkte aus HL Spot — gleiches non-custodial Modell.',
    body: [
      'HyperGain zeigt auch Hyperliquid-Outcome-Märkte für Sport und Macro. Funding aus HL-Spot — gleiches non-custodial Modell wie der Agent.',
      'Yes/No zu Live-Odds, Stake den du tragen kannst, Open Bets in der App. Cash-out wenn Liquidität da ist, oder bis Settlement halten.',
      'Odds und Size hängen von HL-Liquidität ab. Dünne Books = weitere Spreads oder limitierter Cash-out. Kein Sportsbook-Deposit-Konto; Funds bleiben auf Hyperliquid.',
    ],
  },
};

function langBase(lang: string): string {
  return (lang || 'en').toLowerCase().split('-')[0] || 'en';
}

/** True when article body falls back to English for this UI language. */
export function docsArticlesAreEnglishFallback(lang: string): boolean {
  return !DOCS_ARTICLE_LOCALES.has(langBase(lang));
}

export function getDocsArticle(slug: string, lang = 'en'): DocsArticle | undefined {
  const base = ARTICLES.find((a) => a.slug === slug);
  if (!base) return undefined;
  if (langBase(lang) === 'de') {
    const de = DE_ARTICLES[slug];
    if (de) return { ...base, ...de };
  }
  return base;
}

export function getAllDocsArticles(lang = 'en'): DocsArticle[] {
  return ARTICLES.map((a) => getDocsArticle(a.slug, lang)!);
}

export function getDocsSections(
  lang: string,
  sectionTitle: (id: DocsSectionId) => string
): DocsSection[] {
  const articles = getAllDocsArticles(lang);
  return [
    {
      id: 'introduction',
      title: sectionTitle('introduction'),
      items: articles.filter((a) => a.section === 'introduction'),
    },
    {
      id: 'getting-started',
      title: sectionTitle('getting-started'),
      items: articles.filter((a) => a.section === 'getting-started'),
    },
    {
      id: 'agent',
      title: sectionTitle('agent'),
      items: articles.filter((a) => a.section === 'agent'),
    },
    {
      id: 'funds',
      title: sectionTitle('funds'),
      items: articles.filter((a) => a.section === 'funds'),
    },
    {
      id: 'betting',
      title: sectionTitle('betting'),
      items: articles.filter((a) => a.section === 'betting'),
    },
  ];
}
