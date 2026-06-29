# Employee Payroll Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect attendance, task rewards, approved leave, advance deductions, and expense reimbursements into one payroll summary that employees can see on their profile.

**Architecture:** Extend the existing `buildPayrollSummary()` calculation in `src/lib/hr.ts` so manager payroll and employee profile share one source of truth. Add a migration to set the late deduction default to 1 THB/minute for existing compensation profiles. Render the current month summary on `/employee/profile` without adding a new write-heavy ledger table.

**Tech Stack:** Next.js App Router, React client components, Zustand stores, Supabase Postgres, TypeScript.

---

### Task 1: Extend Payroll Calculation

**Files:**
- Modify: `src/lib/hr.ts`
- Modify: `src/lib/types.ts`

- [ ] Add task reward, check-in reward, expense reimbursement, advance deduction, and total deduction fields to `PayrollSummary`.
- [ ] Add optional `tasks` and `taskTemplates` inputs to `buildPayrollSummary()`.
- [ ] Count only approved tasks as earned pay.
- [ ] Keep approved leave connected to attendance summaries through the existing leave-day logic.
- [ ] Use late deduction rate from compensation profile, with new profiles defaulting to 1 THB/minute.

### Task 2: Wire Manager Payroll To The Expanded Summary

**Files:**
- Modify: `src/app/manager/payroll/page.tsx`

- [ ] Pass task rows and task templates into `buildPayrollSummary()`.
- [ ] Include task reward, check-in reward, expense reimbursements, and advance deductions in totals.
- [ ] Show those line items in the payroll detail ledger.

### Task 3: Show Employee Money Snapshot On Profile

**Files:**
- Modify: `src/app/employee/profile/page.tsx`

- [ ] Import attendance/task stores and payroll helpers.
- [ ] Compute the current month payroll summary for the current user.
- [ ] Add a compact money card near the top of the profile showing net pay, earned items, and deductions.
- [ ] Include late deduction detail, approved leave, advance deduction, task reward, check-in reward, and expense reimbursement.

### Task 4: Add SQL Migration For Late Deduction Default

**Files:**
- Create: `supabase/migrations/<timestamp>_payroll_ledger_defaults.sql`

- [ ] Use `supabase migration new payroll_ledger_defaults`.
- [ ] Update existing compensation profiles where `late_deduction_rate` is `0` or `null` to `1`.
- [ ] Add comments documenting the money meaning of approved advance and expense requests.

### Task 5: Verify

**Files:**
- No new test file unless the project already has a test runner.

- [ ] Run targeted ESLint on modified TS/TSX files.
- [ ] Run `npm run build`.
- [ ] Attempt `supabase db lint --local`; if local DB is unavailable, record the limitation.
