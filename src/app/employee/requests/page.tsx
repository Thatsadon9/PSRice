'use client';

import { useMemo, useState } from 'react';
import {
  CalendarRange,
  FileUp,
  Plus,
  ReceiptText,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input, { TextArea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Page, PageHeader, StatTile } from '@/components/ui/Page';
import Tabs from '@/components/ui/Tabs';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { APPROVAL_STATUS_LABELS, EMPLOYEE_REQUEST_TYPE_LABELS } from '@/lib/constants';
import { removeStoredFile, uploadFile } from '@/lib/storage';
import { insertNotifications } from '@/lib/reviewHelpers';
import { buildEmployeeRequestCreatedNotifications, getRequestApprovers } from '@/lib/requestHelpers';

type RequestFilter = 'pending' | 'approved' | 'rejected' | 'all';
type RequestType = 'leave' | 'advance' | 'expense';

const statusVariantMap = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
} as const;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
}

export default function EmployeeRequestsPage() {
  const { currentUser } = useAuthStore();
  const users = useEmployeeStore((state) => state.users);
  const employeeRequests = useHrStore((state) => state.employeeRequests);
  const addEmployeeRequest = useHrStore((state) => state.addEmployeeRequest);
  const [activeTab, setActiveTab] = useState<RequestFilter>('pending');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    request_type: 'leave' as RequestType,
    title: '',
    description: '',
    amount: '',
    start_date: '',
    end_date: '',
  });

  const myRequests = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    return employeeRequests.filter((request) => request.user_id === currentUser.id);
  }, [currentUser, employeeRequests]);

  const filteredRequests = useMemo(() => {
    if (activeTab === 'all') {
      return myRequests;
    }

    return myRequests.filter((request) => request.status === activeTab);
  }, [activeTab, myRequests]);

  const summary = useMemo(() => ({
    pending: myRequests.filter((request) => request.status === 'pending').length,
    approved: myRequests.filter((request) => request.status === 'approved').length,
    rejected: myRequests.filter((request) => request.status === 'rejected').length,
  }), [myRequests]);

  if (!currentUser) {
    return null;
  }

  const resetForm = () => {
    setFormError('');
    setForm({
      request_type: 'leave',
      title: '',
      description: '',
      amount: '',
      start_date: '',
      end_date: '',
    });
    setFiles([]);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (form.request_type === 'leave' && !form.start_date) {
      setFormError('กรุณาเลือกวันที่ลาอย่างน้อย 1 วัน');
      return;
    }

    if (form.request_type !== 'leave' && !form.amount) {
      setFormError('กรุณาระบุจำนวนเงิน');
      return;
    }

    setFormError('');
    setSubmitting(true);
    let uploadedUrls: string[] = [];
    let requestCreated = false;

    try {
      uploadedUrls = (await Promise.all(files.map(async (file, index) => {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        return uploadFile('proofs', `requests/${currentUser.id}/${Date.now()}-${index}-${sanitizedName}`, file);
      }))).filter((url): url is string => Boolean(url));

      if (uploadedUrls.length !== files.length) {
        throw new Error('อัปโหลดไฟล์แนบไม่ครบ กรุณาลองใหม่อีกครั้ง');
      }

      const title = form.title.trim() || EMPLOYEE_REQUEST_TYPE_LABELS[form.request_type];
      const success = await addEmployeeRequest({
        user_id: currentUser.id,
        branch_id: currentUser.branch_id,
        request_type: form.request_type,
        status: 'pending',
        title,
        description: form.description.trim() || null,
        amount: form.amount ? Number(form.amount) : null,
        start_date: form.request_type === 'leave' ? form.start_date || null : null,
        end_date: form.request_type === 'leave' ? form.end_date || form.start_date || null : null,
        attachment_urls: uploadedUrls,
        review_note: null,
      });

      if (!success) {
        throw new Error('สร้างคำขอไม่สำเร็จ');
      }
      requestCreated = true;

      const approvers = getRequestApprovers(users, currentUser.branch_id);
      await insertNotifications(buildEmployeeRequestCreatedNotifications({
        id: 'preview',
        user_id: currentUser.id,
        branch_id: currentUser.branch_id,
        request_type: form.request_type,
        status: 'pending',
        title,
        description: form.description.trim() || null,
        amount: form.amount ? Number(form.amount) : null,
        start_date: form.request_type === 'leave' ? form.start_date || null : null,
        end_date: form.request_type === 'leave' ? form.end_date || form.start_date || null : null,
        attachment_urls: uploadedUrls,
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, currentUser.full_name, approvers));

      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      if (!requestCreated && uploadedUrls.length > 0) {
        await Promise.all(uploadedUrls.map((url) => removeStoredFile('proofs', url)));
      }
      console.error('Failed to submit employee request', error);
      setFormError(error instanceof Error ? error.message : 'สร้างคำขอไม่สำเร็จ');
    }

    setSubmitting(false);
  };

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        title="คำขอของฉัน"
        description="ส่งคำขอลา เบิกเงินล่วงหน้า และเบิกค่าใช้จ่าย"
        action={(
          <Button size="sm" onClick={() => setIsModalOpen(true)} icon={<Plus className="h-4 w-4" />}>
            สร้างคำขอ
          </Button>
        )}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="รออนุมัติ" value={summary.pending} tone="amber" />
        <StatTile label="อนุมัติ" value={summary.approved} tone="green" />
        <StatTile label="ไม่อนุมัติ" value={summary.rejected} tone="red" />
      </div>

      <Tabs
        variant="pill"
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as RequestFilter)}
        tabs={[
          { id: 'pending', label: 'รออนุมัติ', count: summary.pending },
          { id: 'approved', label: 'อนุมัติ', count: summary.approved },
          { id: 'rejected', label: 'ไม่อนุมัติ', count: summary.rejected },
          { id: 'all', label: 'ทั้งหมด', count: myRequests.length },
        ]}
      />

      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <Card className="p-8 text-center">
            <ReceiptText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">ยังไม่มีคำขอในหมวดนี้</p>
          </Card>
        ) : (
          filteredRequests.map((request) => (
            <Card key={request.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{request.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{EMPLOYEE_REQUEST_TYPE_LABELS[request.request_type]}</p>
                </div>
                <Badge variant={statusVariantMap[request.status]}>
                  {APPROVAL_STATUS_LABELS[request.status]}
                </Badge>
              </div>

              {request.description && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-600">{request.description}</p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {request.amount != null && (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">จำนวนเงิน</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatCurrency(request.amount)}</p>
                  </div>
                )}
                {(request.start_date || request.end_date) && (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">ช่วงวันที่</p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {request.start_date || '-'}{request.end_date && request.end_date !== request.start_date ? ` ถึง ${request.end_date}` : ''}
                    </p>
                  </div>
                )}
              </div>

              {request.attachment_urls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.attachment_urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      เปิดไฟล์แนบ
                    </a>
                  ))}
                </div>
              )}

              {request.review_note && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">หมายเหตุจากผู้อนุมัติ</p>
                  <p className="mt-1 text-sm text-slate-700">{request.review_note}</p>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="สร้างคำขอใหม่" bottomSheet>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['leave', 'advance', 'expense'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm((current) => ({ ...current, request_type: type }))}
                className={`min-h-10 rounded-xl border px-2 text-xs font-semibold ${
                  form.request_type === type
                    ? 'border-primary-500 bg-primary-50 text-primary-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {EMPLOYEE_REQUEST_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          <Input
            label="หัวข้อคำขอ"
            placeholder="เช่น ลากิจ 1 วัน"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
          <TextArea
            label="รายละเอียด"
            rows={4}
            placeholder="ระบุรายละเอียดเพิ่มเติม"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />

          {form.request_type === 'leave' ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="วันที่เริ่ม"
                type="date"
                value={form.start_date}
                onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
              />
              <Input
                label="วันที่สิ้นสุด"
                type="date"
                value={form.end_date}
                onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
              />
            </div>
          ) : (
            <Input
              label="จำนวนเงิน"
              type="number"
              placeholder="0.00"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
          )}

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-slate-100 p-3">
                <FileUp className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">แนบไฟล์ประกอบ</p>
                <p className="text-xs text-slate-500">รองรับรูป, วิดีโอ, PDF หรือเอกสารประกอบ</p>
              </div>
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </label>
            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((file) => (
                  <span key={file.name} className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={closeModal}>
              ยกเลิก
            </Button>
            <Button fullWidth loading={submitting} onClick={() => void handleSubmit()} icon={<CalendarRange className="h-4 w-4" />}>
              ส่งคำขอ
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
