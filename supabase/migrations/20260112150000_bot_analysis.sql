-- Bot analysis table for displaying real-time bot status to users
CREATE TABLE IF NOT EXISTS bot_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  signal TEXT NOT NULL, -- 'LONG', 'SHORT', 'HOLD'
  confidence INTEGER DEFAULT 0,
  current_price DECIMAL(20, 8),
  rsi INTEGER,
  macd_signal TEXT,
  volume_spike BOOLEAN DEFAULT false,
  trend TEXT,
  pattern TEXT,
  price_change_24h DECIMAL(10, 4),
  recommendation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint for upsert
  UNIQUE(chain_id, token_address)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bot_analysis_chain ON bot_analysis(chain_id);
CREATE INDEX IF NOT EXISTS idx_bot_analysis_updated ON bot_analysis(updated_at DESC);

-- Enable RLS
ALTER TABLE bot_analysis ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read bot analysis (public data)
CREATE POLICY "bot_analysis_read_all" ON bot_analysis
  FOR SELECT USING (true);

-- Allow service role to insert/update
CREATE POLICY "bot_analysis_service_write" ON bot_analysis
  FOR ALL USING (true) WITH CHECK (true);
