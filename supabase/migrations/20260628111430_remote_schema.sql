


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."approval_status" OWNER TO "postgres";


CREATE TYPE "public"."attendance_status" AS ENUM (
    'not_checked_in',
    'checked_in',
    'late',
    'checked_out',
    'out_of_area',
    'gps_unavailable',
    'failed_verification'
);


ALTER TYPE "public"."attendance_status" OWNER TO "postgres";


CREATE TYPE "public"."attendance_type" AS ENUM (
    'check_in',
    'check_out'
);


ALTER TYPE "public"."attendance_type" OWNER TO "postgres";


CREATE TYPE "public"."compensation_type" AS ENUM (
    'daily',
    'hourly',
    'monthly'
);


ALTER TYPE "public"."compensation_type" OWNER TO "postgres";


CREATE TYPE "public"."employee_request_type" AS ENUM (
    'leave',
    'advance',
    'expense'
);


ALTER TYPE "public"."employee_request_type" OWNER TO "postgres";


CREATE TYPE "public"."file_type" AS ENUM (
    'image',
    'video',
    'document'
);


ALTER TYPE "public"."file_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'task',
    'attendance',
    'review',
    'system'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."priority_level" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE "public"."priority_level" OWNER TO "postgres";


CREATE TYPE "public"."proof_type" AS ENUM (
    'photo',
    'video',
    'text',
    'checklist',
    'any'
);


ALTER TYPE "public"."proof_type" OWNER TO "postgres";


CREATE TYPE "public"."recurrence_type" AS ENUM (
    'daily',
    'weekly',
    'monthly',
    'once'
);


ALTER TYPE "public"."recurrence_type" OWNER TO "postgres";


CREATE TYPE "public"."review_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


CREATE TYPE "public"."shift_assignment_status" AS ENUM (
    'scheduled',
    'day_off',
    'leave',
    'holiday'
);


ALTER TYPE "public"."shift_assignment_status" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'pending',
    'in_progress',
    'submitted',
    'approved',
    'rejected',
    'overdue'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'employee'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (
    id,
    full_name,
    email,
    phone,
    role,
    branch_id,
    team_id,
    status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'employee',
    null,
    coalesce(new.raw_user_meta_data->>'team_id', ''),
    'active'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;

  insert into public.compensation_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role, status, branch_id)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
    new.email, 
    'employee', 
    'active', 
    'b0000000-0000-0000-0000-000000000001'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "type" "public"."attendance_type" NOT NULL,
    "photo_url" "text",
    "latitude" double precision,
    "longitude" double precision,
    "gps_accuracy" double precision,
    "verified_in_geofence" boolean DEFAULT false,
    "device_info" "jsonb",
    "status" "public"."attendance_status" NOT NULL,
    "notes" "text",
    "image_hash" "text",
    "server_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branch_attendance_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "shift_start_time" time without time zone DEFAULT '08:30:00'::time without time zone NOT NULL,
    "shift_end_time" time without time zone DEFAULT '17:30:00'::time without time zone NOT NULL,
    "break_minutes" integer DEFAULT 60 NOT NULL,
    "late_grace_minutes" integer DEFAULT 15 NOT NULL,
    "early_out_grace_minutes" integer DEFAULT 0 NOT NULL,
    "minimum_ot_minutes" integer DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_in_reward" integer DEFAULT 50 NOT NULL,
    "use_default_check_in_reward" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."branch_attendance_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "geofence_radius_meters" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_only" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compensation_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pay_type" "public"."compensation_type" DEFAULT 'daily'::"public"."compensation_type" NOT NULL,
    "base_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "ot_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "late_deduction_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "absence_deduction_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "leave_deduction_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."compensation_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "request_type" "public"."employee_request_type" NOT NULL,
    "status" "public"."approval_status" DEFAULT 'pending'::"public"."approval_status" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "amount" numeric(12,2),
    "start_date" "date",
    "end_date" "date",
    "attachment_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_shift_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "shift_template_id" "uuid",
    "work_date" "date" NOT NULL,
    "shift_name" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "break_minutes" integer DEFAULT 60 NOT NULL,
    "late_grace_minutes" integer DEFAULT 15 NOT NULL,
    "early_out_grace_minutes" integer DEFAULT 0 NOT NULL,
    "minimum_ot_minutes" integer DEFAULT 30 NOT NULL,
    "status" "public"."shift_assignment_status" DEFAULT 'scheduled'::"public"."shift_assignment_status" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_shift_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "public"."notification_type" DEFAULT 'system'::"public"."notification_type" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registration_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "desired_branch_id" "uuid",
    "team_id" "text",
    "note" "text",
    "status" "public"."approval_status" DEFAULT 'pending'::"public"."approval_status" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registration_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_sales_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "shift_name" "text",
    "cash_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "qr_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "welfare_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shift_sales_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid",
    "name" "text" NOT NULL,
    "code" "text",
    "color" "text" DEFAULT '#0f766e'::"text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "break_minutes" integer DEFAULT 60 NOT NULL,
    "late_grace_minutes" integer DEFAULT 15 NOT NULL,
    "early_out_grace_minutes" integer DEFAULT 0 NOT NULL,
    "minimum_ot_minutes" integer DEFAULT 30 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shift_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "public"."file_type" DEFAULT 'image'::"public"."file_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."submission_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "note" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_status" "public"."review_status" DEFAULT 'pending'::"public"."review_status" NOT NULL,
    "review_comment" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "public"."priority_level" DEFAULT 'medium'::"public"."priority_level" NOT NULL,
    "proof_type_required" "public"."proof_type" DEFAULT 'photo'::"public"."proof_type" NOT NULL,
    "requires_approval" boolean DEFAULT true NOT NULL,
    "recurrence_rule" "public"."recurrence_type" DEFAULT 'daily'::"public"."recurrence_type" NOT NULL,
    "checklist_json" "jsonb",
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_auto_assign" boolean DEFAULT false,
    "auto_assign_day" integer,
    "is_system" boolean DEFAULT false NOT NULL,
    "reward_amount" integer
);


ALTER TABLE "public"."task_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "assigned_to" "uuid",
    "assigned_role" "text",
    "due_date" timestamp with time zone NOT NULL,
    "status" "public"."task_status" DEFAULT 'pending'::"public"."task_status" NOT NULL,
    "checklist_state" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "public"."priority_level",
    "proof_type_required" "public"."proof_type",
    "completion_bonus" numeric(12,2) DEFAULT 0 NOT NULL,
    "reward_amount" integer,
    "requires_approval" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."completion_bonus" IS 'ค่าตอบแทนเพิ่มเติมเมื่องานอนุมัติแล้ว (บาท)';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'employee'::"public"."user_role" NOT NULL,
    "branch_id" "uuid",
    "team_id" "text",
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address" "text",
    "citizen_id" "text",
    "citizen_id_card_path" "text",
    "bank_name" "text",
    "bank_account_name" "text",
    "bank_account_number" "text",
    "bank_book_path" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branch_attendance_policies"
    ADD CONSTRAINT "branch_attendance_policies_branch_id_key" UNIQUE ("branch_id");



ALTER TABLE ONLY "public"."branch_attendance_policies"
    ADD CONSTRAINT "branch_attendance_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compensation_profiles"
    ADD CONSTRAINT "compensation_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compensation_profiles"
    ADD CONSTRAINT "compensation_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."employee_requests"
    ADD CONSTRAINT "employee_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_user_work_date_key" UNIQUE ("user_id", "work_date");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registration_requests"
    ADD CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_sales_reports"
    ADD CONSTRAINT "shift_sales_reports_attendance_id_key" UNIQUE ("attendance_id");



ALTER TABLE ONLY "public"."shift_sales_reports"
    ADD CONSTRAINT "shift_sales_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_templates"
    ADD CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_files"
    ADD CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "attendance_records_branch_created_at_idx" ON "public"."attendance_records" USING "btree" ("branch_id", "created_at" DESC);



CREATE INDEX "attendance_records_user_created_at_idx" ON "public"."attendance_records" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "employee_requests_user_idx" ON "public"."employee_requests" USING "btree" ("user_id", "status");



CREATE INDEX "employee_shift_assignments_user_work_date_idx" ON "public"."employee_shift_assignments" USING "btree" ("user_id", "work_date");



CREATE INDEX "employee_shift_assignments_work_date_idx" ON "public"."employee_shift_assignments" USING "btree" ("work_date");



CREATE INDEX "registration_requests_status_idx" ON "public"."registration_requests" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "users_citizen_id_key" ON "public"."users" USING "btree" ("citizen_id") WHERE ("citizen_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "set_branch_attendance_policies_updated_at" BEFORE UPDATE ON "public"."branch_attendance_policies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "set_compensation_profiles_updated_at" BEFORE UPDATE ON "public"."compensation_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "set_employee_requests_updated_at" BEFORE UPDATE ON "public"."employee_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "set_employee_shift_assignments_updated_at" BEFORE UPDATE ON "public"."employee_shift_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "set_registration_requests_updated_at" BEFORE UPDATE ON "public"."registration_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "set_shift_templates_updated_at" BEFORE UPDATE ON "public"."shift_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."branch_attendance_policies"
    ADD CONSTRAINT "branch_attendance_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compensation_profiles"
    ADD CONSTRAINT "compensation_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_requests"
    ADD CONSTRAINT "employee_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_requests"
    ADD CONSTRAINT "employee_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_requests"
    ADD CONSTRAINT "employee_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_shift_template_id_fkey" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_shift_assignments"
    ADD CONSTRAINT "employee_shift_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registration_requests"
    ADD CONSTRAINT "registration_requests_desired_branch_id_fkey" FOREIGN KEY ("desired_branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registration_requests"
    ADD CONSTRAINT "registration_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_sales_reports"
    ADD CONSTRAINT "shift_sales_reports_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_sales_reports"
    ADD CONSTRAINT "shift_sales_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_sales_reports"
    ADD CONSTRAINT "shift_sales_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_templates"
    ADD CONSTRAINT "shift_templates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submission_files"
    ADD CONSTRAINT "submission_files_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



CREATE POLICY "Allow public access for MVP" ON "public"."attendance_records" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."branches" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."notifications" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."submission_files" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."task_submissions" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."task_templates" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."tasks" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP" ON "public"."users" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - BranchAttendancePolicies" ON "public"."branch_attendance_policies" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - CompensationProfiles" ON "public"."compensation_profiles" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - EmployeeRequests" ON "public"."employee_requests" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - RegistrationRequests" ON "public"."registration_requests" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - ShiftAssignments" ON "public"."employee_shift_assignments" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - ShiftSalesReports" ON "public"."shift_sales_reports" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access for MVP - ShiftTemplates" ON "public"."shift_templates" USING (true) WITH CHECK (true);



CREATE POLICY "Attendance records are visible to assigned users and managers" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "viewer"
  WHERE (("viewer"."id" = "auth"."uid"()) AND ("viewer"."status" = 'active'::"public"."user_status") AND (("viewer"."role" = 'admin'::"public"."user_role") OR (("viewer"."role" = 'manager'::"public"."user_role") AND (("viewer"."branch_id" = "attendance_records"."branch_id") OR ("viewer"."branch_id" IS NULL)))))))));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branch_attendance_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compensation_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_shift_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registration_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_sales_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_records" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."branch_attendance_policies" TO "anon";
GRANT ALL ON TABLE "public"."branch_attendance_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_attendance_policies" TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."compensation_profiles" TO "anon";
GRANT ALL ON TABLE "public"."compensation_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."compensation_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."employee_requests" TO "anon";
GRANT ALL ON TABLE "public"."employee_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_requests" TO "service_role";



GRANT ALL ON TABLE "public"."employee_shift_assignments" TO "anon";
GRANT ALL ON TABLE "public"."employee_shift_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_shift_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."registration_requests" TO "anon";
GRANT ALL ON TABLE "public"."registration_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_requests" TO "service_role";



GRANT ALL ON TABLE "public"."shift_sales_reports" TO "anon";
GRANT ALL ON TABLE "public"."shift_sales_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_sales_reports" TO "service_role";



GRANT ALL ON TABLE "public"."shift_templates" TO "anon";
GRANT ALL ON TABLE "public"."shift_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_templates" TO "service_role";



GRANT ALL ON TABLE "public"."submission_files" TO "anon";
GRANT ALL ON TABLE "public"."submission_files" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_files" TO "service_role";



GRANT ALL ON TABLE "public"."task_submissions" TO "anon";
GRANT ALL ON TABLE "public"."task_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."task_templates" TO "anon";
GRANT ALL ON TABLE "public"."task_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."task_templates" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


  create policy "Authenticated users can delete task and request proofs"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'proofs'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['tasks'::text, 'requests'::text]))));



  create policy "Authenticated users can update task and request proofs"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'proofs'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['tasks'::text, 'requests'::text]))))
with check (((bucket_id = 'proofs'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['tasks'::text, 'requests'::text]))));



  create policy "Authenticated users can upload task and request proofs"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'proofs'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['tasks'::text, 'requests'::text]))));



  create policy "Avatar images are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "Proof files are publicly readable"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'proofs'::text));



  create policy "Users can delete avatars"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'avatars'::text));



  create policy "Users can update avatars"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'avatars'::text));



  create policy "Users can upload avatars"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'avatars'::text));



  create policy "ให้ทุกคนดูรูปใน proofs ได้"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'proofs'::text));



  create policy "ให้ทุกคนลบรูปใน proofs ได้"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'proofs'::text));



  create policy "ให้ทุกคนอัปเดตรูปใน proof"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'proofs'::text));



  create policy "ให้ทุกคนอัปโหลดรูปใน pr"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'proofs'::text));



