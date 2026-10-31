-- Seed HyperGain community with starter posts/comments from real users (excl. manfidalgo).

DO $$
DECLARE
  authors uuid[];
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY created_at DESC NULLS LAST), ARRAY[]::uuid[])
  INTO authors
  FROM (
    SELECT id, created_at
    FROM public.profiles
    WHERE coalesce(username, '') !~* 'manfidalgo'
      AND coalesce(email, '') !~* 'manfidalgo'
      AND coalesce(full_name, '') !~* 'manfidalgo'
      AND coalesce(username, '') !~* 'polupanova'
      AND coalesce(email, '') !~* 'polupanova'
      AND coalesce(full_name, '') !~* 'polupanova'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 24
  ) s;

  IF coalesce(array_length(authors, 1), 0) < 3 THEN
    RAISE NOTICE 'community seed skipped: need at least 3 non-manfidalgo profiles';
    RETURN;
  END IF;

  -- Avoid duplicate seed if already applied
  IF EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE title = 'Best risk % for BTC/ETH on HyperGain bot?'
  ) THEN
    RAISE NOTICE 'community seed already present — skipping';
    RETURN;
  END IF;

  a1 := authors[1 + ((1 - 1) % array_length(authors, 1))];
  a2 := authors[1 + ((2 - 1) % array_length(authors, 1))];
  a3 := authors[1 + ((3 - 1) % array_length(authors, 1))];
  a4 := authors[1 + ((4 - 1) % array_length(authors, 1))];
  a5 := authors[1 + ((5 - 1) % array_length(authors, 1))];
  a6 := authors[1 + ((6 - 1) % array_length(authors, 1))];
  a7 := authors[1 + ((7 - 1) % array_length(authors, 1))];
  a8 := authors[1 + ((8 - 1) % array_length(authors, 1))];

  INSERT INTO public.community_posts (author_id, category, title, body, view_count, created_at)
  VALUES
    (
      a1, 'bot_settings',
      'Best risk % for BTC/ETH on HyperGain bot?',
      'Running the HL bot with 2–3% risk per trade and trail exits. Curious what risk % you use on BTC/ETH without getting stopped by free-margin gates. Any settings that feel stable over a full week?',
      42, now() - interval '2 days'
    ),
    (
      a2, 'referrals',
      'Referral QR share — what converts best?',
      'Sharing the trade flyer + referral QR after wins seems to pull more signups than plain links. Anyone else tracking which channel works better: X, Telegram, or in-person QR?',
      31, now() - interval '36 hours'
    ),
    (
      a3, 'crypto_bots',
      'How do you decide when to pause auto-trade?',
      'I pause the bot before big CPI/FOMC windows and turn it back on after the first candle settles. Looking for a simple checklist other HyperGain users use before leaving auto-trade overnight.',
      58, now() - interval '28 hours'
    ),
    (
      a4, 'betting',
      'Sports bets sizing vs bot equity',
      'Keeping betting size separate from bot equity helped me stop over-risking. Rough rule: betting bankroll ≤ 10% of HL withdrawable. What split are you using?',
      27, now() - interval '22 hours'
    ),
    (
      a5, 'help',
      'Agent approval stuck — what to check first?',
      'If agent approval hangs, I re-check wallet match, Arbitrum USDC, and builder fee approval. Anything else that usually fixes it before opening a support ticket?',
      64, now() - interval '18 hours'
    ),
    (
      a6, 'bot_settings',
      'Win-rate gate: useful or too strict?',
      'Tried win-rate gate at 45% and it blocked too many opens on choppy days. Dropped to 35% and flow looks healthier. Where do you set yours?',
      39, now() - interval '14 hours'
    ),
    (
      a7, 'general',
      'HyperGain tip: read the dock before scaling risk',
      'Before bumping leverage/risk I always check open bot positions + free margin in the dock. Saved me from stacking too many concurrent coins. Simple habit, big difference.',
      73, now() - interval '9 hours'
    ),
    (
      a8, 'crypto_bots',
      'SOL shorts — fee gate surprises?',
      'Had a couple SOL short setups that looked good on scan but fee/trail gates blocked the open. Anyone else seeing that and adjusting trail distance?',
      21, now() - interval '6 hours'
    ),
    (
      a2, 'help',
      'Deposit path that works reliably',
      'Fastest path for me: USDC on Arbitrum → connect same wallet → fund HL. Avoid bridging mid-session. Posting this so new users skip the usual mistakes.',
      88, now() - interval '4 hours'
    ),
    (
      a4, 'referrals',
      'Affiliate dashboard: reading the 2% correctly',
      'Reminder: affiliate cut is on referred profitable bot closes, not deposits. Checking the affiliate section after a good week for your referrals makes the numbers click.',
      19, now() - interval '90 minutes'
    );

  -- Re-select seeded posts by title for comments (stable hooks)
  SELECT id INTO p1 FROM public.community_posts WHERE title = 'Best risk % for BTC/ETH on HyperGain bot?' LIMIT 1;
  SELECT id INTO p2 FROM public.community_posts WHERE title = 'Referral QR share — what converts best?' LIMIT 1;
  SELECT id INTO p3 FROM public.community_posts WHERE title = 'How do you decide when to pause auto-trade?' LIMIT 1;
  SELECT id INTO p4 FROM public.community_posts WHERE title = 'Sports bets sizing vs bot equity' LIMIT 1;
  SELECT id INTO p5 FROM public.community_posts WHERE title = 'Agent approval stuck — what to check first?' LIMIT 1;
  SELECT id INTO p6 FROM public.community_posts WHERE title = 'Win-rate gate: useful or too strict?' LIMIT 1;
  SELECT id INTO p7 FROM public.community_posts WHERE title = 'HyperGain tip: read the dock before scaling risk' LIMIT 1;
  SELECT id INTO p8 FROM public.community_posts WHERE title = 'SOL shorts — fee gate surprises?' LIMIT 1;
  SELECT id INTO p9 FROM public.community_posts WHERE title = 'Deposit path that works reliably' LIMIT 1;
  SELECT id INTO p10 FROM public.community_posts WHERE title = 'Affiliate dashboard: reading the 2% correctly' LIMIT 1;

  INSERT INTO public.community_comments (post_id, author_id, body, created_at)
  VALUES
    (p1, a3, 'I stay around 2% on BTC and 1.5% on alts. Higher than 3% and free margin gets spicy fast.', now() - interval '40 hours'),
    (p1, a5, 'Same — and I keep concurrent positions at 2 max when risk is above 2%.', now() - interval '30 hours'),
    (p2, a1, 'Trade flyer + QR after green closes works best for me. Plain text links underperform.', now() - interval '20 hours'),
    (p3, a6, 'I pause 30 min before major US data and resume after the 5m candle confirms.', now() - interval '16 hours'),
    (p3, a7, 'Also watch funding spikes — I pause if funding goes nuts even without news.', now() - interval '12 hours'),
    (p4, a8, '10% betting bankroll cap is smart. I use a separate mental ledger so bot equity stays clean.', now() - interval '10 hours'),
    (p5, a2, 'Wallet mismatch is the silent killer. Same address on AppKit + HL agent approval fixed it for me.', now() - interval '8 hours'),
    (p6, a1, '35% feels like the sweet spot. 45% was basically off in sideways weeks.', now() - interval '7 hours'),
    (p7, a3, 'Dock check is underrated. Free margin first, then scale risk.', now() - interval '5 hours'),
    (p8, a5, 'Seen it on SOL — trail/fee gate. Slightly wider trail helped without blowing risk.', now() - interval '3 hours'),
    (p9, a4, 'Arbitrum USDC only. Bridging mid-session is where people get stuck.', now() - interval '2 hours'),
    (p10, a6, 'Yep — it is on profitable closes. Waiting for a green referred week makes the dashboard make sense.', now() - interval '45 minutes');

  -- Soft-touch view counts so the feed looks active
  UPDATE public.community_posts
  SET view_count = greatest(view_count, 12 + (abs(hashtext(title)) % 80))
  WHERE title IN (
    'Best risk % for BTC/ETH on HyperGain bot?',
    'Referral QR share — what converts best?',
    'How do you decide when to pause auto-trade?',
    'Sports bets sizing vs bot equity',
    'Agent approval stuck — what to check first?',
    'Win-rate gate: useful or too strict?',
    'HyperGain tip: read the dock before scaling risk',
    'SOL shorts — fee gate surprises?',
    'Deposit path that works reliably',
    'Affiliate dashboard: reading the 2% correctly'
  );
END $$;
