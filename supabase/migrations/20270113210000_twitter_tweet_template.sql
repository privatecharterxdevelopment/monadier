-- Editable tweet body template for X auto-posts (placeholders filled at compose time).

ALTER TABLE public.twitter_settings
  ADD COLUMN IF NOT EXISTS tweet_template text;

COMMENT ON COLUMN public.twitter_settings.tweet_template IS
  'Optional tweet template. Placeholders: {{brand}} {{site}} {{handle}} {{activeBots}} {{closes24h}} {{wins24h}} {{winRate24h}} {{grossPnl24h}} {{topCoins}}. Empty = AI/fallback composer.';
