
-- ==========================================
-- WorkFlow Pro - App Settings
-- ==========================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Initialize default check in reward to 50
INSERT INTO public.app_settings (key, value) 
VALUES ('default_check_in_reward', '50')
ON CONFLICT (key) DO NOTHING;

-- Add use_default_check_in_reward to branch_attendance_policies
ALTER TABLE public.branch_attendance_policies
  ADD COLUMN IF NOT EXISTS use_default_check_in_reward BOOLEAN NOT NULL DEFAULT true;

-- Update schema.sql definition if needed, though this is a manual migration
