'use client';

import { Coins, Info } from 'lucide-react';
import Input from '@/components/ui/Input';

export type UnitRewardFormValues = {
  unit_label: string;
  unit_rate: string;
  unit_step: string;
  unit_min: string;
  unit_max: string;
  target_quantity: string;
};

interface UnitRewardFieldsProps {
  values: UnitRewardFormValues;
  onChange: (patch: Partial<UnitRewardFormValues>) => void;
  className?: string;
}

const inputClassName = 'h-11 bg-white/95 shadow-sm';

export default function UnitRewardFields({
  values,
  onChange,
  className = '',
}: UnitRewardFieldsProps) {
  const unitLabel = values.unit_label.trim() || 'หน่วย';
  const rateLabel = values.unit_rate.trim() ? `฿${values.unit_rate}/${unitLabel}` : `฿0/${unitLabel}`;

  return (
    <div
      className={`
        rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-white
        p-4 shadow-sm ring-1 ring-emerald-50
        ${className}
      `}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70">
            <Coins className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">ค่าตอบแทนตามจำนวน</p>
            <p className="truncate text-xs font-medium text-slate-500">หน่วย ราคา และช่วงจำนวน</p>
          </div>
        </div>
        <span className="inline-flex h-9 w-fit items-center rounded-full border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-700 shadow-sm">
          {rateLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="ชื่อหน่วย"
          placeholder="เช่น กระสอบ"
          value={values.unit_label}
          className={inputClassName}
          onChange={(event) => onChange({ unit_label: event.target.value })}
        />
        <Input
          label="บาท/หน่วย"
          type="number"
          min="0"
          step="0.01"
          placeholder="เช่น 10"
          value={values.unit_rate}
          className={inputClassName}
          onChange={(event) => onChange({ unit_rate: event.target.value })}
        />
        <Input
          label="เพิ่มทีละ"
          type="number"
          min="0.01"
          step="0.01"
          value={values.unit_step}
          className={inputClassName}
          onChange={(event) => onChange({ unit_step: event.target.value })}
        />
        <Input
          label="ขั้นต่ำ"
          type="number"
          min="0"
          step="0.01"
          placeholder="ไม่บังคับ"
          value={values.unit_min}
          className={inputClassName}
          onChange={(event) => onChange({ unit_min: event.target.value })}
        />
        <Input
          label="สูงสุด"
          type="number"
          min="0"
          step="0.01"
          placeholder="ไม่บังคับ"
          value={values.unit_max}
          className={inputClassName}
          onChange={(event) => onChange({ unit_max: event.target.value })}
        />
        <Input
          label="เป้าหมาย"
          type="number"
          min="0"
          step="0.01"
          placeholder="ไม่บังคับ"
          value={values.target_quantity}
          className={inputClassName}
          onChange={(event) => onChange({ target_quantity: event.target.value })}
        />
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-5 text-emerald-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>งานแบบคิดตามจำนวนจะรออนุมัติเสมอ เพื่อให้ผู้จัดการยืนยันจำนวนจริงก่อนบันทึกเงินสะสม</p>
      </div>
    </div>
  );
}
