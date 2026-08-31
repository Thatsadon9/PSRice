'use client';

import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  bottomSheet?: boolean;
  dialogRole?: 'dialog' | 'alertdialog';
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  full: 'max-w-5xl mx-4',
};

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  bottomSheet = false,
  dialogRole = 'dialog',
  ariaLabelledBy,
  ariaDescribedBy,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  if (bottomSheet) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div
          role={dialogRole}
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          className="relative isolate w-full max-h-[min(88vh,760px)] overscroll-contain overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-lg animate-slide-up safe-bottom sm:max-w-md sm:rounded-2xl"
        >
          <div className="flex items-center justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
          {title && (
            <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3 shadow-sm shadow-slate-900/5">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
          <div className="relative z-0 px-5 py-4">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role={dialogRole}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={`relative isolate w-full max-h-[min(88vh,760px)] overscroll-contain overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg animate-scale-in ${sizeClasses[size]}`}
      >
        {title && (
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 shadow-sm shadow-slate-900/5">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="relative z-0 px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
