-- ==========================================
-- WorkFlow Pro — Migration: Admin Only Branches
-- ==========================================

-- Add the `admin_only` column to the `branches` table
-- Default is false to preserve existing behavior for all branches
ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS admin_only BOOLEAN NOT NULL DEFAULT false;

-- Update RLS policies for branches if needed
-- Assuming employees can read all branches, but we can enforce admin_only at the database level if desired.
-- Right now, the application code filters it out, so no RLS changes are strictly necessary, 
-- but you can add them if you want strict DB-level enforcement.
