-- Track Meta cross-posts of win flyers (same PNG as X).
ALTER TABLE public.trade_flyers
  ADD COLUMN IF NOT EXISTS posted_to_ig_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_to_fb_at timestamptz;

CREATE INDEX IF NOT EXISTS trade_flyers_unposted_ig_idx
  ON public.trade_flyers (created_at DESC)
  WHERE posted_to_ig_at IS NULL;

CREATE INDEX IF NOT EXISTS trade_flyers_unposted_fb_idx
  ON public.trade_flyers (created_at DESC)
  WHERE posted_to_fb_at IS NULL;
