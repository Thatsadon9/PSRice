'use client';

import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  bottomSheet?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  full: 'max-w-full mx-4',
};

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  bottomSheet = false,
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

  if (!isOpen) return null;

  if (bottomSheet) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full overscroll-contain bg-white rounded-t-2xl animate-slide-up safe-bottom sm:max-w-md sm:rounded-2xl max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
          {title && (
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur-sm">
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
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full overscroll-contain ${sizeClasses[size]} bg-white rounded-2xl shadow-xl animate-scale-in max-h-[85vh] overflow-y-auto`}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
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
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
