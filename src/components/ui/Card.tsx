'use client';

import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  statusColor?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  id?: string;
}

const statusBorderColors = {
  blue: 'border-l-primary-500',
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  slate: 'border-l-slate-300',
};

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export default function Card({
  children,
  className = '',
  onClick,
  interactive = false,
  statusColor,
  padding = 'md',
  id,
}: CardProps) {
  const hasBgClass = className.includes('bg-');
  const hasRoundedClass = className.includes('rounded-');
  const hasBorderClass = className.includes('border-') && !className.includes('border-l-4');

  const sharedClassName = `
    ${hasBgClass ? '' : 'bg-white'} 
    ${hasRoundedClass ? '' : 'rounded-xl'} 
    ${hasBorderClass ? '' : 'border border-slate-200'}
    ${statusColor ? `border-l-4 ${statusBorderColors[statusColor]}` : ''}
    ${paddingClasses[padding]}
    ${interactive || onClick ? 'card-hover cursor-pointer' : ''}
    ${className}
  `.trim();

  if (onClick) {
    return (
      <button
        id={id}
        type="button"
        onClick={onClick}
        className={`
          ${sharedClassName}
          w-full text-left touch-manipulation
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        `}
      >
        {children}
      </button>
    );
  }

  return (
    <div id={id} className={sharedClassName}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-3 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-slate-900 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-slate-500 mt-0.5 ${className}`}>{children}</p>;
}
