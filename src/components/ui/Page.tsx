'use client';

import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

type PageProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-lg',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
};

export function Page({ children, className = '', maxWidth = 'lg' }: PageProps) {
  return (
    <div className={`mx-auto w-full ${maxWidthClasses[maxWidth]} px-4 py-5 sm:px-6 sm:py-6 ${className}`}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, action, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold text-primary-700">{eyebrow}</p>}
        <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type PageSectionProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageSection({ title, description, action, children, className = '' }: PageSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-slate-950">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type StatTileProps = {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
};

const statToneClasses = {
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
};

export function StatTile({ label, value, helper, icon, tone = 'slate' }: StatTileProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
          {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${statToneClasses[tone]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}

type ActionRowProps = {
  children: ReactNode;
  className?: string;
};

export function ActionRow({ children, className = '' }: ActionRowProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end ${className}`}>
      {children}
    </div>
  );
}
