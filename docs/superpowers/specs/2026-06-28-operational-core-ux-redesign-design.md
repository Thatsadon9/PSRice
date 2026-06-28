# PS Rice Operational Core UX/UI Redesign

Date: 2026-06-28
Status: approved design direction, pending implementation plan

## Goal

Redesign the PS Rice web app into a calmer, more official, easier-to-use operations system while keeping the existing green, white, and slate theme. The redesign should reduce visual noise, prevent overflow or broken layouts, make primary actions obvious, and keep employee and manager workflows fast on the devices they actually use.

## Approved Direction

Use the **Operational Core** direction.

This means the product should feel like a work tool rather than a decorative dashboard. Each screen should answer:

- What needs attention now?
- What is the main action?
- Where are the supporting details?
- What can be safely moved into a secondary menu?

The UI should keep the PS Rice identity, but reduce large shadows, oversized rounded corners, decorative blur effects, excessive uppercase text, and competing primary buttons.

## Scope

This is a full UI/UX pass across both employee and manager surfaces.

Included:

- Shared UI primitives: Button, Card, Input, Select, TextArea, Modal, Tabs, Badge where needed.
- Layout shell: Header, Sidebar, BottomNav, main content containers, loading shells.
- Employee pages: dashboard, check-in, tasks, task detail, requests, history, schedule, notifications, profile, settings.
- Manager pages: dashboard, review, review detail, attendance, payroll, employees, branches, schedule, assignments, templates, requests, reports, settings, more.
- Responsive behavior for mobile and desktop.
- Visual QA for common overflow, clipping, crowding, and action hierarchy issues.

Out of scope:

- Database schema changes.
- Business logic changes unless a layout bug exposes a small UI-only data formatting need.
- New product features beyond reorganizing existing workflows.

## Information Architecture

### Employee

Employee navigation should prioritize daily work.

Primary mobile navigation:

- Home
- Check-in
- Tasks
- Profile / Money
- More

Employee page purposes:

- Home: today's shift, current check-in state, urgent tasks, payroll snapshot, pending request count.
- Check-in: one focused flow: location status, camera/selfie, confirmation, result.
- Tasks: clear tabs for today, pending, waiting for review, rejected/fix needed, completed.
- Requests: one request hub for leave, salary advance, and expense requests.
- Profile / Money: identity, bank info, documents, current payroll summary, deductions, salary advances.
- More: lower-frequency items like history, schedule, notifications, settings, logout.

### Manager

Manager navigation should group operational responsibilities.

Desktop sidebar groups:

- Overview
- Review and approvals
- Workforce and shifts
- Payroll and reports
- Settings

Manager mobile navigation:

- Dashboard
- Review
- Employees
- Payroll
- More

Manager page purposes:

- Dashboard: today's decision queue, active staff, pending approvals, attendance exceptions, overdue work.
- Review Hub: task submissions and employee requests surfaced as a review queue.
- Workforce: employees, branches, shifts, and attendance should use consistent filters and list/table patterns.
- Payroll: one ledger model for earnings, deductions, advances, reimbursements, and exports.
- Settings: policy and configuration pages, not daily action surfaces.

## Action Hierarchy

Each page section should have at most one primary action. Primary actions use the green theme and should be reserved for important workflow movement, such as check-in, create, approve, save, or export.

Secondary actions should use outline, secondary, ghost, icon buttons, tabs, menus, or row actions.

Rules:

- Do not place multiple green buttons in the same visual block unless it is a deliberate two-choice confirmation state.
- Avoid long text inside compact buttons; use icons with labels only where the action is clear.
- On mobile, primary page actions can become full-width sticky or bottom actions when the workflow benefits from it.
- Destructive actions should stay red and separated from normal actions.

## Visual System

Keep:

- Existing primary green family.
- White cards over slate background.
- Slate text hierarchy.
- Lucide icons.
- Thai-friendly font stack.

Reduce:

- Rounded corners above 24px except for rare brand or avatar elements.
- Heavy shadows like `shadow-xl` and `shadow-2xl` as default surface styling.
- Decorative blur blobs, oversized gradients, and ornamental backgrounds.
- Excessive uppercase labels and wide tracking on Thai UI text.
- Nested cards and floating card sections.

Default surface style:

- Page background: slate-50.
- Cards: white, 12-16px radius, subtle border, light or no shadow.
- Sections: unframed layout bands or simple cards only when content needs containment.
- Spacing: compact but breathable, with consistent 12/16/24px rhythm.

## Component Contracts

### Button

Button variants should encode meaning:

- Primary: main action.
- Success: positive workflow action when distinct from primary.
- Secondary: neutral supportive action.
- Outline: lower-emphasis command.
- Ghost: tool/action inside a dense area.
- Danger: destructive command.

Buttons must avoid text overflow on mobile, support icon-only cases with accessible labels, and keep stable height so rows do not shift.

### Card

Cards should be functional containers, not decoration.

Rules:

- Default radius 12-16px.
- Default border present.
- Shadow subtle by default.
- Responsive padding.
- No card inside card unless the inner element is a repeated list item, modal section, or genuine sub-record.

### Forms

Forms should be easy to complete on mobile.

Rules:

- Labels are visible and concise.
- Helper text is short and below the field.
- Input, select, and textarea heights are consistent.
- Error states are inline and do not shift layout excessively.
- Form actions sit at the end of the form; on long mobile flows, use a sticky footer only when needed.

### Tables And Lists

Desktop can use tables. Mobile should not force wide tables when a row-card list would be clearer.

Rules:

- Desktop: filter bar above table, table inside a bounded overflow container only when needed.
- Mobile: transform dense table rows into compact cards with key fields and an action menu.
- Long text truncates with a detail view or tooltip-style reveal.
- Numeric values align consistently.

### Modal And Bottom Sheet

Use bottom sheets for mobile actions and short forms. Use centered modals for desktop.

Rules:

- Header remains sticky for long content.
- Footer actions should remain visible when a form is long.
- Body has safe scrolling and should not trap content below the viewport.

## Page-Level Redesign Rules

### Employee Dashboard

Replace decorative hero composition with a compact daily status surface. The main action is check-in or check-out. Secondary cards show shift, tasks, payroll snapshot, and pending requests.

### Employee Check-In

Use a step-like flow:

1. Confirm location and branch.
2. Open camera/selfie.
3. Review confirmation details.
4. Submit and show result.

The page should avoid presenting all GPS, camera, policy, and result panels at equal visual weight.

### Employee Tasks

Use tabs and status grouping. Each task card should show due state, reward if any, required proof type, and one next action.

### Employee Requests

Use a unified request hub with request-type selection. Avoid separate competing CTAs for leave, advance, and expense on first view.

### Employee Profile / Money

Keep the payroll summary near the top. Show net pay, earnings, deductions, advances, and key document/bank state. Move edit actions into clear sections or an action sheet.

### Manager Dashboard

Prioritize decision queues over decorative hero text. Show pending reviews, pending requests, active staff, attendance exceptions, and overdue tasks. Keep quick actions secondary.

### Manager Review

Create a review queue pattern shared by task submissions and employee requests where possible. The primary action is approve/reject on selected item detail, not many buttons in the list.

### Manager Workforce Pages

Employees, branches, schedules, and attendance should share filter bar, table/list, and action menu conventions.

### Manager Payroll

Keep payroll as a ledger model: earnings, deductions, advances, reimbursement, net pay. Tables should be readable on desktop and become row cards on mobile.

### Settings

Settings should look utilitarian: grouped policy sections, clear save actions, and no large dashboard styling.

## Responsiveness And Layout Safety

Validation targets:

- No unintended horizontal page overflow at 390px mobile width.
- Header, bottom nav, and sticky actions do not obscure content.
- Button text wraps or truncates gracefully.
- Tables have a mobile alternative when content is too wide.
- Cards and panels keep stable dimensions when labels or numeric values change.

## Accessibility

- Maintain focus-visible states.
- Icon-only buttons require `aria-label` or visible title.
- Modal and bottom sheet close controls must be reachable.
- Form errors must be associated visually and semantically.
- Color should not be the only status indicator; labels and icons should support status.

## Implementation Strategy

Implementation should proceed in layers:

1. Foundation: shared UI primitives and layout shell.
2. Employee daily workflow pages.
3. Manager dashboard and review workflow.
4. Manager workforce, payroll, reports, and settings.
5. Visual QA pass and cleanup.

Each layer should compile and be visually checked before moving to the next.

## Verification Plan

Required:

- `npm run build`
- Targeted eslint for edited files.
- Browser visual QA on desktop and mobile widths.
- Check no framework error overlay.
- Check first meaningful content renders.
- Check common interactions: nav, primary CTA, modal/bottom sheet, form submit state where safe.

Core pages for QA:

- `/employee`
- `/employee/check-in`
- `/employee/tasks`
- `/employee/requests`
- `/employee/profile`
- `/manager`
- `/manager/review`
- `/manager/attendance`
- `/manager/payroll`
- `/manager/settings`

## Risks

- Full pass touches many files, so regressions are possible if done as one huge edit.
- Existing pending unrelated changes must not be reverted or accidentally included.
- Some pages may need temporary compatibility wrappers while shared components are tightened.
- Visual QA may require authenticated app state and representative data.
