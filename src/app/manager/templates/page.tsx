'use client';

import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  ClipboardList,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Camera,
  FileText,
} from 'lucide-react';
import { PRIORITY_LABELS, PROOF_TYPE_LABELS, RECURRENCE_LABELS } from '@/lib/constants';
import type { TaskTemplate, Priority, ProofType, RecurrenceType } from '@/lib/types';

const ALL_BRANCH_ID = '__all_branches__';
const ALL_BRANCH_LABEL = 'ทุกสาขา';

type TemplateFormData = {
  title: string;
  description: string;
  priority: Priority;
  proof_type_required: ProofType;
  recurrence_rule: RecurrenceType;
  requires_approval: boolean;
  branch_id: string;
  assigned_to: string;
  reward_amount: string;
};

function createEmptyTemplate(branchId: string): TemplateFormData {
  return {
    title: '',
    description: '',
    priority: 'medium',
    proof_type_required: 'photo',
    recurrence_rule: 'daily',
    requires_approval: true,
    branch_id: branchId,
    assigned_to: '',
    reward_amount: '',
  };
}

export default function TemplateManagementPage() {
  const templates = useTaskStore((state) => state.templates);
  const addTemplate = useTaskStore((state) => state.addTemplate);
  const updateTemplate = useTaskStore((state) => state.updateTemplate);
  const deleteTemplate = useTaskStore((state) => state.deleteTemplate);
  const currentUser = useAuthStore((state) => state.currentUser);
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const users = useEmployeeStore((state) => state.users);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [formError, setFormError] = useState('');
  const [checklistItems, setChecklistItems] = useState<{ id: string; label: string }[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const accessibleBranches = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    if (currentUser.role === 'manager') {
      return branches.filter((branch) => branch.id === currentUser.branch_id);
    }

    return branches;
  }, [branches, currentUser]);

  const canUseAllBranches = currentUser?.role === 'admin';
  const fallbackBranchId = currentUser?.branch_id || accessibleBranches[0]?.id || '';
  const activeBranchId = currentUser?.role === 'manager'
    ? fallbackBranchId
    : selectedBranchId || (canUseAllBranches ? ALL_BRANCH_ID : fallbackBranchId);
  const isAllBranchesView = activeBranchId === ALL_BRANCH_ID;

  const [formData, setFormData] = useState<TemplateFormData>(() => createEmptyTemplate(fallbackBranchId));

  const visibleTemplates = useMemo(() => {
    if (isAllBranchesView) {
      return templates;
    }

    return templates.filter((template) => template.branch_id === activeBranchId);
  }, [activeBranchId, isAllBranchesView, templates]);

  const priorityOptions = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
  const proofOptions = Object.entries(PROOF_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const recurrenceOptions = Object.entries(RECURRENCE_LABELS).map(([value, label]) => ({ value, label }));
  const branchOptions = accessibleBranches.map((branch) => ({ value: branch.id, label: branch.name }));
  const branchFilterOptions = canUseAllBranches
    ? [{ value: ALL_BRANCH_ID, label: ALL_BRANCH_LABEL }, ...branchOptions]
    : branchOptions;
  const templateBranchOptions = editingTemplate?.is_system
    ? [{ value: ALL_BRANCH_ID, label: ALL_BRANCH_LABEL }, ...branchOptions]
    : branchOptions;
  const employeeOptions = users
    .filter((user) => user.role === 'employee' && user.status === 'active' && user.branch_id === formData.branch_id)
    .map((user) => ({ value: user.id, label: user.full_name }));

  const getAssigneeName = (userId?: string | null) => {
    if (!userId) {
      return null;
    }

    return users.find((user) => user.id === userId)?.full_name || null;
  };

  const getTemplateBranchLabel = (template: TaskTemplate) => {
    if (!template.branch_id) {
      return ALL_BRANCH_LABEL;
    }

    return getBranchById(template.branch_id)?.name || '-';
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setFormError('');
    setNewChecklistItem('');
  };

  const handleOpenModal = (template?: TaskTemplate) => {
    setFormError('');
    setNewChecklistItem('');

    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        description: template.description || '',
        priority: template.priority,
        proof_type_required: template.proof_type_required,
        recurrence_rule: template.recurrence_rule,
        requires_approval: template.requires_approval,
        branch_id: template.branch_id || ALL_BRANCH_ID,
        assigned_to: template.assigned_to || '',
        reward_amount: template.reward_amount ? String(template.reward_amount) : '',
      });
      setChecklistItems(template.checklist_json?.map((item) => ({ id: item.id, label: item.label })) || []);
    } else {
      setEditingTemplate(null);
      setFormData(createEmptyTemplate(isAllBranchesView ? fallbackBranchId : activeBranchId));
      setChecklistItems([]);
    }

    setIsModalOpen(true);
  };

  const handleAddChecklist = () => {
    const label = newChecklistItem.trim();

    if (!label) {
      return;
    }

    if (checklistItems.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      setFormError('รายการ checklist นี้มีอยู่แล้ว');
      return;
    }

    setChecklistItems((items) => [...items, { id: `item-${Date.now()}`, label }]);
    setNewChecklistItem('');
    setFormError('');
  };

  const handleSave = async () => {
    const title = formData.title.trim();
    const description = formData.description.trim();

    if (!title) {
      setFormError('กรุณากรอกชื่อต้นแบบงาน');
      return;
    }

    const isSystemTemplate = editingTemplate?.is_system === true;
    const isGlobalSystemTemplate = isSystemTemplate && formData.branch_id === ALL_BRANCH_ID;

    if (!formData.branch_id || (!isGlobalSystemTemplate && formData.branch_id === ALL_BRANCH_ID)) {
      setFormError('กรุณาเลือกสาขาที่เป็นเจ้าของต้นแบบ');
      return;
    }

    const assignee = users.find((user) => user.id === formData.assigned_to);

    if (!isSystemTemplate && (!assignee || assignee.role !== 'employee' || assignee.status !== 'active')) {
      setFormError('กรุณาเลือกพนักงานที่จะรับงานนี้');
      return;
    }

    if (assignee && assignee.branch_id !== formData.branch_id) {
      setFormError('พนักงานที่เลือกต้องอยู่ในสาขาเดียวกับต้นแบบงาน');
      return;
    }

    const payload = {
      ...formData,
      title,
      description,
      branch_id: isGlobalSystemTemplate ? null : formData.branch_id,
      assigned_to: isSystemTemplate ? null : formData.assigned_to,
      reward_amount: formData.reward_amount === '' ? null : Number(formData.reward_amount),
      checklist_json: checklistItems.map((item) => ({
        id: item.id,
        label: item.label,
        completed: false,
      })),
    };

    const success = editingTemplate
      ? await updateTemplate(editingTemplate.id, payload)
      : await addTemplate(payload);

    if (!success) {
      setFormError(editingTemplate ? 'อัปเดตต้นแบบไม่สำเร็จ' : 'สร้างต้นแบบไม่สำเร็จ');
      return;
    }

    handleCloseModal();
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ต้นแบบงานประจำ</h1>
          <p className="text-slate-500 text-sm mt-1">กำหนดรูปแบบงานมาตรฐานแยกตามสาขา เพื่อให้มอบหมายงานได้ตรงพื้นที่ใช้งานจริง</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="สาขา"
            options={branchFilterOptions}
            value={activeBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            disabled={currentUser.role === 'manager' || branchFilterOptions.length === 0}
          />
          <Button
            onClick={() => handleOpenModal()}
            icon={<Plus className="w-4 h-4" />}
            disabled={!fallbackBranchId}
          >
            สร้างต้นแบบใหม่
          </Button>
        </div>
      </div>

      {visibleTemplates.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">ยังไม่มีต้นแบบงานในสาขานี้</p>
            <p className="text-xs text-slate-400 mt-1">สร้างต้นแบบแรกเพื่อใช้มอบหมายงานแบบไม่ต้องกรอกซ้ำ</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleTemplates.map((template) => (
            <Card
              key={template.id}
              className="flex flex-col h-full"
              statusColor={template.priority === 'critical' ? 'red' : template.priority === 'high' ? 'amber' : 'blue'}
            >
              <div className="flex justify-between items-start mb-4">
                <div
                  className={`p-2 rounded-lg ${
                    template.priority === 'critical' ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'
                  }`}
                >
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenModal(template)}
                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-50 rounded-lg"
                    aria-label={`Edit ${template.title}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      await deleteTemplate(template.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    aria-label={`Delete ${template.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-bold text-slate-900 truncate mb-1">{template.title}</h3>
              <p className="text-xs text-slate-500 mb-4 h-8 line-clamp-2">{template.description || 'ไม่มีคำอธิบาย'}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant={template.priority === 'critical' ? 'danger' : template.priority === 'high' ? 'warning' : 'info'}>
                  {PRIORITY_LABELS[template.priority]}
                </Badge>
                <Badge variant="slate">{RECURRENCE_LABELS[template.recurrence_rule]}</Badge>
                <Badge variant="default">{getTemplateBranchLabel(template)}</Badge>
                <Badge variant={template.is_system ? 'success' : template.assigned_to ? 'info' : 'warning'}>
                  {template.is_system
                    ? template.branch_id
                      ? 'ระบบทั้งสาขา'
                      : 'ระบบทุกสาขา'
                    : getAssigneeName(template.assigned_to) || 'ยังไม่เลือกพนักงาน'}
                </Badge>
                <Badge variant="success" dot={template.requires_approval}>
                  {template.requires_approval ? 'ต้องอนุมัติ' : 'ไม่ต้องอนุมัติ'}
                </Badge>
              </div>

              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center text-[11px] text-slate-500 gap-1">
                  <CheckSquare className="w-3 h-3" />
                  {template.checklist_json?.length || 0} รายการย่อย
                </div>
                <div className="flex items-center text-[11px] text-slate-500 gap-1">
                  {template.proof_type_required === 'photo' ? <Camera className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  {PROOF_TYPE_LABELS[template.proof_type_required]}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTemplate ? 'แก้ไขต้นแบบงาน' : 'สร้างต้นแบบงานใหม่'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <Input
            label="หัวข้องาน"
            value={formData.title}
            onChange={(event) => setFormData({ ...formData, title: event.target.value })}
          />
          <TextArea
            label="คำอธิบาย/รายละเอียด"
            rows={3}
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
          />

          <Input
            label="จำนวนเงินรางวัล (บาท) - ปล่อยว่างเพื่อใช้ค่ามาตรฐาน"
            type="number"
            placeholder="เช่น 50, 100"
            value={formData.reward_amount}
            onChange={(event) => setFormData({ ...formData, reward_amount: event.target.value })}
          />

          <Select
            label="สาขาเจ้าของต้นแบบ"
            options={templateBranchOptions}
            value={formData.branch_id}
            onChange={(event) => setFormData({ ...formData, branch_id: event.target.value, assigned_to: '' })}
            disabled={currentUser.role === 'manager' || editingTemplate?.is_system}
          />

          <Select
            label="มอบหมายให้"
            options={employeeOptions}
            placeholder={
              editingTemplate?.is_system
                ? formData.branch_id === ALL_BRANCH_ID
                  ? 'งานระบบใช้ทุกสาขา'
                  : 'งานระบบใช้ทั้งสาขา'
                : employeeOptions.length > 0
                  ? 'เลือกพนักงาน'
                  : 'ไม่มีพนักงานในสาขานี้'
            }
            value={formData.assigned_to}
            onChange={(event) => setFormData({ ...formData, assigned_to: event.target.value })}
            disabled={editingTemplate?.is_system || !formData.branch_id || employeeOptions.length === 0}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="ความสำคัญ"
              options={priorityOptions}
              value={formData.priority}
              onChange={(event) => setFormData({ ...formData, priority: event.target.value as Priority })}
            />
            <Select
              label="ความถี่"
              options={recurrenceOptions}
              value={formData.recurrence_rule}
              onChange={(event) => setFormData({ ...formData, recurrence_rule: event.target.value as RecurrenceType })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="หลักฐานที่ต้องส่ง"
              options={proofOptions}
              value={formData.proof_type_required}
              onChange={(event) => setFormData({ ...formData, proof_type_required: event.target.value as ProofType })}
            />
            <div className="flex flex-col justify-end pb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  checked={formData.requires_approval}
                  onChange={(event) => setFormData({ ...formData, requires_approval: event.target.checked })}
                />
                <span className="text-sm font-medium text-slate-700">ต้องรออนุมัติงาน</span>
              </label>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="text-sm font-medium text-slate-700">รายการตรวจสอบย่อย (Checklist)</label>
            <div className="flex gap-2">
              <Input
                id="new-check-item"
                placeholder="เช่น ล็อคประตูสาขา"
                value={newChecklistItem}
                onChange={(event) => setNewChecklistItem(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddChecklist();
                  }
                }}
              />
              <Button variant="secondary" onClick={handleAddChecklist}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1.5 mt-2">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    {item.label}
                  </div>
                  <button
                    onClick={() => setChecklistItems((items) => items.filter((entry) => entry.id !== item.id))}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={`Remove ${item.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-6">
            <Button variant="secondary" fullWidth onClick={handleCloseModal}>
              ยกเลิก
            </Button>
            <Button fullWidth onClick={handleSave}>
              {editingTemplate ? 'บันทึกการเปลี่ยนแปลง' : 'บันทึกต้นแบบ'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
