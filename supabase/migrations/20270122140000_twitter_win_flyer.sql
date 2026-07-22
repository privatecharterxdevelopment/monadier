-- Daily random winning-trade flyer posts on X (PNG + caption).

ALTER TABLE public.twitter_settings
  ADD COLUMN IF NOT EXISTS win_flyer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS win_flyer_hour_utc integer NOT NULL DEFAULT 16
    CHECK (win_flyer_hour_utc BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS win_flyer_lookback_hours integer NOT NULL DEFAULT 24
    CHECK (win_flyer_lookback_hours BETWEEN 6 AND 168);

COMMENT ON COLUMN public.twitter_settings.win_flyer_enabled IS
  'When true (and auto-post enabled), bot-service posts one random win flyer/day at win_flyer_hour_utc.';
COMMENT ON COLUMN public.twitter_settings.win_flyer_hour_utc IS
  'UTC hour (0–23) to generate/publish the daily win flyer.';
COMMENT ON COLUMN public.twitter_settings.win_flyer_lookback_hours IS
  'How far back to sample profitable closed trades for the daily flyer.';
