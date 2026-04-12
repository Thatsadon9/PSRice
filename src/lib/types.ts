// ==========================================
// WorkFlow Pro — Type Definitions
// ==========================================

// ---- Enums ----

export type UserRole = 'admin' | 'manager' | 'employee';
export type UserStatus = 'active' | 'inactive';

export type AttendanceType = 'check_in' | 'check_out';
export type AttendanceStatus =
  | 'not_checked_in'
  | 'checked_in'
  | 'late'
  | 'checked_out'
  | 'out_of_area'
  | 'gps_unavailable'
  | 'failed_verification';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'overdue';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProofType = 'photo' | 'video' | 'text' | 'checklist' | 'any';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'once';
export type FileType = 'image' | 'video' | 'document';
export type NotificationType = 'task' | 'attendance' | 'review' | 'system';

// ---- Interfaces ----

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  branch_id: string;
  team_id: string;
  status: UserStatus;
  avatar_url?: string;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  branch_id: string;
  type: AttendanceType;
  photo_url: string;
  latitude: number;
  longitude: number;
  gps_accuracy: number;
  verified_in_geofence: boolean;
  device_info: DeviceInfo;
  created_at: string;
  server_timestamp: string;
  status: AttendanceStatus;
  notes: string;
  image_hash?: string;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  proof_type_required: ProofType;
  requires_approval: boolean;
  recurrence_rule: RecurrenceType;
  checklist_json: ChecklistItem[];
  branch_id: string;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Task {
  id: string;
  template_id?: string;
  assigned_to: string;
  assigned_role?: string;
  due_date: string;
  status: TaskStatus;
  checklist_state?: ChecklistItem[];
  title?: string;
  description?: string;
  priority?: Priority;
  proof_type_required?: ProofType;
  created_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  submitted_by: string;
  note: string;
  submitted_at: string;
  review_status: ReviewStatus;
  review_rating?: number | null;
  review_comment?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  file_url: string;
  file_type: FileType;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link?: string;
  created_at: string;
}

// ---- GPS Types ----

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface GeofenceResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  branchName: string;
  allowedRadius: number;
}

// ---- UI Types ----

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface StatCard {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  change?: number;
}
