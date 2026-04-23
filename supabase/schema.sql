-- ==========================================
-- PS Rice Wholesale - Supabase Schema
-- ==========================================

-- 1. Create Custom Types (Enums)
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE attendance_type AS ENUM ('check_in', 'check_out');
CREATE TYPE attendance_status AS ENUM ('not_checked_in', 'checked_in', 'late', 'checked_out', 'out_of_area', 'gps_unavailable', 'failed_verification');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'overdue');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE proof_type AS ENUM ('photo', 'video', 'text', 'checklist', 'any');
CREATE TYPE recurrence_type AS ENUM ('daily', 'weekly', 'monthly', 'once');
CREATE TYPE file_type AS ENUM ('image', 'video', 'document');
CREATE TYPE notification_type AS ENUM ('task', 'attendance', 'review', 'system');

-- 2. Create Tables

-- Branches Table
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geofence_radius_meters INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users Table
-- For Phase 2 MVP, we will use a custom users table that isn't strictly tied 
-- to auth.users (Supabase Auth) to allow easy testing with mock logins, 
-- but you can link auth.users.id here later.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'employee',
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  team_id TEXT,
  status user_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  address TEXT,
  citizen_id TEXT,
  citizen_id_card_path TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_book_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attendance Records Table
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type attendance_type NOT NULL,
  photo_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  verified_in_geofence BOOLEAN DEFAULT false,
  device_info JSONB,
  status attendance_status NOT NULL,
  notes TEXT,
  image_hash TEXT,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Task Templates Table
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority priority_level NOT NULL DEFAULT 'medium',
  proof_type_required proof_type NOT NULL DEFAULT 'photo',
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  recurrence_rule recurrence_type NOT NULL DEFAULT 'daily',
  checklist_json JSONB, 
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks Table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_role TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  checklist_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task Submissions Table
CREATE TABLE task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status review_status NOT NULL DEFAULT 'pending',
  review_comment TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Submission Files Table
CREATE TABLE submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type file_type NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Set Up RLS (Row Level Security)
-- For the simplicity of this MVP, we will enable RLS but set very permissive 
-- policies. In a production app, these should be restricted using `auth.uid()`.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow all operations for MVP phase (Anonymous API is allowed)
CREATE POLICY "Allow public access for MVP - Users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Branches" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Attendance" ON attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - TaskTemplates" ON task_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Submissions" ON task_submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Files" ON submission_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access for MVP - Notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- 4. Initial Seed Data (Optional, but highly recommended for testing)

-- Insert HQ Branch
INSERT INTO branches (id, name, address, latitude, longitude, geofence_radius_meters)
VALUES ('b0000000-0000-0000-0000-000000000001', 'PS Rice สำนักงานใหญ่', '123 เขตปทุมวัน กรุงเทพฯ', 13.736717, 100.523186, 100);

-- Insert Demo Users
INSERT INTO users (id, full_name, email, phone, role, branch_id) VALUES 
('a0000000-0000-0000-0000-000000000001', 'วิชัย สมบูรณ์ศิริ (แอดมิน)', 'admin@psrice.co', '0812345678', 'admin', 'b0000000-0000-0000-0000-000000000001'),
('m0000000-0000-0000-0000-000000000001', 'สุชาติ พงศ์ประดิษฐ์ (ผู้จัดการ)', 'manager@psrice.co', '0823456789', 'manager', 'b0000000-0000-0000-0000-000000000001'),
('e0000000-0000-0000-0000-000000000001', 'ปิยะ ธนวัฒน์ (พนักงาน)', 'employee@psrice.co', '0834567890', 'employee', 'b0000000-0000-0000-0000-000000000001');

-- Insert a Sample Task Template
INSERT INTO task_templates (id, title, description, branch_id, checklist_json)
VALUES ('t0000000-0000-0000-0000-000000000001', 'ตรวจเช็คสต็อกข้าวสาร', 'ตรวจสอบจำนวนและสภาพคลังสินค้าประจำวัน', 'b0000000-0000-0000-0000-000000000001', '[{"id": "1", "label": "ตรวจรอยรั่วหรือความชื้น", "completed": false}, {"id": "2", "label": "นับจำนวนกระสอบเข้าใหม่", "completed": false}]');
