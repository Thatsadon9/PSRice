import type { Priority, RewardType, Task, TaskStatus, TaskSubmission, TaskTemplate } from '@/lib/types';

const PRIORITY_REWARD: Record<Priority, number> = {
  low: 50,
  medium: 100,
  high: 150,
  critical: 250,
};

const COMPLETED_STATUSES: TaskStatus[] = ['approved'];
const UNSUBMITTED_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'overdue'];

type RewardSource = Task | TaskTemplate | null | undefined;
type TemplateResolver = (task: Task) => TaskTemplate | null | undefined;
type UnitRewardSource = RewardSource | TaskSubmission;

function hasCheckInKeyword(value?: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return value.includes('เช็คอิน') || normalized.includes('check-in') || normalized.includes('check in');
}

function readNumericReward(source: RewardSource) {
  if (!source) return null;
  const record = source as unknown as Record<string, unknown>;
  const value = record.reward_amount ?? record.reward ?? record.amount ?? record.bonus_amount;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNumericField(source: UnitRewardSource | null | undefined, field: string) {
  if (!source) return null;
  const value = (source as unknown as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringField(source: RewardSource, field: string) {
  if (!source) return null;
  const value = (source as unknown as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTemplateSortOrder(template?: TaskTemplate | null) {
  return typeof template?.sort_order === 'number' && Number.isFinite(template.sort_order)
    ? template.sort_order
    : Number.MAX_SAFE_INTEGER;
}

function readTaskDateTime(task: Task) {
  return new Date(task.due_date || task.created_at).getTime();
}

function readDateOnly(value?: string | null) {
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function isMilestoneComplete(status: TaskStatus) {
  return COMPLETED_STATUSES.includes(status);
}

export function isMilestonePendingReview(status: TaskStatus) {
  return status === 'submitted';
}

export function isExpiredUnsubmittedTask(task: Task, currentDate: string) {
  const dueDate = readDateOnly(task.due_date);
  return Boolean(dueDate && dueDate < currentDate && UNSUBMITTED_STATUSES.includes(task.status));
}

export function isAttendanceTask(task: Task, template?: TaskTemplate | null) {
  return hasCheckInKeyword(task.title) || (template?.is_system === true && hasCheckInKeyword(template.title));
}

export function getRewardType(task?: Task | null, template?: TaskTemplate | null): RewardType {
  return (task?.reward_type || template?.reward_type || 'fixed') === 'unit' ? 'unit' : 'fixed';
}

export function isUnitRewardTask(task?: Task | null, template?: TaskTemplate | null) {
  return getRewardType(task, template) === 'unit';
}

export function getUnitLabel(task?: Task | null, template?: TaskTemplate | null) {
  return readStringField(task, 'unit_label') || readStringField(template, 'unit_label') || 'หน่วย';
}

export function getUnitRate(task?: Task | null, template?: TaskTemplate | null) {
  return readNumericField(task, 'unit_rate') ?? readNumericField(template, 'unit_rate') ?? 0;
}

export function getUnitStep(task?: Task | null, template?: TaskTemplate | null) {
  const step = readNumericField(task, 'unit_step') ?? readNumericField(template, 'unit_step') ?? 1;
  return step > 0 ? step : 1;
}

export function getTargetQuantity(task?: Task | null, template?: TaskTemplate | null) {
  return readNumericField(task, 'target_quantity') ?? readNumericField(template, 'target_quantity');
}

export function getUnitMin(task?: Task | null, template?: TaskTemplate | null) {
  return readNumericField(task, 'unit_min') ?? readNumericField(template, 'unit_min');
}

export function getUnitMax(task?: Task | null, template?: TaskTemplate | null) {
  return readNumericField(task, 'unit_max') ?? readNumericField(template, 'unit_max');
}

export function calculateUnitReward(quantity: number | null | undefined, unitRate: number | null | undefined) {
  const safeQuantity = typeof quantity === 'number' && Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const safeRate = typeof unitRate === 'number' && Number.isFinite(unitRate) ? Math.max(0, unitRate) : 0;
  return Number((safeQuantity * safeRate).toFixed(2));
}

export function validateUnitQuantity(
  quantity: number | null | undefined,
  task?: Task | null,
  template?: TaskTemplate | null,
) {
  if (!isUnitRewardTask(task, template)) {
    return { valid: true, message: null };
  }

  const unitLabel = getUnitLabel(task, template);

  if (quantity === null || quantity === undefined || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      valid: false,
      message: `กรุณากรอกจำนวน${unitLabel}ที่ทำได้`,
    };
  }

  const unitMin = getUnitMin(task, template);
  const unitMax = getUnitMax(task, template);
  const unitStep = getUnitStep(task, template);

  if (unitMin !== null && quantity < unitMin) {
    return {
      valid: false,
      message: `จำนวน${unitLabel}ต้องไม่น้อยกว่า ${formatUnitQuantity(unitMin)} ${unitLabel}`,
    };
  }

  if (unitMax !== null && quantity > unitMax) {
    return {
      valid: false,
      message: `จำนวน${unitLabel}ต้องไม่เกิน ${formatUnitQuantity(unitMax)} ${unitLabel}`,
    };
  }

  const stepBase = unitMin ?? 0;
  const stepsFromBase = (quantity - stepBase) / unitStep;
  const isAlignedToStep = Math.abs(stepsFromBase - Math.round(stepsFromBase)) < 1e-9;

  if (!isAlignedToStep) {
    return {
      valid: false,
      message: `จำนวน${unitLabel}ต้องเพิ่มทีละ ${formatUnitQuantity(unitStep)} ${unitLabel}`,
    };
  }

  return { valid: true, message: null };
}

export function getSubmittedQuantity(task?: Task | null, submission?: TaskSubmission | null) {
  return readNumericField(submission, 'submitted_quantity') ?? readNumericField(task, 'submitted_quantity');
}

export function getApprovedQuantity(task?: Task | null, submission?: TaskSubmission | null) {
  return readNumericField(submission, 'approved_quantity') ?? readNumericField(task, 'approved_quantity');
}

export function getMilestoneReward(task: Task, template?: TaskTemplate | null) {
  if (isUnitRewardTask(task, template)) {
    const approvedReward = readNumericField(task, 'approved_reward_amount');
    if (task.status === 'approved' && approvedReward !== null) {
      return approvedReward;
    }

    const unitRate = getUnitRate(task, template);
    const targetQuantity = getTargetQuantity(task, template);
    if (targetQuantity !== null) {
      return calculateUnitReward(targetQuantity, unitRate);
    }

    const submittedQuantity = getSubmittedQuantity(task);
    if (submittedQuantity !== null) {
      return calculateUnitReward(submittedQuantity, unitRate);
    }

    return 0;
  }

  if (typeof task.reward_amount === 'number') {
    return task.reward_amount;
  }

  const explicitReward = readNumericReward(task) ?? readNumericReward(template);
  if (explicitReward !== null) {
    return explicitReward;
  }

  const priority = (task.priority || template?.priority || 'medium') as Priority;
  return PRIORITY_REWARD[priority] ?? PRIORITY_REWARD.medium;
}

export function getEarnedMilestoneReward(task: Task, template?: TaskTemplate | null) {
  if (!isMilestoneComplete(task.status)) {
    return 0;
  }

  if (isUnitRewardTask(task, template)) {
    const approvedReward = readNumericField(task, 'approved_reward_amount');
    if (approvedReward !== null) {
      return approvedReward;
    }

    const approvedQuantity = getApprovedQuantity(task);
    if (approvedQuantity !== null) {
      return calculateUnitReward(approvedQuantity, getUnitRate(task, template));
    }
  }

  return getMilestoneReward(task, template);
}

export function formatUnitQuantity(quantity: number) {
  return new Intl.NumberFormat('th-TH', {
    maximumFractionDigits: 2,
  }).format(quantity);
}

export function formatMilestoneReward(task: Task, template?: TaskTemplate | null) {
  if (!isUnitRewardTask(task, template)) {
    return formatThaiCurrency(getMilestoneReward(task, template));
  }

  const unitLabel = getUnitLabel(task, template);
  const unitRate = getUnitRate(task, template);
  const approvedQuantity = getApprovedQuantity(task);
  if (task.status === 'approved' && approvedQuantity !== null) {
    return `${formatThaiCurrency(getEarnedMilestoneReward(task, template))} (${formatUnitQuantity(approvedQuantity)} ${unitLabel})`;
  }

  const submittedQuantity = getSubmittedQuantity(task);
  if (submittedQuantity !== null) {
    return `${formatThaiCurrency(calculateUnitReward(submittedQuantity, unitRate))} (${formatUnitQuantity(submittedQuantity)} ${unitLabel})`;
  }

  return `${formatThaiCurrency(unitRate)}/${unitLabel}`;
}

export function sortMilestoneTasks(tasks: Task[], getTemplate?: TemplateResolver) {
  return [...tasks].sort((left, right) => {
    const leftTime = readTaskDateTime(left);
    const rightTime = readTaskDateTime(right);

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    const leftTemplate = getTemplate?.(left) ?? null;
    const rightTemplate = getTemplate?.(right) ?? null;
    const leftIsAttendance = isAttendanceTask(left, leftTemplate);
    const rightIsAttendance = isAttendanceTask(right, rightTemplate);

    if (leftIsAttendance !== rightIsAttendance) {
      return leftIsAttendance ? -1 : 1;
    }

    const templateOrderDiff = readTemplateSortOrder(leftTemplate) - readTemplateSortOrder(rightTemplate);

    if (templateOrderDiff !== 0) {
      return templateOrderDiff;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

export function formatThaiCurrency(amount: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}
