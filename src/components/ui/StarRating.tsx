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
            rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors
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
              className={`transition-transform ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:scale-110'}`}
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
