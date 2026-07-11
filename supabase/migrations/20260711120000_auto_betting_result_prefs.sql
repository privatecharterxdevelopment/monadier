-- AI betting agent preferences: which result types to bet, and history source tagging.

ALTER TABLE public.vault_settings
  ADD COLUMN IF NOT EXISTS auto_betting_allow_win BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_betting_allow_draw BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_betting_allow_loss BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vault_settings.auto_betting_allow_win IS
  'AI agent may bet on match win / home (or Yes on binary).';
COMMENT ON COLUMN public.vault_settings.auto_betting_allow_draw IS
  'AI agent may bet on draw legs when the market has a Draw outcome.';
COMMENT ON COLUMN public.vault_settings.auto_betting_allow_loss IS
  'AI agent may bet on match loss / away (or No on binary).';

ALTER TABLE public.hl_betting_positions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_agent'));

ALTER TABLE public.hl_betting_closes
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_agent'));

COMMENT ON COLUMN public.hl_betting_positions.source IS
  'How the bet was opened: manual UI or AI agent.';
COMMENT ON COLUMN public.hl_betting_closes.source IS
  'How the bet was opened: manual UI or AI agent.';
