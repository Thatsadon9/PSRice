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
import Select from '@/components/ui/Select';
import Tabs from '@/components/ui/Tabs';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { APPROVAL_STATUS_LABELS, EMPLOYEE_REQUEST_TYPE_LABELS } from '@/lib/constants';
import { uploadFile } from '@/lib/storage';
import { insertNotifications } from '@/lib/reviewHelpers';
import { buildEmployeeRequestCreatedNotifications, getRequestApprovers } from '@/lib/requestHelpers';

type RequestFilter = 'pending' | 'approved' | 'rejected' | 'all';

const statusVariantMap = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
} as const;

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
    request_type: 'leave' as 'leave' | 'advance' | 'expense',
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

    try {
      const uploadedUrls = (await Promise.all(files.map(async (file) => {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        return uploadFile('proofs', `requests/${currentUser.id}/${Date.now()}-${sanitizedName}`, file);
      }))).filter((url): url is string => Boolean(url));

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
        setSubmitting(false);
        return;
      }

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
      console.error('Failed to submit employee request', error);
    }

    setSubmitting(false);
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">คำขอและรายงาน</h1>
          <p className="text-sm text-slate-500 mt-1">ยื่นลา เบิกเงินล่วงหน้า หรือเบิกค่าใช้จ่ายได้จากหน้านี้</p>
        </div>
        <Button size="sm" onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
          สร้างคำขอ
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-amber-50 border-amber-100">
          <p className="text-[11px] text-amber-700">รออนุมัติ</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{summary.pending}</p>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <p className="text-[11px] text-emerald-700">อนุมัติแล้ว</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{summary.approved}</p>
        </Card>
        <Card className="bg-red-50 border-red-100">
          <p className="text-[11px] text-red-700">ไม่อนุมัติ</p>
          <p className="text-2xl font-bold text-red-900 mt-1">{summary.rejected}</p>
        </Card>
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
          <Card className="text-center py-10">
            <ReceiptText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">ยังไม่มีคำขอในหมวดนี้</p>
          </Card>
        ) : (
          filteredRequests.map((request) => (
            <Card key={request.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{request.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{EMPLOYEE_REQUEST_TYPE_LABELS[request.request_type]}</p>
                </div>
                <Badge variant={statusVariantMap[request.status]}>
                  {APPROVAL_STATUS_LABELS[request.status]}
                </Badge>
              </div>

              {request.description && (
                <p className="text-sm text-slate-600">{request.description}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
              </div>

              {request.attachment_urls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">ไฟล์แนบ</p>
                  <div className="flex flex-wrap gap-2">
                    {request.attachment_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        เปิดไฟล์แนบ
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {request.review_note && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">หมายเหตุจากผู้อนุมัติ</p>
                  <p className="text-sm text-slate-700 mt-1">{request.review_note}</p>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }} title="สร้างคำขอใหม่" bottomSheet>
        <div className="space-y-4">
          <Select
            label="ประเภทคำขอ"
            value={form.request_type}
            onChange={(event) => setForm((current) => ({ ...current, request_type: event.target.value as typeof current.request_type }))}
            options={[
              { value: 'leave', label: EMPLOYEE_REQUEST_TYPE_LABELS.leave },
              { value: 'advance', label: EMPLOYEE_REQUEST_TYPE_LABELS.advance },
              { value: 'expense', label: EMPLOYEE_REQUEST_TYPE_LABELS.expense },
            ]}
          />
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
            <label className="flex flex-col items-center gap-2 text-center cursor-pointer">
              <div className="p-3 rounded-full bg-slate-100">
                <FileUp className="w-5 h-5 text-slate-500" />
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
                  <span key={file.name} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
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
            <Button variant="secondary" fullWidth onClick={() => { setIsModalOpen(false); resetForm(); }}>
              ยกเลิก
            </Button>
            <Button fullWidth loading={submitting} onClick={() => void handleSubmit()} icon={<CalendarRange className="w-4 h-4" />}>
              ส่งคำขอ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
