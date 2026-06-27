-- ==========================================
-- PS Rice — Migration: Tasks Approval
-- Adds requires_approval to tasks table
-- ==========================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;
