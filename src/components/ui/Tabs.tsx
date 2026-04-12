'use client';

import { type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}: TabsProps) {
  if (variant === 'pill') {
    return (
      <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
              whitespace-nowrap transition-all duration-150
              ${activeTab === tab.id
                ? 'bg-primary-800 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }
            `}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`
                ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold
                ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}
              `}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex border-b border-slate-200 overflow-x-auto ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            flex items-center gap-1.5 px-4 py-3 text-sm font-medium
            whitespace-nowrap transition-all duration-150
            border-b-2 -mb-px
            ${activeTab === tab.id
              ? 'border-primary-800 text-primary-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
            }
          `}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className={`
              ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold
              ${activeTab === tab.id ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-500'}
            `}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
