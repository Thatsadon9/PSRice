'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const wrapperClasses = {
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-2',
};

export default function StarRating({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  showLabel = true,
  size = 'md',
  className = '',
}: StarRatingProps) {
  const rating = value ?? 0;

  return (
    <div className={`flex items-center ${wrapperClasses[size]} ${className}`}>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange?.(0)}
          disabled={disabled}
          className={`
            inline-flex min-h-9 items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors
            touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2
            ${rating === 0 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          0
        </button>
      )}

      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, index) => {
          const starValue = index + 1;
          const isActive = starValue <= rating;

          if (readOnly) {
            return (
              <Star
                key={starValue}
                className={`${sizeClasses[size]} ${isActive ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
              />
            );
          }

          return (
            <button
              key={starValue}
              type="button"
              onClick={() => onChange?.(starValue)}
              disabled={disabled}
              className={`
                inline-flex h-9 w-9 items-center justify-center rounded-xl transition-transform
                touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2
                ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:scale-110'}
              `}
              aria-label={`ให้คะแนน ${starValue} ดาว`}
            >
              <Star className={`${sizeClasses[size]} ${isActive ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          );
        })}
      </div>

      {showLabel && (
        <span className="text-xs font-medium text-slate-500">
          {rating}/5
        </span>
      )}
    </div>
  );
}
