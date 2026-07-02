'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
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

const starBoxClasses = {
  sm: 'h-8 w-8 rounded-xl',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-10 w-10 rounded-2xl',
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const rating = value ?? 0;
  const label = rating > 0 ? `${rating}/5` : 'ยังไม่ให้คะแนน';
  const canInteract = !readOnly && !disabled;

  const setRatingFromClientX = (clientX: number) => {
    if (!canInteract || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const nextRating = Math.min(5, Math.max(1, Math.ceil((x / rect.width) * 5)));
    onChange?.(nextRating);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;

    event.preventDefault();
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setRatingFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    setRatingFromClientX(event.clientX);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract) return;

    let nextRating: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextRating = Math.min(5, rating + 1 || 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextRating = Math.max(0, rating - 1);
    } else if (event.key === 'Home' || event.key === 'Backspace' || event.key === 'Delete') {
      nextRating = 0;
    } else if (event.key === 'End') {
      nextRating = 5;
    } else if (/^[0-5]$/.test(event.key)) {
      nextRating = Number(event.key);
    }

    if (nextRating === null) return;

    event.preventDefault();
    onChange?.(nextRating);
  };

  return (
    <div className={`flex flex-wrap items-center ${wrapperClasses[size]} ${className}`}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={canInteract ? 0 : -1}
        aria-label="คะแนนผลงาน"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={rating}
        aria-valuetext={label}
        aria-readonly={readOnly || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handleKeyDown}
        className={`
          flex items-center rounded-2xl border border-amber-100 bg-amber-50/70 p-1.5 shadow-sm
          transition-all duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2
          ${canInteract ? 'cursor-ew-resize touch-none hover:border-amber-200 hover:bg-amber-50' : 'cursor-default'}
          ${isDragging ? 'scale-[1.01] ring-2 ring-amber-300 ring-offset-2' : ''}
          ${disabled ? 'opacity-50' : ''}
        `}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const starValue = index + 1;
          const isActive = starValue <= rating;

          return (
            <span
              key={starValue}
              className={`
                inline-flex ${starBoxClasses[size]} items-center justify-center transition-all duration-150
                ${isActive ? 'bg-white shadow-sm' : ''}
                ${canInteract ? 'hover:scale-105' : ''}
              `}
              aria-hidden="true"
            >
              <Star className={`${sizeClasses[size]} ${isActive ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </span>
          );
        })}
      </div>

      {showLabel && (
        <span className={`text-xs font-bold ${rating > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
          {label}
        </span>
      )}

      {!readOnly && rating > 0 && (
        <button
          type="button"
          onClick={() => onChange?.(0)}
          disabled={disabled}
          className="rounded-full px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ล้าง
        </button>
      )}
    </div>
  );
}
