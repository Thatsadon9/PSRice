# Operational Core UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the full PS Rice app into a calmer, more official, easier-to-use operational interface while preserving the existing green, white, and slate theme.

**Architecture:** Implement the redesign in layers: shared UI foundation first, then layout/navigation shell, then employee workflows, then manager workflows, then responsive visual QA. Shared components define visual behavior so page work can focus on information hierarchy and workflows instead of repeating styling decisions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 via `src/app/globals.css`, Zustand stores, lucide-react icons, existing custom UI primitives in `src/components/ui`.

---

## Spec Reference

Implement from:

- `docs/superpowers/specs/2026-06-28-operational-core-ux-redesign-design.md`

## Preflight Constraints

At plan-writing time the working tree already contains unrelated or earlier pending changes:

- `src/app/employee/profile/page.tsx`
- `src/app/manager/payroll/page.tsx`
- `src/components/ui/Card.tsx`
- `src/lib/hr.ts`
- `docs/superpowers/plans/2026-06-28-employee-payroll-ledger.md`
- `supabase/migrations/20260628152454_payroll_ledger_defaults.sql`

Implementation workers must not revert, overwrite, or casually reformat those changes. If a task must touch an already dirty file, read its current diff first and preserve existing behavior.

## File Structure Map

### Shared Foundation

- Modify `src/app/globals.css`
  - Owns theme tokens, base layout safety, scrollbars, focus style, reusable utility classes.
- Modify `src/components/ui/Button.tsx`
  - Owns button variants, sizes, icon-only behavior, wrapping/truncation safety.
- Modify `src/components/ui/Card.tsx`
  - Owns default surface styling and interactive surface behavior.
- Modify `src/components/ui/Input.tsx`
  - Owns Input and TextArea visual consistency.
- Modify `src/components/ui/Select.tsx`
  - Owns select visual consistency.
- Modify `src/components/ui/Modal.tsx`
  - Owns desktop modal and mobile bottom-sheet behavior.
- Modify `src/components/ui/Tabs.tsx`
  - Owns segmented and underline tab behavior.
- Modify `src/components/ui/Badge.tsx`
  - Owns status pill behavior.
- Create `src/components/ui/Page.tsx`
  - Owns reusable Page, PageHeader, PageSection, StatTile, EmptyState, ActionRow.

### Layout And Navigation

- Modify `src/components/layout/Header.tsx`
  - Owns top shell, account display, notification action, logout action.
- Modify `src/components/layout/Sidebar.tsx`
  - Owns manager desktop nav, grouped sections, mobile drawer.
- Modify `src/components/layout/BottomNav.tsx`
  - Owns mobile primary navigation.
- Modify `src/app/employee/layout.tsx`
  - Owns employee content width and bottom spacing.
- Modify `src/app/manager/layout.tsx`
  - Owns manager workspace width, sidebar composition, bottom nav visibility.
- Modify `src/lib/constants.ts`
  - Owns navigation item lists and labels.

### Employee Pages

- Modify `src/app/employee/page.tsx`
  - Employee daily dashboard.
- Modify `src/app/employee/check-in/page.tsx`
  - Focused check-in/check-out flow.
- Modify `src/app/employee/tasks/page.tsx`
  - Task list, proof submission modal, reward visibility.
- Modify `src/app/employee/tasks/[id]/page.tsx`
  - Task detail flow.
- Modify `src/app/employee/requests/page.tsx`
  - Unified leave, advance, expense request hub.
- Modify `src/app/employee/profile/page.tsx`
  - Profile and money summary.
- Modify `src/app/employee/history/page.tsx`
  - History tabs and row/list presentation.
- Modify `src/app/employee/schedule/page.tsx`
  - Schedule mobile list and desktop table.
- Modify `src/app/employee/notifications/page.tsx`
  - Notification list hierarchy.
- Modify `src/app/employee/settings/page.tsx`
  - Low-frequency account/system actions.

### Manager Pages

- Modify `src/app/manager/page.tsx`
  - Manager operational dashboard.
- Modify `src/app/manager/review/page.tsx`
  - Review queue list.
- Modify `src/app/manager/review/[id]/page.tsx`
  - Review detail and approval action hierarchy.
- Modify `src/app/manager/attendance/page.tsx`
  - Attendance filters, table/list, export action.
- Modify `src/app/manager/payroll/page.tsx`
  - Payroll ledger readability and responsive behavior.
- Modify `src/app/manager/employees/page.tsx`
  - Workforce list/table consistency.
- Modify `src/app/manager/branches/page.tsx`
  - Branch cards/list and policy actions.
- Modify `src/app/manager/schedule/page.tsx`
  - Shift calendar/list responsive behavior.
- Modify `src/app/manager/assignments/page.tsx`
  - Assignment form/list clarity.
- Modify `src/app/manager/templates/page.tsx`
  - Template library layout.
- Modify `src/app/manager/requests/page.tsx`
  - Employee request review layout.
- Modify `src/app/manager/reports/page.tsx`
  - Report cards and charts hierarchy.
- Modify `src/app/manager/settings/page.tsx`
  - Utility settings layout.
- Modify `src/app/manager/more/page.tsx`
  - Mobile secondary navigation.

### Visual QA

- Use the in-app Browser where available.
- Use the app dev server from `npm run dev`.
- Do not commit screenshots or temporary QA scripts unless the user explicitly asks.

---

### Task 0: Implementation Preflight And Guardrails

**Files:**
- Read: `AGENTS.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- Read: `docs/superpowers/specs/2026-06-28-operational-core-ux-redesign-design.md`
- Modify: none

- [ ] **Step 1: Confirm the worktree state**

Run:

```powershell
git status --short
```

Expected: output may include the dirty files listed in the Preflight Constraints section. Do not revert them.

- [ ] **Step 2: Read current diffs for dirty files that the redesign may touch**

Run:

```powershell
git diff -- src/components/ui/Card.tsx src/app/employee/profile/page.tsx src/app/manager/payroll/page.tsx src/lib/hr.ts
```

Expected: output shows existing local changes. Preserve the behavior in those changes when editing the same files.

- [ ] **Step 3: Read the required Next.js docs before code edits**

Run:

```powershell
Get-Content -Path node_modules\next\dist\docs\01-app\01-getting-started\11-css.md | Select-Object -First 220
Get-Content -Path node_modules\next\dist\docs\01-app\01-getting-started\03-layouts-and-pages.md | Select-Object -First 220
```

Expected: docs confirm global CSS lives in `src/app/globals.css` and layouts compose route segments through `layout.tsx`.

- [ ] **Step 4: Create a baseline build**

Run:

```powershell
npm run build
```

Expected: build succeeds before redesign edits. If it fails because of unrelated dirty work, stop and report the failure before continuing.

- [ ] **Step 5: Commit checkpoint is not needed**

No commit in this task. This task establishes guardrails only.

---

### Task 1: Add Page-Level Layout Primitives

**Files:**
- Create: `src/components/ui/Page.tsx`
- Modify: `src/app/globals.css`
- Test: targeted eslint and build

- [ ] **Step 1: Create `src/components/ui/Page.tsx`**

Add this file:

```tsx
'use client';

import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

type PageProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-lg',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
};

export function Page({ children, className = '', maxWidth = 'lg' }: PageProps) {
  return (
    <div className={`mx-auto w-full ${maxWidthClasses[maxWidth]} px-4 py-5 sm:px-6 sm:py-6 ${className}`}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, action, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold text-primary-700">{eyebrow}</p>}
        <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type PageSectionProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageSection({ title, description, action, children, className = '' }: PageSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-slate-950">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type StatTileProps = {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
};

const statToneClasses = {
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
};

export function StatTile({ label, value, helper, icon, tone = 'slate' }: StatTileProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
          {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${statToneClasses[tone]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Card>
  );
}

type ActionRowProps = {
  children: ReactNode;
  className?: string;
};

export function ActionRow({ children, className = '' }: ActionRowProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Add global layout safety utilities**

In `src/app/globals.css`, add these rules after the `body` block:

```css
img,
video,
canvas,
svg {
  max-width: 100%;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.text-balance-safe {
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.content-safe {
  min-width: 0;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 3: Run targeted lint**

Run:

```powershell
npx eslint src\components\ui\Page.tsx
```

Expected: no errors.

- [ ] **Step 4: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit foundation helper**

Run:

```powershell
git add src/components/ui/Page.tsx src/app/globals.css
git commit -m "feat: add operational page primitives"
```

Expected: commit succeeds with only these foundation files staged.

---

### Task 2: Tighten Shared UI Primitives

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Card.tsx`
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/components/ui/Select.tsx`
- Modify: `src/components/ui/Modal.tsx`
- Modify: `src/components/ui/Tabs.tsx`
- Modify: `src/components/ui/Badge.tsx`
- Modify: `src/components/ui/Skeleton.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Update Button classes for formal hierarchy**

In `src/components/ui/Button.tsx`, set these class maps:

```tsx
const variantClasses = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 shadow-sm',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:bg-primary-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm',
  none: '',
};

const sizeClasses = {
  sm: 'min-h-9 px-3 py-2 text-sm rounded-lg gap-1.5',
  md: 'min-h-10 px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-5 py-3 text-base rounded-xl gap-2.5',
  none: '',
};
```

Also replace the base class text with:

```tsx
inline-flex min-w-0 items-center justify-center font-semibold leading-tight select-none
touch-manipulation align-middle
transition-colors duration-150
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
```

For children text, wrap with:

```tsx
{children && <span className="min-w-0 truncate">{children}</span>}
```

- [ ] **Step 2: Update Card defaults without removing existing dirty behavior**

Before editing, run:

```powershell
git diff -- src\components\ui\Card.tsx
```

Preserve any existing local changes. Then ensure the shared class includes these defaults:

```tsx
const sharedClassName = `
  ${hasBgClass ? '' : 'bg-white'}
  ${hasRoundedClass ? '' : 'rounded-2xl'}
  ${hasBorderClass ? '' : 'border border-slate-200'}
  ${statusColor ? `border-l-4 ${statusBorderColors[statusColor]}` : ''}
  ${paddingClasses[padding]}
  ${interactive || onClick ? 'transition-colors hover:border-primary-200 hover:bg-slate-50 cursor-pointer' : ''}
  ${className}
`.trim();
```

Remove trailing spaces in template lines.

- [ ] **Step 3: Update Input and TextArea**

In `src/components/ui/Input.tsx`, set input base classes to:

```tsx
w-full min-h-10 rounded-xl border border-slate-300 bg-white
px-3 py-2 text-base leading-tight text-slate-900 shadow-sm sm:text-sm
placeholder:text-slate-400
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
disabled:bg-slate-50 disabled:text-slate-500
transition-colors duration-150
```

Set `TextArea` base classes to:

```tsx
w-full rounded-xl border border-slate-300 bg-white
px-3 py-2.5 text-base leading-6 text-slate-900 shadow-sm sm:text-sm
placeholder:text-slate-400
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
disabled:bg-slate-50 disabled:text-slate-500
transition-colors duration-150 resize-none
```

- [ ] **Step 4: Update Select**

In `src/components/ui/Select.tsx`, keep the existing native select but change the base class to:

```tsx
w-full min-h-10 rounded-xl border border-slate-300 bg-white
px-3 py-2 pr-10 text-base leading-tight text-slate-900 shadow-sm sm:text-sm
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
disabled:bg-slate-50 disabled:text-slate-500
transition-colors duration-150 appearance-none
```

- [ ] **Step 5: Update Modal sizing and sticky action safety**

In `src/components/ui/Modal.tsx`, change size classes to:

```tsx
const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  full: 'max-w-5xl mx-4',
};
```

Use `rounded-2xl border border-slate-200 shadow-lg` for modal panels and `max-h-[min(88vh,760px)]`.

- [ ] **Step 6: Update Tabs for compact behavior**

In `src/components/ui/Tabs.tsx`, ensure pill tabs use:

```tsx
inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold
whitespace-nowrap touch-manipulation transition-colors duration-150
```

Ensure the wrapper has:

```tsx
flex gap-2 overflow-x-auto pb-1 app-scrollbar
```

- [ ] **Step 7: Update Badge**

In `src/components/ui/Badge.tsx`, change the root classes to:

```tsx
inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full font-medium leading-none
```

Wrap children with:

```tsx
<span className="truncate">{children}</span>
```

- [ ] **Step 8: Update Skeleton**

In `src/components/ui/Skeleton.tsx`, change the class to:

```tsx
<div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />
```

- [ ] **Step 9: Run targeted lint**

Run:

```powershell
npx eslint src\components\ui\Button.tsx src\components\ui\Card.tsx src\components\ui\Input.tsx src\components\ui\Select.tsx src\components\ui\Modal.tsx src\components\ui\Tabs.tsx src\components\ui\Badge.tsx src\components\ui\Skeleton.tsx
```

Expected: no errors.

- [ ] **Step 10: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 11: Commit shared primitives**

Run:

```powershell
git add src/components/ui/Button.tsx src/components/ui/Card.tsx src/components/ui/Input.tsx src/components/ui/Select.tsx src/components/ui/Modal.tsx src/components/ui/Tabs.tsx src/components/ui/Badge.tsx src/components/ui/Skeleton.tsx
git commit -m "refactor: tighten shared UI primitives"
```

Expected: commit succeeds.

---

### Task 3: Redesign App Shell And Navigation

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomNav.tsx`
- Modify: `src/app/employee/layout.tsx`
- Modify: `src/app/manager/layout.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Update employee mobile nav**

In `src/lib/constants.ts`, set `EMPLOYEE_NAV_ITEMS` to:

```ts
export const EMPLOYEE_NAV_ITEMS = [
  { label: 'หน้าแรก', href: '/employee', icon: 'LayoutDashboard' },
  { label: 'ลงเวลา', href: '/employee/check-in', icon: 'Clock' },
  { label: 'งาน', href: '/employee/tasks', icon: 'Trophy' },
  { label: 'โปรไฟล์', href: '/employee/profile', icon: 'UserCircle' },
  { label: 'เพิ่มเติม', href: '/employee/settings', icon: 'Menu' },
];
```

If mojibake appears in the file due terminal encoding, preserve the actual UTF-8 Thai text in the editor/patch.

- [ ] **Step 2: Update manager mobile nav**

Set `MANAGER_MOBILE_NAV_ITEMS` to:

```ts
export const MANAGER_MOBILE_NAV_ITEMS = [
  { label: 'แดชบอร์ด', href: '/manager', icon: 'LayoutDashboard' },
  { label: 'ตรวจงาน', href: '/manager/review', icon: 'CheckSquare' },
  { label: 'พนักงาน', href: '/manager/employees', icon: 'Users' },
  { label: 'ค่าแรง', href: '/manager/payroll', icon: 'WalletCards' },
  { label: 'เพิ่มเติม', href: '/manager/more', icon: 'Menu' },
];
```

- [ ] **Step 3: Keep manager desktop nav complete**

Do not remove entries from `MANAGER_NAV_ITEMS`. Reorder only if needed to match groups: dashboard, review, requests, employees, branches, schedule, attendance, templates, assignments, payroll, reports, settings.

- [ ] **Step 4: Update BottomNav**

In `src/components/layout/BottomNav.tsx`, change the root to:

```tsx
<nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom no-print">
  <div className="mx-auto grid max-w-lg grid-cols-5">
```

Each link should use:

```tsx
className={`
  relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2
  text-center transition-colors duration-150 touch-manipulation
  ${isActive ? 'text-primary-800' : 'text-slate-500 hover:text-slate-700'}
`}
```

Text span:

```tsx
<span className="max-w-full truncate text-[11px] font-medium leading-tight">{item.label}</span>
```

- [ ] **Step 5: Update Header**

In `src/components/layout/Header.tsx`, keep the existing notification count logic. Change the header classes to:

```tsx
<header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur safe-top no-print">
  <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
```

Use icon-only notification and logout buttons on mobile. Keep account text hidden on small screens.

- [ ] **Step 6: Update Sidebar**

In `src/components/layout/Sidebar.tsx`, keep existing pending review badge logic. Change the aside class to:

```tsx
fixed top-0 left-0 bottom-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white
transform transition-transform duration-200 ease-out
lg:translate-x-0 lg:static lg:z-auto
```

Nav links should use `rounded-xl`, `min-h-10`, and active `bg-primary-50 text-primary-800 ring-1 ring-primary-100`.

- [ ] **Step 7: Update employee layout container**

In `src/app/employee/layout.tsx`, change the main return to:

```tsx
return (
  <div className="min-h-dvh bg-slate-50">
    <Header />
    <main className="mx-auto w-full max-w-lg pb-24">
      {children}
    </main>
    <BottomNav items={EMPLOYEE_NAV_ITEMS} />
  </div>
);
```

- [ ] **Step 8: Update manager layout container**

In `src/app/manager/layout.tsx`, change the main content wrapper to:

```tsx
<main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 lg:pb-0">
  <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
    {children}
  </div>
</main>
```

- [ ] **Step 9: Run targeted lint**

Run:

```powershell
npx eslint src\lib\constants.ts src\components\layout\Header.tsx src\components\layout\Sidebar.tsx src\components\layout\BottomNav.tsx src\app\employee\layout.tsx src\app\manager\layout.tsx
```

Expected: no errors.

- [ ] **Step 10: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 11: Commit app shell**

Run:

```powershell
git add src/lib/constants.ts src/components/layout/Header.tsx src/components/layout/Sidebar.tsx src/components/layout/BottomNav.tsx src/app/employee/layout.tsx src/app/manager/layout.tsx
git commit -m "refactor: simplify app shell navigation"
```

Expected: commit succeeds.

---

### Task 4: Redesign Employee Dashboard And Check-In Flow

**Files:**
- Modify: `src/app/employee/page.tsx`
- Modify: `src/app/employee/check-in/page.tsx`
- Test: targeted eslint, build, visual QA

- [ ] **Step 1: Refactor employee dashboard to use Page primitives**

In `src/app/employee/page.tsx`, import:

```tsx
import { Page, PageHeader, PageSection, StatTile } from '@/components/ui/Page';
```

Replace the outer wrapper with:

```tsx
<Page maxWidth="sm" className="space-y-5 pb-24">
```

Use `PageHeader`:

```tsx
<PageHeader
  eyebrow={formatThaiDate(new Date().toISOString())}
  title={`สวัสดี, ${currentUser.full_name?.split(' ')[0] || 'พนักงาน'}`}
  description="ดูงานวันนี้ ลงเวลา และติดตามรายได้ปัจจุบันของคุณ"
/>
```

- [ ] **Step 2: Replace decorative hero with daily status Card**

Build a top `Card` with these sections:

```tsx
<Card className="border-emerald-100 p-4">
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-950">{todayShift.shift_name}</p>
      <p className="mt-1 text-sm text-slate-500">{todayShift.start_time} - {todayShift.end_time}</p>
    </div>
    <Badge variant={getShiftVariant(todayShift.status)}>{SHIFT_ASSIGNMENT_STATUS_LABELS[todayShift.status]}</Badge>
  </div>
  <div className="mt-4 grid grid-cols-2 gap-3">
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">เวลาเข้า</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{todayAttendance.checkIn ? new Date(todayAttendance.checkIn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
    </div>
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">เวลาออก</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{todayAttendance.checkOut ? new Date(todayAttendance.checkOut.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
    </div>
  </div>
</Card>
```

- [ ] **Step 3: Keep only one primary check-in CTA**

If `attendanceStatus !== 'checked_out'`, render one full-width button:

```tsx
<Link href="/employee/check-in">
  <Button fullWidth size="lg" icon={<Camera className="h-5 w-5" />}>
    {attendanceStatus === 'not_checked_in' ? 'เช็คอินเข้างาน' : 'เช็คเอาท์ออกงาน'}
  </Button>
</Link>
```

- [ ] **Step 4: Convert dashboard stats to StatTile**

Use a two-column grid:

```tsx
<div className="grid grid-cols-2 gap-3">
  <StatTile label="งานรอดำเนินการ" value={activeTasks.length} icon={<ClipboardList className="h-5 w-5" />} tone="blue" />
  <StatTile label="คำขอรออนุมัติ" value={pendingRequestsCount} icon={<ReceiptText className="h-5 w-5" />} tone="amber" />
</div>
```

- [ ] **Step 5: Simplify check-in page stage hierarchy**

In `src/app/employee/check-in/page.tsx`, keep current camera/GPS/business logic. Change visual hierarchy to:

1. `PageHeader` with branch/location status.
2. One `Card` for current status and selected branch.
3. One primary action card for camera/selfie.
4. One confirmation card after selfie capture.
5. One result card after submit.

The action buttons should be:

```tsx
<Button fullWidth size="lg" icon={<Camera className="h-5 w-5" />}>
  ถ่ายรูปยืนยันตัวตน
</Button>
```

and:

```tsx
<Button fullWidth size="lg" loading={submitting} disabled={!capturedImage || !canSubmit}>
  ยืนยันการลงเวลา
</Button>
```

- [ ] **Step 6: Remove decorative blur/ring wrappers in check-in**

Remove classes containing `blur-3xl`, `rounded-[3rem]`, `shadow-2xl`, and gradient-only wrappers from check-in surfaces unless they are part of the camera preview.

- [ ] **Step 7: Run targeted lint**

Run:

```powershell
npx eslint src\app\employee\page.tsx src\app\employee\check-in\page.tsx
```

Expected: no new errors. Existing `no-explicit-any` in `check-in/page.tsx` should be fixed in this task if the edited line is still present.

- [ ] **Step 8: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Commit employee dashboard and check-in**

Run:

```powershell
git add src/app/employee/page.tsx src/app/employee/check-in/page.tsx
git commit -m "refactor: simplify employee daily workflow"
```

Expected: commit succeeds.

---

### Task 5: Redesign Employee Tasks And Requests

**Files:**
- Modify: `src/app/employee/tasks/page.tsx`
- Modify: `src/app/employee/tasks/[id]/page.tsx`
- Modify: `src/app/employee/requests/page.tsx`
- Modify: `src/components/ui/SubmissionFilesGrid.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Add status tabs to employee tasks**

In `src/app/employee/tasks/page.tsx`, define:

```tsx
type TaskView = 'today' | 'active' | 'review' | 'fix' | 'done';
```

Add state:

```tsx
const [activeView, setActiveView] = useState<TaskView>('today');
```

Create tab data:

```tsx
const taskTabs = [
  { id: 'today', label: 'วันนี้', count: todayTasks.length },
  { id: 'active', label: 'ต้องทำ', count: allTasks.filter((task) => ['pending', 'in_progress', 'overdue'].includes(task.status)).length },
  { id: 'review', label: 'รอตรวจ', count: allTasks.filter((task) => task.status === 'submitted').length },
  { id: 'fix', label: 'แก้งาน', count: allTasks.filter((task) => task.status === 'rejected').length },
  { id: 'done', label: 'เสร็จแล้ว', count: allTasks.filter((task) => isMilestoneComplete(task.status)).length },
];
```

Use `<Tabs variant="pill" tabs={taskTabs} activeTab={activeView} onChange={(tab) => setActiveView(tab as TaskView)} />`.

- [ ] **Step 2: Render task cards with one next action**

Each task card should have:

```tsx
<Card key={task.id} className="p-4">
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h3 className="truncate text-sm font-semibold text-slate-950">{task.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{task.description}</p>
    </div>
    <Badge variant={task.status === 'rejected' ? 'danger' : task.status === 'approved' ? 'success' : 'default'}>
      {TASK_STATUS_LABELS[task.status]}
    </Badge>
  </div>
  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
    <span>{formatThaiDate(task.due_date || task.created_at)}</span>
    <span>{formatThaiCurrency(getMilestoneReward(task, task.template_id ? taskStore.getTemplateById(task.template_id) : null))}</span>
  </div>
  <Button className="mt-4" fullWidth variant={task.status === 'approved' ? 'secondary' : 'primary'} onClick={() => openMilestone(task)}>
    {task.status === 'approved' ? 'ดูรายละเอียด' : 'ส่งงาน'}
  </Button>
</Card>
```

- [ ] **Step 3: Tighten proof upload modal**

Keep upload logic. In the modal, use:

```tsx
<Modal isOpen={!!selectedTask} onClose={closeMilestone} title="ส่งงาน" bottomSheet>
  <div className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-950">{selectedTask?.title}</p>
      <p className="mt-1 text-xs text-slate-500">{PROOF_TYPE_LABELS[selectedProofRequired]}</p>
    </div>
    <TextArea value={note} onChange={(event) => setNote(event.target.value)} label="บันทึกเพิ่มเติม" rows={3} />
    <SubmissionFilesGrid
      files={previewFiles}
      onRemove={(id) => setProofUploads((current) => current.filter((upload) => upload.id !== id))}
    />
    <Button fullWidth loading={submitting} onClick={() => void handleSubmit()}>
      ส่งงานให้ตรวจ
    </Button>
  </div>
</Modal>
```

- [ ] **Step 4: Update SubmissionFilesGrid**

Change item radius from `rounded-2xl` to `rounded-xl`, empty state from `rounded-lg` to `rounded-xl`, and hover scale from `group-hover:scale-105` to no scale:

```tsx
<div key={file.id} className="group relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
```

Image class:

```tsx
className="h-full w-full object-cover"
```

- [ ] **Step 5: Redesign employee requests as one request hub**

In `src/app/employee/requests/page.tsx`, import Page primitives and replace the wrapper:

```tsx
<Page maxWidth="sm" className="space-y-5 pb-24">
  <PageHeader
    title="คำขอของฉัน"
    description="ส่งคำขอลา เบิกเงินล่วงหน้า และเบิกค่าใช้จ่าย"
    action={<Button size="sm" onClick={() => setIsModalOpen(true)} icon={<Plus className="h-4 w-4" />}>สร้างคำขอ</Button>}
  />
</Page>
```

Use summary `StatTile` cards for pending, approved, rejected.

- [ ] **Step 6: Simplify request modal**

Use a segmented request type area at the top of the modal:

```tsx
<div className="grid grid-cols-3 gap-2">
  {(['leave', 'advance', 'expense'] as const).map((type) => (
    <button
      key={type}
      type="button"
      onClick={() => setForm((current) => ({ ...current, request_type: type }))}
      className={`min-h-10 rounded-xl border px-2 text-xs font-semibold ${form.request_type === type ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-slate-200 bg-white text-slate-600'}`}
    >
      {EMPLOYEE_REQUEST_TYPE_LABELS[type]}
    </button>
  ))}
</div>
```

- [ ] **Step 7: Run targeted lint**

Run:

```powershell
npx eslint src\app\employee\tasks\page.tsx src\app\employee\tasks\[id]\page.tsx src\app\employee\requests\page.tsx src\components\ui\SubmissionFilesGrid.tsx
```

Expected: no errors.

- [ ] **Step 8: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Commit tasks and requests**

Run:

```powershell
git add src/app/employee/tasks/page.tsx src/app/employee/tasks/[id]/page.tsx src/app/employee/requests/page.tsx src/components/ui/SubmissionFilesGrid.tsx
git commit -m "refactor: streamline employee tasks and requests"
```

Expected: commit succeeds.

---

### Task 6: Redesign Employee Profile, History, Schedule, Notifications, Settings

**Files:**
- Modify: `src/app/employee/profile/page.tsx`
- Modify: `src/app/employee/history/page.tsx`
- Modify: `src/app/employee/schedule/page.tsx`
- Modify: `src/app/employee/notifications/page.tsx`
- Modify: `src/app/employee/settings/page.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Preserve existing payroll summary work in profile**

Before editing, run:

```powershell
git diff -- src\app\employee\profile\page.tsx
```

Expected: current payroll summary changes are visible. Preserve the payroll calculation and displayed money fields.

- [ ] **Step 2: Reframe employee profile around money and identity**

In `src/app/employee/profile/page.tsx`, use:

```tsx
<Page maxWidth="sm" className="space-y-5 pb-24">
  <PageHeader title="โปรไฟล์" description="ข้อมูลส่วนตัว เอกสาร และยอดเงินปัจจุบัน" />
  {payrollSummary && (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">ยอดเงินเดือนนี้</p>
      <p className="mt-1 text-3xl font-bold text-slate-950">{formatCurrency(payrollSummary.net_pay)}</p>
    </Card>
  )}
  <Card className="p-4">
    <InfoRow label="ชื่อ-นามสกุล" value={currentUser.full_name} />
    <InfoRow label="อีเมล" value={currentUser.email} />
  </Card>
  <Card className="p-4">
    <InfoRow label="ธนาคาร" value={currentUser.bank_name} />
    <InfoRow label="เลขบัญชี" value={currentUser.bank_account_number} />
  </Card>
</Page>
```

Order sections:

1. Payroll summary card.
2. Identity card.
3. Bank card.
4. Documents card.
5. Account actions.

- [ ] **Step 3: Convert profile edit actions to one action sheet**

Keep `isActionMenuOpen` and use a bottom-sheet modal with action rows:

```tsx
<Modal isOpen={isActionMenuOpen} onClose={() => setIsActionMenuOpen(false)} title="จัดการโปรไฟล์" bottomSheet>
  <div className="space-y-2">
    <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" onClick={() => setEditTarget('personal')}>
      <UserCircle className="h-5 w-5 text-primary-700" />
      <span className="text-sm font-semibold text-slate-900">แก้ไขข้อมูลส่วนตัว</span>
    </button>
    <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" onClick={() => setEditTarget('bank')}>
      <Landmark className="h-5 w-5 text-amber-700" />
      <span className="text-sm font-semibold text-slate-900">แก้ไขบัญชีธนาคาร</span>
    </button>
  </div>
</Modal>
```

- [ ] **Step 4: Update schedule page type hygiene**

In `src/app/employee/schedule/page.tsx`, replace `any` type usage with existing project types from `src/lib/types.ts`. If a local derived type is needed, define:

```tsx
type ScheduleDay = {
  workDate: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'day_off' | 'leave' | 'holiday';
};
```

Use this type for arrays and render helpers.

- [ ] **Step 5: Apply PageHeader and compact list patterns**

For `history`, `schedule`, `notifications`, and `settings`, replace decorative headers with `PageHeader`, convert large rounded cards to `Card className="p-4"`, and ensure mobile list rows use:

```tsx
className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
```

- [ ] **Step 6: Run targeted lint**

Run:

```powershell
npx eslint src\app\employee\profile\page.tsx src\app\employee\history\page.tsx src\app\employee\schedule\page.tsx src\app\employee\notifications\page.tsx src\app\employee\settings\page.tsx
```

Expected: no errors. The existing `no-explicit-any` errors in employee schedule should be fixed by this task.

- [ ] **Step 7: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit employee secondary pages**

Run:

```powershell
git add src/app/employee/profile/page.tsx src/app/employee/history/page.tsx src/app/employee/schedule/page.tsx src/app/employee/notifications/page.tsx src/app/employee/settings/page.tsx
git commit -m "refactor: organize employee profile and support pages"
```

Expected: commit succeeds.

---

### Task 7: Redesign Manager Dashboard And Review Queue

**Files:**
- Modify: `src/app/manager/page.tsx`
- Modify: `src/app/manager/review/page.tsx`
- Modify: `src/app/manager/review/[id]/page.tsx`
- Modify: `src/app/manager/requests/page.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Replace manager dashboard hero with decision queue**

In `src/app/manager/page.tsx`, import:

```tsx
import { Page, PageHeader, PageSection, StatTile } from '@/components/ui/Page';
```

Use:

```tsx
<Page maxWidth="xl" className="space-y-6">
  <PageHeader
    title="แดชบอร์ดผู้จัดการ"
    description="รายการที่ต้องตรวจสอบวันนี้และสถานะทีมปัจจุบัน"
  />
</Page>
```

- [ ] **Step 2: Create dashboard stat grid**

Render:

```tsx
<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <StatTile label="รอตรวจ" value={dashboardData.submissions.length + dashboardData.pendingRequests.length} icon={<CheckSquare className="h-5 w-5" />} tone="amber" />
  <StatTile label="กำลังทำงาน" value={dashboardData.activeStaff.length} helper={`${dashboardData.branchEmployees.length} คนในสาขา`} icon={<Activity className="h-5 w-5" />} tone="green" />
  <StatTile label="ลงเวลาวันนี้" value={dashboardData.todayRecordsCount} icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
  <StatTile label="เกินกำหนด" value={dashboardData.overdueCount} icon={<ShieldAlert className="h-5 w-5" />} tone="red" />
</div>
```

- [ ] **Step 3: Move quick actions below decision cards**

Quick actions should use secondary/outline buttons inside a `PageSection` named `ทางลัด` rather than a hero CTA row.

- [ ] **Step 4: Redesign manager review list**

In `src/app/manager/review/page.tsx`, replace the header with `PageHeader`. Use `Tabs` instead of custom tab buttons. Render review items as list cards:

```tsx
<button
  type="button"
  onClick={() => openSubmission(submission)}
  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40"
>
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-950">{task?.title || template?.title || 'งานที่ส่งตรวจ'}</p>
      <p className="mt-1 text-xs text-slate-500">{employee?.full_name || 'ไม่ระบุพนักงาน'}</p>
    </div>
    <Badge variant={submission.review_status === 'pending' ? 'warning' : 'success'}>{submission.review_status}</Badge>
  </div>
</button>
```

- [ ] **Step 5: Keep approve/reject only in detail modal**

In the review modal/detail, render approve/reject buttons in the modal footer area:

```tsx
<div className="grid grid-cols-2 gap-2">
  <Button variant="danger" loading={processing} onClick={() => void handleReview('rejected')}>ไม่อนุมัติ</Button>
  <Button loading={processing} onClick={() => void handleReview('approved')}>อนุมัติ</Button>
</div>
```

- [ ] **Step 6: Align manager requests page with review queue style**

In `src/app/manager/requests/page.tsx`, apply `PageHeader`, `Tabs`, list cards, and one primary approval action in the selected request modal/detail.

- [ ] **Step 7: Run targeted lint**

Run:

```powershell
npx eslint src\app\manager\page.tsx src\app\manager\review\page.tsx src\app\manager\review\[id]\page.tsx src\app\manager\requests\page.tsx
```

Expected: no errors. Existing unused `myTasks` in manager dashboard should be removed if still present.

- [ ] **Step 8: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Commit manager dashboard and review**

Run:

```powershell
git add src/app/manager/page.tsx src/app/manager/review/page.tsx src/app/manager/review/[id]/page.tsx src/app/manager/requests/page.tsx
git commit -m "refactor: focus manager dashboard and review queue"
```

Expected: commit succeeds.

---

### Task 8: Redesign Manager Workforce Pages

**Files:**
- Modify: `src/app/manager/employees/page.tsx`
- Modify: `src/app/manager/branches/page.tsx`
- Modify: `src/app/manager/attendance/page.tsx`
- Modify: `src/app/manager/schedule/page.tsx`
- Modify: `src/app/manager/assignments/page.tsx`
- Modify: `src/app/manager/templates/page.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Apply shared page headers**

For every file in this task, use `Page` and `PageHeader`. Header actions should be one primary action:

```tsx
<PageHeader
  title="พนักงาน"
  description="จัดการข้อมูลพนักงาน สถานะ และสาขา"
  action={<Button icon={<Plus className="h-4 w-4" />}>เพิ่มพนักงาน</Button>}
/>
```

Use the appropriate title and action per page.

- [ ] **Step 2: Standardize filter bars**

For pages with filters, use one `Card className="p-3"` containing a responsive grid:

Create per-page filter options before the JSX. For branch-aware pages, use this shape:

```tsx
const branchOptions = [
  { value: '', label: 'ทุกสาขา' },
  ...branchStore.branches.map((branch) => ({ value: branch.id, label: branch.name })),
];
```

```tsx
<Card className="p-3">
  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
    <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ค้นหา..." />
    <Select options={branchOptions} value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} />
    <Button variant="outline" icon={<Download className="h-4 w-4" />}>Export</Button>
  </div>
</Card>
```

- [ ] **Step 3: Use table on desktop and cards on mobile**

For `attendance`, `employees`, `schedule`, and `assignments`, keep desktop tables inside:

Create a display row array before rendering each table/list:

```tsx
const tableRows = filteredItems.map((item) => ({
  id: item.id,
  name: item.name,
  statusLabel: item.statusLabel,
  action: (
    <Button size="sm" variant="ghost" onClick={() => openItem(item.id)}>
      เปิดดู
    </Button>
  ),
}));
```

```tsx
<div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
  <div className="overflow-x-auto app-scrollbar">
    <table className="w-full min-w-[760px] text-left">
      <thead>
        <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
          <th className="px-4 py-3">ชื่อ</th>
          <th className="px-4 py-3">สถานะ</th>
          <th className="px-4 py-3 text-right">การจัดการ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {tableRows.map((row) => (
          <tr key={row.id}>
            <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.name}</td>
            <td className="px-4 py-3 text-sm text-slate-500">{row.statusLabel}</td>
            <td className="px-4 py-3 text-right">{row.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

Add mobile list:

```tsx
<div className="space-y-3 md:hidden">
  {tableRows.map((row) => (
    <Card key={row.id} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{row.name}</p>
          <p className="mt-1 text-xs text-slate-500">{row.statusLabel}</p>
        </div>
        {row.action}
      </div>
    </Card>
  ))}
</div>
```

- [ ] **Step 4: Remove oversized decorative styling**

In these files, remove or replace classes containing:

```text
rounded-[2.5rem]
rounded-[3rem]
shadow-2xl
shadow-xl
blur-3xl
tracking-[0.2em]
```

Use `rounded-2xl`, `shadow-sm`, and normal Thai label casing.

- [ ] **Step 5: Fix manager schedule hook warning if still present**

In `src/app/manager/schedule/page.tsx`, if eslint warns about unnecessary dependencies `branchPolicies` or `shiftTemplates`, remove only the unnecessary dependencies from that `useMemo` dependency array and confirm behavior still matches the memo body.

- [ ] **Step 6: Run targeted lint**

Run:

```powershell
npx eslint src\app\manager\employees\page.tsx src\app\manager\branches\page.tsx src\app\manager\attendance\page.tsx src\app\manager\schedule\page.tsx src\app\manager\assignments\page.tsx src\app\manager\templates\page.tsx
```

Expected: no errors. Existing unused `useMemo` in manager assignments should be removed if still present.

- [ ] **Step 7: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit workforce pages**

Run:

```powershell
git add src/app/manager/employees/page.tsx src/app/manager/branches/page.tsx src/app/manager/attendance/page.tsx src/app/manager/schedule/page.tsx src/app/manager/assignments/page.tsx src/app/manager/templates/page.tsx
git commit -m "refactor: standardize manager workforce pages"
```

Expected: commit succeeds.

---

### Task 9: Redesign Manager Payroll, Reports, Settings, More

**Files:**
- Modify: `src/app/manager/payroll/page.tsx`
- Modify: `src/app/manager/reports/page.tsx`
- Modify: `src/app/manager/settings/page.tsx`
- Modify: `src/app/manager/more/page.tsx`
- Test: targeted eslint and build

- [ ] **Step 1: Preserve existing payroll ledger changes**

Before editing payroll, run:

```powershell
git diff -- src\app\manager\payroll\page.tsx src\lib\hr.ts
```

Expected: existing payroll ledger changes are visible. Preserve `attendance_reward`, `task_reward`, `expense_reimbursement`, `advance_deduction`, `total_earnings`, and `total_deductions`.

- [ ] **Step 2: Reframe payroll page as ledger**

In `src/app/manager/payroll/page.tsx`, keep business calculations and export logic. Use:

```tsx
<Page maxWidth="xl" className="space-y-6">
  <PageHeader
    title="ค่าแรง"
    description="ตรวจรายได้ รายการหัก เบิกล่วงหน้า และยอดสุทธิของพนักงาน"
    action={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={handleExportCSV}>Export</Button>}
  />
</Page>
```

- [ ] **Step 3: Convert payroll dashboard cards to StatTile**

Use:

```tsx
<div className="grid gap-3 md:grid-cols-3">
  <StatTile label="รายได้รวม" value={formatCurrency(viewMode === 'overview' ? branchTotals.earnings : (payrollSummary?.total_earnings || 0))} tone="green" />
  <StatTile label="รายการหักรวม" value={formatCurrency(viewMode === 'overview' ? branchTotals.deductions : (payrollSummary?.total_deductions || 0))} tone="red" />
  <StatTile label="ยอดสุทธิ" value={formatCurrency(viewMode === 'overview' ? branchTotals.net : (payrollSummary?.net_pay || 0))} tone="slate" />
</div>
```

- [ ] **Step 4: Make payroll detail responsive**

Desktop: keep table with `min-w-[900px]` in bounded overflow.

Mobile: add employee summary cards:

```tsx
<div className="space-y-3 lg:hidden">
  {filteredSummaries.map((summary) => {
    const employee = branchEmployees.find((item) => item.id === summary.user_id);
    return (
      <Card key={summary.user_id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{employee?.full_name || '-'}</p>
            <p className="mt-1 text-xs text-slate-500">มาทำงาน {summary.worked_days} วัน</p>
          </div>
          <p className="text-sm font-bold text-slate-950">{formatCurrency(summary.net_pay)}</p>
        </div>
      </Card>
    );
  })}
</div>
```

- [ ] **Step 5: Simplify reports and settings**

In `reports` and `settings`, use `PageHeader`, `PageSection`, and compact cards. Remove unused imports in settings:

```tsx
import { useState } from 'react';
```

Only keep icons and store selectors actually used.

- [ ] **Step 6: Redesign manager more page as secondary menu**

In `src/app/manager/more/page.tsx`, use `Page maxWidth="sm"` and render menu rows:

```tsx
<Card interactive className="flex items-center gap-3 p-3">
  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>{item.icon}</div>
  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{item.label}</span>
  <ArrowRight className="h-4 w-4 text-slate-400" />
</Card>
```

- [ ] **Step 7: Run targeted lint**

Run:

```powershell
npx eslint src\app\manager\payroll\page.tsx src\app\manager\reports\page.tsx src\app\manager\settings\page.tsx src\app\manager\more\page.tsx
```

Expected: no errors. Existing unused imports in settings should be fixed.

- [ ] **Step 8: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Commit payroll and support pages**

Run:

```powershell
git add src/app/manager/payroll/page.tsx src/app/manager/reports/page.tsx src/app/manager/settings/page.tsx src/app/manager/more/page.tsx
git commit -m "refactor: clarify manager payroll and support pages"
```

Expected: commit succeeds.

---

### Task 10: Responsive Visual QA

**Files:**
- Modify: only files needed to fix QA findings
- Test: browser visual checks, targeted eslint, build

- [ ] **Step 1: Start the dev server**

Run:

```powershell
npm run dev
```

Expected: local Next.js dev server starts. If port 3000 is occupied, use the URL printed by Next.js.

- [ ] **Step 2: Define smoke routes**

Use these routes for visual QA:

```text
/employee
/employee/check-in
/employee/tasks
/employee/requests
/employee/profile
/manager
/manager/review
/manager/attendance
/manager/payroll
/manager/settings
```

- [ ] **Step 3: Check desktop viewport**

Use the in-app Browser or Playwright with viewport `1440x900`. For each route, verify:

```text
Page is not blank.
No Next.js error overlay.
No unintended horizontal page overflow.
Header/sidebar/bottom nav do not cover primary content.
There is only one visually dominant primary action per main section.
```

- [ ] **Step 4: Check mobile viewport**

Use viewport `390x844`. For each route, verify:

```text
No unintended horizontal page overflow.
Bottom nav does not hide final content.
Button text does not overflow its button.
Tables either scroll in a bounded area or render mobile cards.
Modals and bottom sheets fit within the viewport.
```

- [ ] **Step 5: Exercise interactions**

Exercise safe interactions that do not mutate production-like data unless already in local/dev state:

```text
Open notification link.
Switch task/request/review tabs.
Open and close a modal/bottom sheet.
Open profile action sheet.
Open manager more menu links.
Use search/filter inputs where present.
```

- [ ] **Step 6: Fix QA findings**

For each issue, make the smallest scoped fix. Examples:

```tsx
className="min-w-0 truncate"
```

for overflowing text, or:

```tsx
className="overflow-x-auto app-scrollbar"
```

for bounded desktop table overflow.

- [ ] **Step 7: Run targeted lint for changed files**

Run:

```powershell
$changedTsFiles = git diff --name-only --diff-filter=ACM | Where-Object { $_ -match '\.(ts|tsx)$' }
if ($changedTsFiles) {
  npx eslint $changedTsFiles
}
```

Expected: no errors in changed files.

- [ ] **Step 8: Run build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 9: Commit QA fixes**

Run:

```powershell
$changedFiles = git diff --name-only --diff-filter=ACM
git add -- $changedFiles
git commit -m "fix: polish operational responsive layouts"
```

Expected: commit succeeds if there are QA fixes. If no fixes are needed, do not create an empty commit.

---

### Task 11: Final Verification And Handoff

**Files:**
- Modify: none unless final verification reveals a small issue
- Test: build, targeted lint, optional full lint report

- [ ] **Step 1: Run final build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Run full lint and classify results**

Run:

```powershell
npm run lint
```

Expected: either no errors, or only pre-existing unrelated errors. If errors remain, list them by file and confirm whether each file was edited by this redesign.

- [ ] **Step 3: Run git diff check**

Run:

```powershell
git diff --check
```

Expected: no trailing whitespace in files edited by the redesign. If unrelated dirty files still have whitespace from earlier work, do not fix them unless they are part of the redesign commits.

- [ ] **Step 4: Confirm git status**

Run:

```powershell
git status --short
```

Expected: only intentional files remain dirty. Report any unrelated pre-existing changes that were not included.

- [ ] **Step 5: Prepare final user report**

Summarize:

```text
Changed surfaces:
- Shared UI foundation
- App shell and navigation
- Employee daily workflows
- Manager operational workflows

Verification:
- Build result
- Targeted lint result
- Visual QA routes and viewport sizes
- Remaining known risks
```

No commit is required in this task unless a final fix was made.

---

## Self-Review

Spec coverage:

- Shared UI primitives are covered by Tasks 1 and 2.
- Layout shell and navigation are covered by Task 3.
- Employee pages are covered by Tasks 4, 5, and 6.
- Manager pages are covered by Tasks 7, 8, and 9.
- Responsiveness, overflow, modal behavior, and visual QA are covered by Task 10.
- Final build/lint/handoff are covered by Task 11.

Placeholder scan:

- The plan contains no `TBD`, `TODO`, `FIXME`, or "implement later" placeholders.
- Steps that modify code include concrete target files and representative code blocks.

Type consistency:

- New shared component names are consistently `Page`, `PageHeader`, `PageSection`, `StatTile`, `EmptyState`, and `ActionRow`.
- Navigation item shape remains the existing `{ label, href, icon }`.
- Existing business stores and payroll summary fields are preserved and not renamed.
