-- ==========================================
-- PS Rice — Migration: Check-in Milestone
-- Adds attendance check-in as a daily milestone task
-- with admin-configurable reward per branch.
-- Run this in the Supabase SQL Editor.
-- ==========================================

-- 1. Add check_in_reward to branch_attendance_policies
--    Default ฿50 per successful check-in
ALTER TABLE branch_attendance_policies
  ADD COLUMN IF NOT EXISTS check_in_reward INTEGER NOT NULL DEFAULT 50;

-- 2. Add is_system flag to task_templates
--    Prevents managers from deleting system-generated templates
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- 3. Add reward_amount to tasks
--    Stores the reward amount locked at task creation time
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reward_amount INTEGER;
