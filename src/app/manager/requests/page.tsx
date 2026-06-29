'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  ReceiptText,
  UserRoundPlus,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input, { TextArea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Page, PageHeader } from '@/components/ui/Page';
import Select from '@/components/ui/Select';
import Tabs from '@/components/ui/Tabs';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { insertNotifications } from '@/lib/reviewHelpers';
import {
  buildEmployeeRequestResultNotification,
  buildRegistrationResultNotification,
} from '@/lib/requestHelpers';
import { APPROVAL_STATUS_LABELS, EMPLOYEE_REQUEST_TYPE_LABELS, ROLE_LABELS } from '@/lib/constants';
import type { EmployeeRequest, RegistrationRequest } from '@/lib/types';

type ManagerTab = 'requests' | 'registrations';
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const statusVariantMap = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
} as const;

export default function ManagerRequestsPage() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') === 'registrations' ? 'registrations' : 'requests';
  const { currentUser } = useAuthStore();
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const users = useEmployeeStore((state) => state.users).filter(u => u.status !== 'inactive');
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);
  const employeeRequests = useHrStore((state) => state.employeeRequests);
  const registrationRequests = useHrStore((state) => state.registrationRequests);
  const reviewEmployeeRequest = useHrStore((state) => state.reviewEmployeeRequest);
  const reviewRegistrationRequest = useHrStore((state) => state.reviewRegistrationRequest);

  const [manualActiveTab, setManualActiveTab] = useState<ManagerTab | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedRequest, setSelectedRequest] = useState<EmployeeRequest | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationRequest | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [registrationBranchId, setRegistrationBranchId] = useState('');
  const [registrationTeamId, setRegistrationTeamId] = useState('');
  const activeTab = manualActiveTab || requestedTab;

  const scopedEmployeeRequests = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return employeeRequests.filter((request) => {
      if (currentUser.role === 'admin') {
        return true;
      }

      return request.branch_id === currentUser.branch_id;
    });
  }, [currentUser, employeeRequests]);

  const scopedRegistrationRequests = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return registrationRequests.filter((request) => {
      if (currentUser.role === 'admin') {
        return true;
      }

      return request.desired_branch_id === currentUser.branch_id;
    });
  }, [currentUser, registrationRequests]);

  const filteredEmployeeRequests = useMemo(() => {
    if (statusFilter === 'all') {
      return scopedEmployeeRequests;
    }

    return scopedEmployeeRequests.filter((request) => request.status === statusFilter);
  }, [scopedEmployeeRequests, statusFilter]);

  const filteredRegistrationRequests = useMemo(() => {
    if (statusFilter === 'all') {
      return scopedRegistrationRequests;
    }

    return scopedRegistrationRequests.filter((request) => request.status === statusFilter);
  }, [scopedRegistrationRequests, statusFilter]);

  const employeeRequestCounts = useMemo(() => ({
    pending: scopedEmployeeRequests.filter((request) => request.status === 'pending').length,
    approved: scopedEmployeeRequests.filter((request) => request.status === 'approved').length,
    rejected: scopedEmployeeRequests.filter((request) => request.status === 'rejected').length,
  }), [scopedEmployeeRequests]);

  const registrationCounts = useMemo(() => ({
    pending: scopedRegistrationRequests.filter((request) => request.status === 'pending').length,
    approved: scopedRegistrationRequests.filter((request) => request.status === 'approved').length,
    rejected: scopedRegistrationRequests.filter((request) => request.status === 'rejected').length,
  }), [scopedRegistrationRequests]);

  if (!currentUser) {
    return null;
  }

  const resetReviewState = () => {
    setSelectedRequest(null);
    setSelectedRegistration(null);
    setDecision('approved');
    setReviewNote('');
    setRegistrationBranchId('');
    setRegistrationTeamId('');
  };

  const openRequestReview = (request: EmployeeRequest) => {
    setSelectedRequest(request);
    setSelectedRegistration(null);
    setDecision('approved');
    setReviewNote(request.review_note || '');
  };

  const openRegistrationReview = (request: RegistrationRequest) => {
    setSelectedRegistration(request);
    setSelectedRequest(null);
    setDecision('approved');
    setReviewNote(request.review_note || '');
    setRegistrationBranchId(request.desired_branch_id || currentUser.branch_id || '');
    setRegistrationTeamId(request.team_id || '');
  };

  const handleReviewRequest = async () => {
    if (!selectedRequest) {
      return;
    }

    setReviewing(true);
    const success = await reviewEmployeeRequest(selectedRequest.id, decision, currentUser.id, reviewNote);

    if (success) {
      const requester = users.find((user) => user.id === selectedRequest.user_id);
      if (requester) {
        await insertNotifications([
          buildEmployeeRequestResultNotification(selectedRequest, currentUser.full_name, decision, requester.id),
        ]);
      }
      resetReviewState();
    }

    setReviewing(false);
  };

  const handleReviewRegistration = async () => {
    if (!selectedRegistration) {
      return;
    }

    setReviewing(true);
    const linkedUser = users.find((user) => user.email.toLowerCase() === selectedRegistration.email.toLowerCase());
    const success = await reviewRegistrationRequest(
      selectedRegistration.id,
      decision,
      currentUser.id,
      reviewNote,
      {
        branch_id: registrationBranchId || null,
        team_id: registrationTeamId || null,
      },
    );

    if (success) {
      await fetchUsers();
      if (linkedUser && decision === 'approved') {
        await insertNotifications([
          buildRegistrationResultNotification(currentUser.full_name, decision, linkedUser.id),
        ]);
      }
      resetReviewState();
    }

    setReviewing(false);
  };

  const isModalOpen = Boolean(selectedRequest || selectedRegistration);

  return (
    <Page maxWidth="xl" className="space-y-6">
      <PageHeader
        title="คำขอและอนุมัติ"
        description="รวมคำขอของพนักงานและคำขอสมัครใช้งานใหม่ไว้ในหน้าจัดการเดียว"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-amber-50 border-amber-100">
          <p className="text-xs text-amber-700">คำขอพนักงานรออนุมัติ</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{employeeRequestCounts.pending}</p>
        </Card>
        <Card className="bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700">สมัครพนักงานใหม่รออนุมัติ</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{registrationCounts.pending}</p>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <p className="text-xs text-emerald-700">อนุมัติแล้วทั้งหมด</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{employeeRequestCounts.approved + registrationCounts.approved}</p>
        </Card>
        <Card className="bg-red-50 border-red-100">
          <p className="text-xs text-red-700">ไม่อนุมัติทั้งหมด</p>
          <p className="text-2xl font-bold text-red-900 mt-1">{employeeRequestCounts.rejected + registrationCounts.rejected}</p>
        </Card>
      </div>

      <Tabs
        variant="pill"
        activeTab={activeTab}
        onChange={(tabId) => setManualActiveTab(tabId as ManagerTab)}
        tabs={[
          { id: 'requests', label: 'คำขอพนักงาน', icon: <ReceiptText className="w-4 h-4" />, count: scopedEmployeeRequests.length },
          { id: 'registrations', label: 'สมัครพนักงานใหม่', icon: <UserRoundPlus className="w-4 h-4" />, count: scopedRegistrationRequests.length },
        ]}
      />

      <Tabs
        variant="pill"
        activeTab={statusFilter}
        onChange={(tabId) => setStatusFilter(tabId as StatusFilter)}
        tabs={[
          { id: 'pending', label: 'รออนุมัติ' },
          { id: 'approved', label: 'อนุมัติแล้ว' },
          { id: 'rejected', label: 'ไม่อนุมัติ' },
          { id: 'all', label: 'ทั้งหมด' },
        ]}
      />

      {activeTab === 'requests' ? (
        <div className="space-y-4">
          {filteredEmployeeRequests.length === 0 ? (
            <Card className="text-center py-12">
              <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">ไม่มีคำขอในสถานะนี้</p>
            </Card>
          ) : filteredEmployeeRequests.map((request) => {
            const requester = users.find((user) => user.id === request.user_id);
            const branch = getBranchById(request.branch_id || '');

            return (
              <Card key={request.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{request.title}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {requester?.full_name || 'ไม่ทราบชื่อ'} • {EMPLOYEE_REQUEST_TYPE_LABELS[request.request_type]} • {branch?.name || 'ไม่ระบุสาขา'}
                    </p>
                  </div>
                  <Badge variant={statusVariantMap[request.status]}>
                    {APPROVAL_STATUS_LABELS[request.status]}
                  </Badge>
                </div>

                {request.description && (
                  <p className="text-sm text-slate-600">{request.description}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {request.amount != null && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">จำนวนเงิน</p>
                      <p className="font-semibold text-slate-900 mt-1">
                        {new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(request.amount)}
                      </p>
                    </div>
                  )}
                  {(request.start_date || request.end_date) && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">ช่วงวันที่</p>
                      <p className="font-semibold text-slate-900 mt-1">
                        {request.start_date || '-'}{request.end_date && request.end_date !== request.start_date ? ` ถึง ${request.end_date}` : ''}
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">ส่งคำขอเมื่อ</p>
                    <p className="font-semibold text-slate-900 mt-1">{new Date(request.created_at).toLocaleString('th-TH')}</p>
                  </div>
                </div>

                {request.attachment_urls.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {request.attachment_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        เปิดไฟล์แนบ
                      </a>
                    ))}
                  </div>
                )}

                {request.review_note && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">หมายเหตุการอนุมัติ</p>
                    <p className="text-sm text-slate-700 mt-1">{request.review_note}</p>
                  </div>
                )}

                {request.status === 'pending' && (
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => openRequestReview(request)} icon={<BadgeCheck className="w-4 h-4" />}>
                      ตรวจและตัดสิน
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRegistrationRequests.length === 0 ? (
            <Card className="text-center py-12">
              <UserRoundPlus className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">ไม่มีคำขอสมัครในสถานะนี้</p>
            </Card>
          ) : filteredRegistrationRequests.map((request) => {
            const desiredBranch = getBranchById(request.desired_branch_id || '');
            const linkedUser = users.find((user) => user.email.toLowerCase() === request.email.toLowerCase());

            return (
              <Card key={request.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{request.full_name}</p>
                    <p className="text-sm text-slate-500 mt-1">{request.email} • {request.phone}</p>
                  </div>
                  <Badge variant={statusVariantMap[request.status]}>
                    {APPROVAL_STATUS_LABELS[request.status]}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">สาขาที่ต้องการ</p>
                    <p className="font-semibold text-slate-900 mt-1">{desiredBranch?.name || 'ไม่ระบุ'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">ทีม</p>
                    <p className="font-semibold text-slate-900 mt-1">{request.team_id || '-'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">บัญชีที่สร้างไว้</p>
                    <p className="font-semibold text-slate-900 mt-1">
                      {linkedUser ? `${ROLE_LABELS[linkedUser.role]} / ${linkedUser.status}` : 'ยังไม่พบข้อมูลบัญชี'}
                    </p>
                  </div>
                </div>

                {request.note && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">หมายเหตุผู้สมัคร</p>
                    <p className="text-sm text-slate-700 mt-1">{request.note}</p>
                  </div>
                )}

                {request.review_note && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">หมายเหตุการอนุมัติ</p>
                    <p className="text-sm text-slate-700 mt-1">{request.review_note}</p>
                  </div>
                )}

                {request.status === 'pending' && (
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => openRegistrationReview(request)} icon={<BadgeCheck className="w-4 h-4" />}>
                      ตรวจและตัดสิน
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={resetReviewState} title="ตรวจคำขอ" size="md">
        {selectedRequest && (
          <div className="space-y-4">
            <Select
              label="ผลการพิจารณา"
              value={decision}
              onChange={(event) => setDecision(event.target.value as 'approved' | 'rejected')}
              options={[
                { value: 'approved', label: 'อนุมัติ' },
                { value: 'rejected', label: 'ไม่อนุมัติ' },
              ]}
            />
            <TextArea
              label="หมายเหตุ"
              rows={4}
              placeholder="เช่น อนุมัติแล้ว / ขอเอกสารเพิ่ม"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" fullWidth onClick={resetReviewState}>
                ยกเลิก
              </Button>
              <Button fullWidth loading={reviewing} onClick={() => void handleReviewRequest()}>
                บันทึกผล
              </Button>
            </div>
          </div>
        )}

        {selectedRegistration && (
          <div className="space-y-4">
            <Select
              label="ผลการพิจารณา"
              value={decision}
              onChange={(event) => setDecision(event.target.value as 'approved' | 'rejected')}
              options={[
                { value: 'approved', label: 'อนุมัติ' },
                { value: 'rejected', label: 'ไม่อนุมัติ' },
              ]}
            />
            <Select
              label="สาขาที่จะผูกบัญชี"
              value={registrationBranchId}
              onChange={(event) => setRegistrationBranchId(event.target.value)}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              placeholder="เลือกสาขา"
            />
            <Input
              label="ทีม / กลุ่มงาน"
              value={registrationTeamId}
              onChange={(event) => setRegistrationTeamId(event.target.value)}
              placeholder="เช่น ทีมแพ็กสินค้า"
            />
            <TextArea
              label="หมายเหตุ"
              rows={4}
              placeholder="เช่น อนุมัติแล้ว ให้เริ่มงานวันที่..."
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" fullWidth onClick={resetReviewState}>
                ยกเลิก
              </Button>
              <Button fullWidth loading={reviewing} onClick={() => void handleReviewRegistration()}>
                บันทึกผล
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
