import type {
  ApprovalStatus,
  EmployeeRequest,
  Notification,
  RegistrationRequest,
  User,
} from '@/lib/types';

type NotificationInsert = Omit<Notification, 'id' | 'created_at'>;

function getStatusTitle(status: ApprovalStatus) {
  switch (status) {
    case 'approved':
      return 'อนุมัติแล้ว';
    case 'rejected':
      return 'ไม่อนุมัติ';
    case 'cancelled':
      return 'ยกเลิกแล้ว';
    default:
      return 'รออนุมัติ';
  }
}

export function getRequestApprovers(users: User[], branchId?: string | null) {
  return users.filter((user) => {
    if (user.status !== 'active') {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    return user.role === 'manager' && (!branchId || user.branch_id === branchId);
  });
}

export function buildEmployeeRequestCreatedNotifications(
  request: EmployeeRequest,
  requesterName: string,
  recipients: User[],
): NotificationInsert[] {
  return recipients.map((recipient) => ({
    user_id: recipient.id,
    title: 'มีคำขอใหม่รออนุมัติ',
    message: `${requesterName} ส่ง${request.title} เข้ามารออนุมัติ`,
    type: 'system',
    is_read: false,
    link: '/manager/requests?tab=requests',
  }));
}

export function buildEmployeeRequestResultNotification(
  request: EmployeeRequest,
  reviewerName: string,
  status: ApprovalStatus,
  recipientId: string,
): NotificationInsert {
  return {
    user_id: recipientId,
    title: `คำขอ${getStatusTitle(status)}`,
    message: `${reviewerName} ${status === 'approved' ? 'อนุมัติ' : status === 'rejected' ? 'ปฏิเสธ' : 'อัปเดต'}คำขอ ${request.title}`,
    type: 'system',
    is_read: false,
    link: '/employee/requests',
  };
}

export function buildRegistrationCreatedNotifications(
  registrationRequest: RegistrationRequest,
  recipients: User[],
): NotificationInsert[] {
  return recipients.map((recipient) => ({
    user_id: recipient.id,
    title: 'มีคำขอสมัครพนักงานใหม่',
    message: `${registrationRequest.full_name} ส่งคำขอสมัครใช้งานเข้ามาใหม่`,
    type: 'system',
    is_read: false,
    link: '/manager/requests?tab=registrations',
  }));
}

export function buildRegistrationResultNotification(
  reviewerName: string,
  status: ApprovalStatus,
  recipientId: string,
): NotificationInsert {
  return {
    user_id: recipientId,
    title: `บัญชี${getStatusTitle(status)}`,
    message: `${reviewerName} ${status === 'approved' ? 'อนุมัติ' : status === 'rejected' ? 'ปฏิเสธ' : 'อัปเดต'}คำขอสมัครใช้งานของคุณ`,
    type: 'system',
    is_read: false,
    link: status === 'approved' ? '/login' : '/register',
  };
}
