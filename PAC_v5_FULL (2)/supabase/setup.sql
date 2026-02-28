-- PAC Chrome Extension — AI Proxy Tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ═══════════════════════════════════════════════════════════════════════════
-- Feature Requests
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pac_feature_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'planned', 'done', 'wontfix')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pac_features_status ON pac_feature_requests (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Feedback / Bug Reports
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pac_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('bug', 'feedback', 'other')),
  message TEXT NOT NULL,
  extension_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pac_feedback_category ON pac_feedback (category, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Rate Limits
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pac_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pac_rate_limits_user ON pac_rate_limits (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE pac_feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pac_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE pac_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = no public access. Only service role (edge function) can read/write.
