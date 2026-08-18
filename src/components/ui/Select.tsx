'use client';
/* eslint-disable @next/next/no-img-element */

import {
  Children,
  Fragment,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type OptionHTMLAttributes,
  type ReactNode,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  avatarUrl?: string | null;
  icon?: ReactNode;
  visualVariant?: 'badge' | 'plain';
  visualShape?: 'rounded' | 'square';
  visualClassName?: string;
  selectedClassName?: string;
  checkClassName?: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue' | 'size'> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  searchable?: boolean;
  shape?: 'rounded' | 'square';
  emptyText?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string, option: SelectOption) => void;
}

type MenuRect = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
};

const subscribeToClient = () => () => undefined;

function filterOptions(options: SelectOption[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('th');
  if (!normalizedQuery) return options;

  return options.filter((option) => (
    `${option.label} ${option.description || ''} ${option.searchText || ''}`
      .toLocaleLowerCase('th')
      .includes(normalizedQuery)
  ));
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function optionsFromChildren(children: ReactNode, groupLabel?: string): SelectOption[] {
  const result: SelectOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === Fragment) {
      result.push(...optionsFromChildren((child.props as { children?: ReactNode }).children, groupLabel));
      return;
    }

    if (child.type === 'optgroup') {
      const props = child.props as { children?: ReactNode; label?: string; disabled?: boolean };
      const nested = optionsFromChildren(props.children, props.label);
      result.push(...nested.map((option) => ({ ...option, disabled: props.disabled || option.disabled })));
      return;
    }

    if (child.type !== 'option') return;

    const props = child.props as OptionHTMLAttributes<HTMLOptionElement> & {
      children?: ReactNode;
      'data-description'?: string;
    };
    const label = props.label || nodeText(props.children);
    result.push({
      value: String(props.value ?? label),
      label,
      description: props['data-description'] || groupLabel,
      disabled: props.disabled,
    });
  });

  return result;
}

function OptionVisual({ compact = false, option }: { compact?: boolean; option: SelectOption }) {
  if (option.avatarUrl) {
    const shape = option.visualShape === 'square' ? 'rounded-none' : compact ? 'rounded-lg' : 'rounded-xl';
    return (
      <img
        src={option.avatarUrl}
        alt=""
        className={`${compact ? 'h-7 w-7' : 'h-9 w-9'} ${shape} border border-white object-cover shadow-sm ring-1 ring-slate-100`}
      />
    );
  }

  if (!option.icon) return null;

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

export default function Select({
  label,
  error,
  options,
  children,
  placeholder,
  className = '',
  id,
  value,
  defaultValue,
  disabled,
  name,
  searchable,
  emptyText = 'ไม่พบรายการ',
  onChange,
  onValueChange,
  shape = 'rounded',
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const menuId = `${selectId}-menu`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const reduceMotion = useReducedMotion();
  const portalReady = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect>({
    top: 0,
    left: 8,
    width: 220,
    maxHeight: 320,
    placement: 'bottom',
  });

  const resolvedOptions = useMemo(
    () => options ?? optionsFromChildren(children),
    [children, options],
  );
  const selectedValue = String(value ?? internalValue);
  const selectedOption = useMemo(
    () => resolvedOptions.find((option) => option.value === selectedValue),
    [resolvedOptions, selectedValue],
  );
  const isSearchable = searchable ?? resolvedOptions.length > 10;
  const hasExplicitHeight = /(?:^|\s)(?:h|min-h)-/.test(className);
  const fillsContainer = /(?:^|\s)(?:w-full|flex-1)(?:\s|$)/.test(className);
  const controlShape = shape === 'square' ? 'rounded-none' : 'rounded-xl';
  const menuShape = shape === 'square' ? 'rounded-none' : 'rounded-2xl';

  const filteredOptions = useMemo(
    () => filterOptions(resolvedOptions, query),
    [query, resolvedOptions],
  );

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 7;
    const preferredHeight = isSearchable ? 360 : 320;
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const placement = spaceBelow < 180 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableHeight = Math.max(120, placement === 'top' ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(preferredHeight, availableHeight);
    const width = Math.min(
      Math.max(rect.width, 220),
      window.innerWidth - (viewportPadding * 2),
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );

    setMenuRect({
      top: placement === 'bottom' ? rect.bottom + gap : undefined,
      bottom: placement === 'top' ? window.innerHeight - rect.top + gap : undefined,
      left,
      width,
      maxHeight,
      placement,
    });
  }, [isSearchable]);

  const firstEnabledIndex = useCallback((items: SelectOption[]) => (
    items.findIndex((option) => !option.disabled)
  ), []);

  const lastEnabledIndex = useCallback((items: SelectOption[]) => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (!items[index]?.disabled) return index;
    }
    return -1;
  }, []);

  const openMenu = useCallback((preferredIndex?: number) => {
    if (disabled) return;
    updatePosition();
    setOpen(true);
    const selectedIndex = resolvedOptions.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    setActiveIndex(
      preferredIndex
      ?? (selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(resolvedOptions)),
    );
  }, [disabled, firstEnabledIndex, resolvedOptions, selectedValue, updatePosition]);

  const moveActive = useCallback((direction: 1 | -1) => {
    if (filteredOptions.length === 0) return;
    let next = activeIndex;

    for (let attempts = 0; attempts < filteredOptions.length; attempts += 1) {
      next = (next + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  }, [activeIndex, filteredOptions]);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handlePositionChange = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handlePositionChange);
    window.addEventListener('scroll', handlePositionChange, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handlePositionChange);
      window.removeEventListener('scroll', handlePositionChange, true);
    };
  }, [closeMenu, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      if (isSearchable) searchRef.current?.focus();
      else menuRef.current?.focus();
    }, 0);
  }, [isSearchable, open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const emitChange = (option: SelectOption) => {
    if (option.disabled) return;

    if (value === undefined) setInternalValue(option.value);
    setInvalid(false);

    const event = {
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    } as ChangeEvent<HTMLSelectElement>;

    onChange?.(event);
    onValueChange?.(option.value, option);
    closeMenu(true);
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(filteredOptions));
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(lastEnabledIndex(filteredOptions));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) emitChange(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(lastEnabledIndex(resolvedOptions));
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const match = resolvedOptions.find(
        (option) => !option.disabled && option.label.toLocaleLowerCase('th').startsWith(event.key.toLocaleLowerCase('th')),
      );
      if (match) emitChange(match);
    }
  };

  const showInvalid = Boolean(error || invalid);

  return (
    <span className={`relative min-w-0 ${fillsContainer ? 'block w-full' : 'inline-block'}`}>
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
        autoFocus={props.autoFocus}
        title={props.title}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={props['aria-label']}
        aria-describedby={props['aria-describedby']}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`
          flex w-full min-w-0 items-center justify-between gap-3 border bg-white px-3
          text-left text-base leading-tight text-slate-900 shadow-sm outline-none sm:text-sm
          transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out
          hover:border-slate-400 hover:bg-slate-50/70
          focus:border-primary-500 focus:ring-4 focus:ring-primary-100
          active:scale-[0.995]
          disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none
          ${hasExplicitHeight ? '' : 'min-h-10 py-2'}
          ${open ? 'border-primary-500 bg-white ring-4 ring-primary-100' : 'border-slate-300'}
          ${showInvalid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}
          ${className}
          ${controlShape}
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
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out ${open ? 'rotate-180 text-primary-600' : ''}`}
        />
      </button>

      {(name || props.required || props.form) && (
        <select
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          value={selectedValue}
          required={props.required}
          disabled={disabled}
          form={props.form}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault();
            props.onInvalid?.(event);
            setInvalid(true);
            triggerRef.current?.focus();
          }}
          className="pointer-events-none fixed -left-[9999px] h-px w-px opacity-0"
        >
          {!resolvedOptions.some((option) => option.value === '') && <option value="" />}
          {resolvedOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}

      {portalReady && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              id={menuId}
              ref={menuRef}
              role="listbox"
              tabIndex={-1}
              aria-label={props['aria-label'] || label || placeholder || 'ตัวเลือก'}
              onKeyDown={handleListKeyDown}
              initial={reduceMotion ? { opacity: 1 } : {
                opacity: 0,
                y: menuRect.placement === 'top' ? 5 : -5,
                scale: 0.985,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : {
                opacity: 0,
                y: menuRect.placement === 'top' ? 3 : -3,
                scale: 0.99,
              }}
              transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: [0.16, 1, 0.3, 1] }}
              className={`fixed z-[140] overflow-hidden ${menuShape} border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5 backdrop-blur-xl`}
              style={{
                top: menuRect.top,
                bottom: menuRect.bottom,
                left: menuRect.left,
                width: menuRect.width,
              }}
            >
              {isSearchable && (
                <div className="border-b border-slate-100 bg-slate-50/70 p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => {
                        const nextQuery = event.target.value;
                        setQuery(nextQuery);
                        setActiveIndex(firstEnabledIndex(filterOptions(resolvedOptions, nextQuery)));
                      }}
                      onKeyDown={handleListKeyDown}
                      placeholder={placeholder ? `ค้นหา${placeholder}` : 'ค้นหารายการ'}
                      className={`h-10 w-full ${controlShape} border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100`}
                    />
                  </div>
                </div>
              )}

              <div className="overflow-y-auto overscroll-contain p-1.5" style={{ maxHeight: menuRect.maxHeight }}>
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-7 text-center text-sm font-semibold text-slate-400">
                    {emptyText}
                  </div>
                ) : filteredOptions.map((option, index) => {
                  const selected = option.value === selectedValue;
                  const active = index === activeIndex;
                  const hasVisual = Boolean(option.avatarUrl || option.icon);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      data-option-index={index}
                      onPointerMove={() => {
                        if (!option.disabled) setActiveIndex(index);
                      }}
                      onClick={() => emitChange(option)}
                      className={`
                        flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left
                        transition-[background-color,color,transform] duration-150 ease-out
                        ${selected ? option.selectedClassName || 'bg-primary-50 text-primary-800' : 'text-slate-700'}
                        ${active && !selected ? 'bg-slate-100' : ''}
                        ${option.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer active:scale-[0.995]'}
                        ${controlShape}
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
                      {selected && (
                        <Check className={`h-4 w-4 shrink-0 text-primary-600 ${option.checkClassName || ''}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
