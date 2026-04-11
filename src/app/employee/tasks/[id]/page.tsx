'use client';

import { useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import {
  ArrowLeft, Calendar, User, Flag, CheckCircle2,
  Square, CheckSquare, Camera, FileText, Send,
  AlertTriangle, Clock, XCircle, ImagePlus
} from 'lucide-react';
import {
  TASK_STATUS_LABELS, PRIORITY_LABELS, PROOF_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
} from '@/lib/constants';
import { formatThaiDate, formatThaiDateTime, formatRelativeTime } from '@/lib/dateUtils';
import { useEmployeeStore } from '@/store/employeeStore';
import type { ChecklistItem, Priority, ProofType } from '@/lib/types';

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proofImages, setProofImages] = useState<string[]>([]);

  if (!currentUser) return null;

  const task = taskStore.getTaskById(id);
  if (!task) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-slate-500">ไม่พบงานนี้</p>
      </div>
    );
  }

  const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
  const submissions = taskStore.getSubmissionsByTask(task.id);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': case 'overdue': return 'danger';
      case 'in_progress': return 'info';
      default: return 'default';
    }
  };

  const getPriorityVariant = (priority?: string) => {
    switch (priority) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'slate';
    }
  };

  const handleChecklistToggle = (itemId: string) => {
    if (!task.checklist_state) return;
    const updated = task.checklist_state.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    taskStore.updateChecklist(task.id, updated);

    if (task.status === 'pending') {
      taskStore.updateTaskStatus(task.id, 'in_progress');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setProofImages(prev => [...prev, event.target!.result as string]);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again if needed
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));

    const submissionId = `sub-${Date.now()}`;
    const now = new Date().toISOString();

    const subRes = await taskStore.addSubmission({
      task_id: task.id,
      submitted_by: currentUser.id,
      note,
      review_status: template?.requires_approval ? 'pending' : 'approved',
    });

    if (subRes) {
      for (let i = 0; i < proofImages.length; i++) {
        await taskStore.addFile({
          submission_id: subRes.id,
          file_url: proofImages[i],
          file_type: 'image',
        });
      }
    }

    await taskStore.updateTaskStatus(task.id, template?.requires_approval ? 'submitted' : 'approved');
    setSubmitted(true);
    setSubmitting(false);
  };

  const canSubmit = (() => {
    if (task.status === 'approved' || task.status === 'submitted') return false;
    const proofRequired = task.proof_type_required || template?.proof_type_required;
    
    if (proofRequired === 'photo' && proofImages.length === 0) return false;
    if (proofRequired === 'text' && !note.trim()) return false;
    if (proofRequired === 'checklist' && task.checklist_state) {
      return task.checklist_state.every(c => c.completed);
    }
    return true;
  })();

  if (submitted) {
    return (
      <div className="px-4 py-4 space-y-4 animate-fade-in">
        <Card>
          <div className="flex flex-col items-center text-center py-8">
            <div className="p-4 rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">ส่งงานเรียบร้อยแล้ว</h3>
            <p className="text-sm text-slate-500">
              {template?.requires_approval ? 'รอผู้จัดการตรวจสอบ' : 'งานเสร็จสมบูรณ์'}
            </p>
            <div className="flex gap-3 mt-4 w-full">
              <Button variant="outline" fullWidth onClick={() => router.push('/employee/tasks')}>
                กลับหน้างาน
              </Button>
              <Button fullWidth onClick={() => router.push('/employee')}>
                หน้าแรก
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-primary-700 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับ
      </button>

      {/* Task Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-900">{task.title || template?.title || 'งาน'}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant={getStatusVariant(task.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'} size="md" dot>
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
          {(task.priority || template?.priority) && (
            <Badge variant={getPriorityVariant(task.priority || template?.priority) as 'danger' | 'warning' | 'info' | 'slate'} size="md">
              <Flag className="w-3 h-3" />
              {PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}
            </Badge>
          )}
        </div>
      </div>

      {/* Task Info */}
      <Card>
        {(task.description || template?.description) && (
          <p className="text-sm text-slate-600 mb-3">{task.description || template?.description}</p>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">กำหนดส่ง:</span>
            <span className="font-medium">{formatThaiDate(task.due_date)}</span>
          </div>
          {(task.proof_type_required || template?.proof_type_required) && (
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">หลักฐานที่ต้องการ:</span>
              <span className="font-medium">{PROOF_TYPE_LABELS[(task.proof_type_required || template?.proof_type_required || 'photo') as ProofType]}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Checklist */}
      {task.checklist_state && task.checklist_state.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            รายการตรวจสอบ ({task.checklist_state.filter(c => c.completed).length}/{task.checklist_state.length})
          </h3>
          <div className="space-y-1">
            {task.checklist_state.map(item => (
              <button
                key={item.id}
                onClick={() => handleChecklistToggle(item.id)}
                disabled={task.status === 'approved' || task.status === 'submitted'}
                className={`
                  w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left
                  transition-colors duration-150
                  ${item.completed ? 'bg-emerald-50' : 'hover:bg-slate-50'}
                  disabled:opacity-70
                `}
              >
                {item.completed ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                )}
                <span className={`text-sm ${item.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Submit Proof (only if not already completed) */}
      {task.status !== 'approved' && task.status !== 'submitted' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">ส่งหลักฐาน</h3>

          {/* Photo proof */}
          {(() => {
            const proofRequired = task.proof_type_required || template?.proof_type_required;
            return (proofRequired === 'photo' || proofRequired === 'any') && (
              <div className="mb-4">
                {proofImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {proofImages.map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg bg-slate-100 overflow-hidden relative">
                        <img src={img} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setProofImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 p-1 bg-black/50 rounded-full"
                        >
                          <XCircle className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={handleImageCapture}
                  icon={<ImagePlus className="w-4 h-4" />}
                >
                  เพิ่มรูปหลักฐาน
                </Button>
              </div>
            );
          })()}

          {/* Note */}
          <TextArea
            id="proof-note"
            label="หมายเหตุ"
            placeholder="ระบุรายละเอียดเพิ่มเติม..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />

          <Button
            fullWidth
            size="lg"
            className="mt-4"
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSubmit}
            icon={<Send className="w-4 h-4" />}
          >
            ส่งงาน
          </Button>

          {!canSubmit && template?.proof_type_required === 'photo' && proofImages.length === 0 && (
            <p className="text-xs text-amber-600 text-center mt-2">
              กรุณาแนบรูปภาพหลักฐานก่อนส่งงาน
            </p>
          )}
        </Card>
      )}

      {/* Submission History */}
      {submissions.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">ประวัติการส่ง</h3>
          <div className="space-y-3">
            {submissions.map(sub => {
              const files = taskStore.getFilesBySubmission(sub.id);
              const reviewer = sub.reviewed_by ? employeeStore.getUserById(sub.reviewed_by) : null;

              const reviewVariant = (() => {
                switch (sub.review_status) {
                  case 'approved': return 'success';
                  case 'rejected': return 'danger';
                  default: return 'warning';
                }
              })() as 'success' | 'danger' | 'warning';

              return (
                <div key={sub.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={reviewVariant} size="sm" dot>
                      {REVIEW_STATUS_LABELS[sub.review_status]}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(sub.submitted_at)}
                    </span>
                  </div>
                  {sub.note && <p className="text-sm text-slate-600 mb-2">{sub.note}</p>}
                  {files.length > 0 && (
                    <div className="flex gap-1.5 mb-2">
                      {files.map(f => (
                        <div key={f.id} className="w-12 h-12 rounded bg-slate-100"></div>
                      ))}
                    </div>
                  )}
                  {sub.review_comment && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2 mt-2">
                      <p className="text-xs text-slate-500 mb-0.5">
                        ความเห็นจาก {reviewer?.full_name || 'ผู้จัดการ'}:
                      </p>
                      <p className="text-sm text-slate-700">{sub.review_comment}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
