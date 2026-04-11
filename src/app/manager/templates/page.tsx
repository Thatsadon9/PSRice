'use client';

import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { 
  ClipboardList, Plus, Edit2, Trash2, CheckSquare, 
  Camera, FileText, Clock, Calendar, ShieldCheck 
} from 'lucide-react';
import { PRIORITY_LABELS, PROOF_TYPE_LABELS, RECURRENCE_LABELS } from '@/lib/constants';
import type { TaskTemplate, Priority, ProofType, RecurrenceType } from '@/lib/types';

export default function TemplateManagementPage() {
  const taskStore = useTaskStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Priority,
    proof_type_required: 'photo' as ProofType,
    recurrence_rule: 'daily' as RecurrenceType,
    requires_approval: true,
  });

  const [checklistItems, setChecklistItems] = useState<{id: string, label: string}[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const handleOpenModal = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        description: template.description || '',
        priority: template.priority,
        proof_type_required: template.proof_type_required,
        recurrence_rule: template.recurrence_rule,
        requires_approval: template.requires_approval,
      });
      setChecklistItems(template.checklist_json?.map(c => ({ id: c.id, label: c.label })) || []);
    } else {
      setEditingTemplate(null);
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        proof_type_required: 'photo',
        recurrence_rule: 'daily',
        requires_approval: true,
      });
      setChecklistItems([]);
    }
    setIsModalOpen(true);
  };

  const handleAddChecklist = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems([...checklistItems, { id: `item-${Date.now()}`, label: newChecklistItem.trim() }]);
      setNewChecklistItem('');
    }
  };

  const handleSave = async () => {
    const finalData = {
      ...formData,
      checklist_json: checklistItems.map(c => ({ id: c.id, label: c.label, completed: false })),
    };

    if (editingTemplate) {
      await taskStore.updateTemplate(editingTemplate.id, finalData);
    } else {
      const newTemplate = {
        ...finalData,
        branch_id: 'b0000000-0000-0000-0000-000000000001', // Default to HQ or let user select
      };
      await taskStore.addTemplate(newTemplate);
    }
    setIsModalOpen(false);
  };

  const priorityOptions = Object.entries(PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: v }));
  const proofOptions = Object.entries(PROOF_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }));
  const freqOptions = Object.entries(RECURRENCE_LABELS).map(([k, v]) => ({ value: k, label: v }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ต้นแบบงานประจำ</h1>
          <p className="text-slate-500 text-sm mt-1">กำหนดรูปแบบงานมาตรฐานและวิธีการส่งหลักฐาน</p>
        </div>
        <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />}>
          สร้างต้นแบบใหม่
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {taskStore.templates.map(tpl => (
          <Card key={tpl.id} className="flex flex-col h-full" statusColor={tpl.priority === 'critical' ? 'red' : tpl.priority === 'high' ? 'amber' : 'blue'}>
            <div className="flex justify-between items-start mb-4">
               <div className={`p-2 rounded-lg ${tpl.priority === 'critical' ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}>
                  <ClipboardList className="w-5 h-5" />
               </div>
               <div className="flex gap-1">
                  <button onClick={() => handleOpenModal(tpl)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={async () => await taskStore.deleteTemplate(tpl.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
               </div>
            </div>
            
            <h3 className="font-bold text-slate-900 truncate mb-1">{tpl.title}</h3>
            <p className="text-xs text-slate-500 mb-4 h-8 line-clamp-2">{tpl.description || 'ไม่มีคำอธิบาย'}</p>
            
            <div className="flex flex-wrap gap-2 mb-4">
               <Badge variant={tpl.priority === 'critical' ? 'danger' : tpl.priority === 'high' ? 'warning' : 'info'}>
                  {PRIORITY_LABELS[tpl.priority]}
               </Badge>
               <Badge variant="slate">{RECURRENCE_LABELS[tpl.recurrence_rule]}</Badge>
               <Badge variant="success" dot={tpl.requires_approval}>
                  {tpl.requires_approval ? 'ต้องอนุมัติ' : 'ไม่ต้องอนุมัติ'}
               </Badge>
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
               <div className="flex items-center text-[11px] text-slate-500 gap-1">
                  <CheckSquare className="w-3 h-3" />
                  {tpl.checklist_json?.length || 0} รายการย่อย
               </div>
               <div className="flex items-center text-[11px] text-slate-500 gap-1">
                  {tpl.proof_type_required === 'photo' ? <Camera className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  {PROOF_TYPE_LABELS[tpl.proof_type_required]}
               </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingTemplate ? 'แก้ไขต้นแบบงาน' : 'สร้างต้นแบบงานใหม่'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <Input 
            label="หัวข้องาน"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
          />
          <TextArea 
            label="คำอธิบาย/รายละเอียด"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
          
          <div className="grid grid-cols-2 gap-4">
             <Select label="ความสำคัญ" options={priorityOptions} value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value as Priority})} />
             <Select label="ความถี่" options={freqOptions} value={formData.recurrence_rule} onChange={(e) => setFormData({...formData, recurrence_rule: e.target.value as RecurrenceType})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <Select label="หลักฐานที่ต้องส่ง" options={proofOptions} value={formData.proof_type_required} onChange={(e) => setFormData({...formData, proof_type_required: e.target.value as ProofType})} />
             <div className="flex flex-col justify-end pb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                   <input 
                     type="checkbox" 
                     className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                     checked={formData.requires_approval}
                     onChange={(e) => setFormData({...formData, requires_approval: e.target.checked})}
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
                   onChange={(e) => setNewChecklistItem(e.target.value)}
                   onKeyPress={(e) => e.key === 'Enter' && handleAddChecklist()}
                />
                <Button variant="secondary" onClick={handleAddChecklist}><Plus className="w-4 h-4" /></Button>
             </div>
             <div className="space-y-1.5 mt-2">
                {checklistItems.map(item => (
                   <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                      <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                         {item.label}
                      </div>
                      <button onClick={() => setChecklistItems(checklistItems.filter(i => i.id !== item.id))} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                   </div>
                ))}
             </div>
          </div>
          
          <div className="flex gap-3 pt-6">
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึกต้นแบบ</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
