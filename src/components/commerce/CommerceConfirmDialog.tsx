'use client';

import { AlertTriangle, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';

type CommerceConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function CommerceConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  busy = false,
  onConfirm,
  onCancel,
}: CommerceConfirmDialogProps) {
  return (
    <Modal
      isOpen={open}
      onClose={busy ? () => undefined : onCancel}
      size="md"
      dialogRole="alertdialog"
      ariaLabelledBy="commerce-confirm-title"
      ariaDescribedBy="commerce-confirm-message"
    >
      <div>
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center bg-amber-50 text-amber-700" aria-hidden="true">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="commerce-confirm-title" className="text-base font-semibold text-slate-950">{title}</h2>
            <p id="commerce-confirm-message" className="mt-1 text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? <span className="size-4 animate-spin border-2 border-white/40 border-t-white" aria-hidden="true" /> : <Check className="size-4" />}
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
