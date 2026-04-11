'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface BottomNavProps {
  items: NavItem[];
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-bottom no-print">
      <div className="flex items-stretch max-w-lg mx-auto">
        {items.map(item => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive = pathname === item.href ||
            (item.href !== '/employee' && item.href !== '/manager' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5
                transition-colors duration-150 relative
                ${isActive
                  ? 'text-primary-800 nav-active'
                  : 'text-slate-400 hover:text-slate-600'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
