'use client';
/* eslint-disable @next/next/no-img-element */

import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  avatarUrl?: string | null;
  icon?: ReactNode;
  visualVariant?: 'badge' | 'plain';
  visualClassName?: string;
  selectedClassName?: string;
  checkClassName?: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue' | 'size'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  searchable?: boolean;
  emptyText?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string, option: SelectOption) => void;
}

function OptionVisual({ compact = false, option }: { compact?: boolean; option: SelectOption }) {
  if (option.avatarUrl) {
    return (
      <img
        src={option.avatarUrl}
        alt=""
        className={`${compact ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'} border border-white object-cover shadow-sm ring-1 ring-slate-100`}
      />
    );
  }

  if (option.icon) {
    if (option.visualVariant === 'plain') {
      return (
        <span className={`flex shrink-0 items-center justify-center ${compact ? 'h-5 w-5' : 'h-6 w-6'} text-slate-500 ${option.visualClassName || ''}`}>
          {option.icon}
        </span>
      );
    }

    return (
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100 ${compact ? 'h-6 w-6' : 'h-9 w-9'} ${option.visualClassName || ''}`}>
        {option.icon}
      </span>
    );
  }

  return null;
}

export default function Select({
  label,
  error,
  options,
  placeholder,
  className = '',
  id,
  value,
  defaultValue,
  disabled,
  name,
  searchable = false,
  emptyText = 'ไม่พบรายการ',
  onChange,
  onValueChange,
  ...props
}: SelectProps) {
  const ariaLabel = props['aria-label'];
  const required = props.required;
  const generatedId = useId();
  const selectId = id || generatedId;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const [query, setQuery] = useState('');
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });

  const selectedValue = value ?? internalValue;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;

    return options.filter((option) => {
      const text = `${option.label} ${option.description || ''}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [options, query]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const minHeight = 180;
    const preferredHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const placeAbove = spaceBelow < minHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(minHeight, placeAbove ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(preferredHeight, availableHeight);

    setMenuRect({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      top: placeAbove ? Math.max(8, rect.top - maxHeight - gap) : rect.bottom + gap,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handlePositionChange = () => updatePosition();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeMenu, open, updatePosition]);

  useEffect(() => {
    if (open && searchable) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const emitChange = (option: SelectOption) => {
    if (option.disabled) return;

    if (value === undefined) {
      setInternalValue(option.value);
    }

    const event = {
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    } as ChangeEvent<HTMLSelectElement>;

    onChange?.(event);
    onValueChange?.(option.value, option);
    closeMenu();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (open) {
            closeMenu();
          } else {
            setOpen(true);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`
          flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white
          px-3 py-2 text-left text-base leading-tight text-slate-900 shadow-sm sm:text-sm
          transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
          ${open ? 'border-primary-500 ring-2 ring-primary-100' : ''}
          ${error ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : ''}
          ${className}
        `}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {selectedOption && (selectedOption.avatarUrl || selectedOption.icon) ? (
            <OptionVisual compact option={selectedOption} />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-medium ${selectedOption ? 'text-slate-900' : 'text-slate-400'}`}>
              {selectedOption?.label || placeholder || 'เลือกข้อมูล'}
            </span>
            {selectedOption?.description && (
              <span className="mt-0.5 block truncate text-xs font-medium text-slate-400">
                {selectedOption.description}
              </span>
            )}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {name && <input type="hidden" name={name} value={selectedValue} required={required} />}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5 animate-scale-in"
          style={{
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
          }}
        >
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholder || 'ค้นหา...'}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100"
                />
              </div>
            </div>
          )}

          <div
            role="listbox"
            className="overflow-y-auto p-1.5"
            style={{ maxHeight: menuRect.maxHeight }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400">
                {emptyText}
              </div>
            ) : filteredOptions.map((option) => {
              const selected = option.value === selectedValue;
              const hasVisual = Boolean(option.avatarUrl || option.icon);

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => emitChange(option)}
                  className={`
                    flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition
                    ${selected ? option.selectedClassName || 'bg-primary-50 text-primary-800' : 'text-slate-700 hover:bg-slate-50'}
                    ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                >
                  {hasVisual && <OptionVisual option={option} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-xs font-medium text-slate-400">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {selected && <Check className={`h-4 w-4 shrink-0 text-primary-600 ${option.checkClassName || ''}`} />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
