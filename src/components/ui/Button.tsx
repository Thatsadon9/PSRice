'use client';

import { type MouseEventHandler, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success' | 'none';
  size?: 'sm' | 'md' | 'lg' | 'none';
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  id?: string;
  ariaLabel?: string;
  title?: string;
}

const variantClasses = {
  primary: 'bg-primary-800 text-white hover:bg-primary-700 active:bg-primary-900 shadow-sm',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  outline: 'border-2 border-primary-800 text-primary-800 hover:bg-primary-50 active:bg-primary-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm',
  none: '',
};

const sizeClasses = {
  sm: 'min-h-10 px-3 py-2 text-sm rounded-lg gap-1.5',
  md: 'min-h-11 px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-6 py-3 text-base rounded-xl gap-2.5',
  none: '',
};

const iconOnlySizeClasses = {
  sm: 'h-10 w-10 px-0',
  md: 'h-11 w-11 px-0',
  lg: 'h-12 w-12 px-0',
  none: '',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  icon,
  onClick,
  type = 'button',
  className = '',
  id,
  ariaLabel,
  title,
}: ButtonProps) {
  const hasChildren = children !== undefined && children !== null;
  const isIconOnly = !hasChildren && Boolean(icon || loading);

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      title={title}
      className={`
        inline-flex items-center justify-center font-medium leading-none select-none
        whitespace-nowrap touch-manipulation align-middle
        transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] btn-press hover:-translate-y-[1px] hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:pointer-events-none
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${isIconOnly ? iconOnlySizeClasses[size] : ''}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : icon ? (
        <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
