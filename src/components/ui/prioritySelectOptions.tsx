import { PRIORITY_LABELS } from '@/lib/constants';
import type { Priority } from '@/lib/types';
import type { SelectOption } from './Select';

function UrgencyMark({ count }: { count: 1 | 2 | 3 | 4 }) {
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-0.5">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="text-[11px] font-black leading-none">
          !
        </span>
      ))}
    </span>
  );
}

export const PRIORITY_SELECT_OPTIONS: Array<SelectOption & { value: Priority }> = [
  {
    value: 'low',
    label: PRIORITY_LABELS.low,
    icon: <UrgencyMark count={1} />,
    visualClassName: 'bg-slate-50 text-slate-500 ring-slate-200',
    selectedClassName: 'bg-slate-50 text-slate-800',
    checkClassName: 'text-slate-500',
  },
  {
    value: 'medium',
    label: PRIORITY_LABELS.medium,
    icon: <UrgencyMark count={2} />,
    visualClassName: 'bg-sky-50 text-sky-600 ring-sky-100',
    selectedClassName: 'bg-sky-50 text-sky-800',
    checkClassName: 'text-sky-600',
  },
  {
    value: 'high',
    label: PRIORITY_LABELS.high,
    icon: <UrgencyMark count={3} />,
    visualClassName: 'bg-amber-50 text-amber-600 ring-amber-100',
    selectedClassName: 'bg-amber-50 text-amber-800',
    checkClassName: 'text-amber-600',
  },
  {
    value: 'critical',
    label: PRIORITY_LABELS.critical,
    icon: <UrgencyMark count={4} />,
    visualClassName: 'bg-red-50 text-red-600 ring-red-100',
    selectedClassName: 'bg-red-50 text-red-800',
    checkClassName: 'text-red-600',
  },
];
