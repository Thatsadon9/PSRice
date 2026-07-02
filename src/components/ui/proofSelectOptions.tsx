import { Camera, Infinity, ListChecks, Type, Video } from 'lucide-react';
import { PROOF_TYPE_LABELS } from '@/lib/constants';
import type { ProofType } from '@/lib/types';
import type { SelectOption } from './Select';

export const PROOF_SELECT_OPTIONS: Array<SelectOption & { value: ProofType }> = [
  {
    value: 'photo',
    label: PROOF_TYPE_LABELS.photo,
    icon: <Camera className="h-4 w-4" />,
    visualVariant: 'plain',
    visualClassName: 'text-emerald-600',
    selectedClassName: 'bg-emerald-50 text-emerald-800',
    checkClassName: 'text-emerald-600',
  },
  {
    value: 'video',
    label: PROOF_TYPE_LABELS.video,
    icon: <Video className="h-4 w-4" />,
    visualVariant: 'plain',
    visualClassName: 'text-blue-600',
    selectedClassName: 'bg-blue-50 text-blue-800',
    checkClassName: 'text-blue-600',
  },
  {
    value: 'text',
    label: PROOF_TYPE_LABELS.text,
    icon: <Type className="h-4 w-4" />,
    visualVariant: 'plain',
    visualClassName: 'text-slate-600',
    selectedClassName: 'bg-slate-50 text-slate-800',
    checkClassName: 'text-slate-600',
  },
  {
    value: 'checklist',
    label: PROOF_TYPE_LABELS.checklist,
    icon: <ListChecks className="h-4 w-4" />,
    visualVariant: 'plain',
    visualClassName: 'text-violet-600',
    selectedClassName: 'bg-violet-50 text-violet-800',
    checkClassName: 'text-violet-600',
  },
  {
    value: 'any',
    label: PROOF_TYPE_LABELS.any,
    icon: <Infinity className="h-4 w-4" />,
    visualVariant: 'plain',
    visualClassName: 'text-slate-400',
    selectedClassName: 'bg-slate-50 text-slate-800',
    checkClassName: 'text-slate-500',
  },
];
