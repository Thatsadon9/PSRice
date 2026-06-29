-- Link payroll policy defaults to the employee-facing compensation ledger.
-- Default late check-ins now deduct 1 THB per minute unless a profile overrides it.

do $$
begin
  if to_regclass('public.compensation_profiles') is not null then
    alter table public.compensation_profiles
      alter column late_deduction_rate set default 1;

    update public.compensation_profiles
    set
      late_deduction_rate = 1,
      updated_at = now()
    where late_deduction_rate is null
      or late_deduction_rate = 0;

    execute 'comment on column public.compensation_profiles.late_deduction_rate is ''Amount in THB deducted per late minute. Default policy is 1 THB per minute.''';
  end if;

  if to_regclass('public.employee_requests') is not null then
    execute 'comment on column public.employee_requests.amount is ''Money amount for advance and expense requests. Approved advance requests reduce net payroll; approved expense requests increase reimbursable earnings.''';
  end if;
end $$;
