-- Avoid re-posting the same archived flyer to X.

ALTER TABLE public.trade_flyers
  ADD COLUMN IF NOT EXISTS posted_to_x_at timestamptz;

CREATE INDEX IF NOT EXISTS trade_flyers_unposted_idx
  ON public.trade_flyers (created_at DESC)
  WHERE posted_to_x_at IS NULL;
