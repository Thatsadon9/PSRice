import type { Priority, Task, TaskStatus, TaskTemplate } from '@/lib/types';

const PRIORITY_REWARD: Record<Priority, number> = {
  low: 50,
  medium: 100,
  high: 150,
  critical: 250,
};

const COMPLETED_STATUSES: TaskStatus[] = ['submitted', 'approved'];

type RewardSource = Task | TaskTemplate | null | undefined;
type TemplateResolver = (task: Task) => TaskTemplate | null | undefined;

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

function readTemplateSortOrder(template?: TaskTemplate | null) {
  return typeof template?.sort_order === 'number' && Number.isFinite(template.sort_order)
    ? template.sort_order
    : Number.MAX_SAFE_INTEGER;
}

function readTaskDateTime(task: Task) {
  return new Date(task.due_date || task.created_at).getTime();
}

export function isMilestoneComplete(status: TaskStatus) {
  return COMPLETED_STATUSES.includes(status);
}

export function isAttendanceTask(task: Task, template?: TaskTemplate | null) {
  return hasCheckInKeyword(task.title) || (template?.is_system === true && hasCheckInKeyword(template.title));
}

export function getMilestoneReward(task: Task, template?: TaskTemplate | null) {
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
