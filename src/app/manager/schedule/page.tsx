'use client';
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isValid,
  parseISO,
  startOfToday,
} from 'date-fns';
import { th } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckSquare2,
  Clock3,
  Settings2,
  Users,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { normalizeTimeValue, timeToMinutes } from '@/lib/hr';
import type {
  BranchAttendancePolicy,
  ShiftAssignment,
  ShiftTemplate,
  User,
} from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { getContrastTextColor } from '@/lib/colorUtils';

type SlotKey = 'morning' | 'late' | 'full';

interface SlotDefinition {
  key: SlotKey;
  label: string;
  modalLabel: string;
  primaryCode: string;
  aliases: string[];
  keywords: string[];
  defaultName: string;
  defaultColor: string;
}

interface DragState {
  branchId: string;
  slotKey: SlotKey;
  anchorDate: string;
}

interface SelectionState {
  branchId: string;
  slotKey: SlotKey;
  startDate: string;
  endDate: string;
}

interface SlotConfig {
  templateId?: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyOutGraceMinutes: number;
  minimumOtMinutes: number;
  color: string;
}

interface PolicyDraft {
  shift_start_time: string;
  shift_end_time: string;
  break_minutes: number;
  late_grace_minutes: number;
  early_out_grace_minutes: number;
  minimum_ot_minutes: number;
}

interface SlotDraft {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  late_grace_minutes: number;
  early_out_grace_minutes: number;
  minimum_ot_minutes: number;
  color: string;
}

const MAX_VISIBLE_DAYS = 14;
const DEFAULT_VISIBLE_DAYS = 12;

const SLOT_DEFINITIONS: SlotDefinition[] = [
  {
    key: 'morning',
    label: 'เช้า',
    modalLabel: 'กะเช้า',
    primaryCode: 'AM',
    aliases: ['AM', 'MORNING'],
    keywords: ['เช้า', 'morning', 'am'],
    defaultName: 'กะเช้า',
    defaultColor: '#d97706',
  },
  {
    key: 'late',
    label: 'สาย',
    modalLabel: 'กะสาย',
    primaryCode: 'LATE',
    aliases: ['LATE', 'PM', 'AFTERNOON'],
    keywords: ['สาย', 'late', 'afternoon', 'pm'],
    defaultName: 'กะสาย',
    defaultColor: '#2563eb',
  },
  {
    key: 'full',
    label: 'FD',
    modalLabel: 'Full Day',
    primaryCode: 'DAY',
    aliases: ['DAY', 'FULL', 'FD'],
    keywords: ['fd', 'full', 'full day', 'day', 'ปกติ'],
    defaultName: 'กะ Full Day',
    defaultColor: '#0f766e',
  },
];

const BRANCH_PALETTES = [
  { branch: '#f7e7b2', slot: '#fff1cd', cell: '#fff9eb', border: '#b45309', accent: '#7c2d12' },
  { branch: '#d7eaff', slot: '#ebf5ff', cell: '#f7fbff', border: '#1d4ed8', accent: '#1e3a8a' },
  { branch: '#d7f4e2', slot: '#e8fbf0', cell: '#f5fdf8', border: '#0f766e', accent: '#115e59' },
  { branch: '#e7defc', slot: '#f2edff', cell: '#faf8ff', border: '#6d28d9', accent: '#4c1d95' },
  { branch: '#fbdcdb', slot: '#feeeee', cell: '#fff8f7', border: '#b91c1c', accent: '#7f1d1d' },
  { branch: '#f7ddfa', slot: '#fcf0ff', cell: '#fff8ff', border: '#a21caf', accent: '#701a75' },
];

function getPalette(index: number) {
  return BRANCH_PALETTES[index % BRANCH_PALETTES.length];
}

function getSafeDate(value: string, fallback: Date) {
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : fallback;
}

function addMinutesToTime(timeValue: string, minutesToAdd: number) {
  const minutesInDay = 24 * 60;
  const rawMinutes = timeToMinutes(timeValue) + minutesToAdd;
  const safeMinutes = ((rawMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getSpanMinutes(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : (24 * 60) - startMinutes + endMinutes;
}

function createDefaultPolicyDraft(policy?: BranchAttendancePolicy): PolicyDraft {
  return {
    shift_start_time: normalizeTimeValue(policy?.shift_start_time || '08:30'),
    shift_end_time: normalizeTimeValue(policy?.shift_end_time || '17:30'),
    break_minutes: Number(policy?.break_minutes ?? 60),
    late_grace_minutes: Number(policy?.late_grace_minutes ?? 15),
    early_out_grace_minutes: Number(policy?.early_out_grace_minutes ?? 0),
    minimum_ot_minutes: Number(policy?.minimum_ot_minutes ?? 30),
  };
}

function createSlotDraft(slotConfig: SlotConfig): SlotDraft {
  return {
    name: slotConfig.shiftName,
    start_time: normalizeTimeValue(slotConfig.startTime),
    end_time: normalizeTimeValue(slotConfig.endTime),
    break_minutes: Number(slotConfig.breakMinutes ?? 0),
    late_grace_minutes: Number(slotConfig.lateGraceMinutes ?? 15),
    early_out_grace_minutes: Number(slotConfig.earlyOutGraceMinutes ?? 0),
    minimum_ot_minutes: Number(slotConfig.minimumOtMinutes ?? 30),
    color: slotConfig.color,
  };
}

function getUserInitials(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return '?';
  }

  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

function getOrderedSelection(startDate: string, endDate: string): SelectionState['startDate'][] {
  return startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
}

function buildSelection(branchId: string, slotKey: SlotKey, startDate: string, endDate: string): SelectionState {
  const [orderedStart, orderedEnd] = getOrderedSelection(startDate, endDate);
  return {
    branchId,
    slotKey,
    startDate: orderedStart,
    endDate: orderedEnd,
  };
}

function getSelectionDateStrings(selection: SelectionState) {
  return eachDayOfInterval({
    start: parseISO(selection.startDate),
    end: parseISO(selection.endDate),
  }).map((date) => format(date, 'yyyy-MM-dd'));
}

function findTemplateForSlot(templates: ShiftTemplate[], slot: SlotDefinition) {
  return templates.find((template) => {
    const code = (template.code || '').trim().toUpperCase();
    if (slot.aliases.includes(code)) {
      return true;
    }

    const normalizedName = template.name.trim().toLowerCase();
    return slot.keywords.some((keyword) => normalizedName.includes(keyword.toLowerCase()));
  });
}

function deriveSlotConfig(slot: SlotDefinition, policy?: BranchAttendancePolicy): SlotConfig {
  const startTime = normalizeTimeValue(policy?.shift_start_time || '08:30');
  const endTime = normalizeTimeValue(policy?.shift_end_time || '17:30');
  const totalMinutes = getSpanMinutes(startTime, endTime);
  const halfSpanMinutes = Math.max(240, Math.round(totalMinutes / 2));

  if (slot.key === 'morning') {
    return {
      shiftName: slot.defaultName,
      startTime,
      endTime: addMinutesToTime(startTime, halfSpanMinutes),
      breakMinutes: 0,
      lateGraceMinutes: Number(policy?.late_grace_minutes ?? 15),
      earlyOutGraceMinutes: Number(policy?.early_out_grace_minutes ?? 0),
      minimumOtMinutes: Number(policy?.minimum_ot_minutes ?? 30),
      color: slot.defaultColor,
    };
  }

  if (slot.key === 'late') {
    return {
      shiftName: slot.defaultName,
      startTime: addMinutesToTime(endTime, -halfSpanMinutes),
      endTime,
      breakMinutes: 0,
      lateGraceMinutes: Number(policy?.late_grace_minutes ?? 15),
      earlyOutGraceMinutes: Number(policy?.early_out_grace_minutes ?? 0),
      minimumOtMinutes: Number(policy?.minimum_ot_minutes ?? 30),
      color: slot.defaultColor,
    };
  }

  return {
    shiftName: slot.defaultName,
    startTime,
    endTime,
    breakMinutes: Number(policy?.break_minutes ?? 60),
    lateGraceMinutes: Number(policy?.late_grace_minutes ?? 15),
    earlyOutGraceMinutes: Number(policy?.early_out_grace_minutes ?? 0),
    minimumOtMinutes: Number(policy?.minimum_ot_minutes ?? 30),
    color: slot.defaultColor,
  };
}

function resolveSlotConfig(
  slot: SlotDefinition,
  templates: ShiftTemplate[],
  policy?: BranchAttendancePolicy,
): SlotConfig {
  const matchedTemplate = findTemplateForSlot(templates, slot);

  if (matchedTemplate) {
    return {
      templateId: matchedTemplate.id,
      shiftName: matchedTemplate.name,
      startTime: normalizeTimeValue(matchedTemplate.start_time),
      endTime: normalizeTimeValue(matchedTemplate.end_time),
      breakMinutes: Number(matchedTemplate.break_minutes ?? 0),
      lateGraceMinutes: Number(matchedTemplate.late_grace_minutes ?? 15),
      earlyOutGraceMinutes: Number(matchedTemplate.early_out_grace_minutes ?? 0),
      minimumOtMinutes: Number(matchedTemplate.minimum_ot_minutes ?? 30),
      color: matchedTemplate.color || slot.defaultColor,
    };
  }

  return deriveSlotConfig(slot, policy);
}

function getSlotKeyForAssignment(
  assignment: ShiftAssignment,
  slotConfigMap: Record<SlotKey, SlotConfig> | undefined,
): SlotKey | undefined {
  if (slotConfigMap) {
    for (const slot of SLOT_DEFINITIONS) {
      const slotConfig = slotConfigMap[slot.key];
      if (slotConfig.templateId && assignment.shift_template_id === slotConfig.templateId) {
        return slot.key;
      }
    }
  }

  const normalizedShiftName = assignment.shift_name.trim().toLowerCase();
  for (const slot of SLOT_DEFINITIONS) {
    if (slot.keywords.some((keyword) => normalizedShiftName.includes(keyword.toLowerCase()))) {
      return slot.key;
    }
  }

  const normalizedStartTime = normalizeTimeValue(assignment.start_time);
  const normalizedEndTime = normalizeTimeValue(assignment.end_time);
  if (slotConfigMap) {
    for (const slot of SLOT_DEFINITIONS) {
      const slotConfig = slotConfigMap[slot.key];
      if (
        normalizedStartTime === normalizeTimeValue(slotConfig.startTime)
        && normalizedEndTime === normalizeTimeValue(slotConfig.endTime)
      ) {
        return slot.key;
      }
    }
  }

  return undefined;
}

export default function ManagerSchedulePage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const branches = useBranchStore((state) => state.branches);
  const users = useEmployeeStore((state) => state.users);
  const getBranchPolicy = useHrStore((state) => state.getBranchPolicy);
  const getShiftTemplatesByBranch = useHrStore((state) => state.getShiftTemplatesByBranch);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);
  const schemaReady = useHrStore((state) => state.schemaReady);
  const schemaMessage = useHrStore((state) => state.schemaMessage);
  const upsertBranchPolicy = useHrStore((state) => state.upsertBranchPolicy);
  const addShiftTemplate = useHrStore((state) => state.addShiftTemplate);
  const updateShiftTemplate = useHrStore((state) => state.updateShiftTemplate);
  const upsertShiftAssignment = useHrStore((state) => state.upsertShiftAssignment);
  const deleteShiftAssignment = useHrStore((state) => state.deleteShiftAssignment);

  const today = startOfToday();
  const [viewStartDate, setViewStartDate] = useState(format(today, 'yyyy-MM-dd'));
  const [viewEndDate, setViewEndDate] = useState(format(addDays(today, DEFAULT_VISIBLE_DAYS - 1), 'yyyy-MM-dd'));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingSelection, setPendingSelection] = useState<SelectionState | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionState | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [actionState, setActionState] = useState<'assign' | 'remove' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [configBranchId, setConfigBranchId] = useState('');
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, PolicyDraft>>({});
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>({});
  const [savingConfigKey, setSavingConfigKey] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const visibleRange = useMemo(() => {
    const fallbackStart = today;
    const rawStart = getSafeDate(viewStartDate, fallbackStart);
    const rawEnd = getSafeDate(viewEndDate, rawStart);
    const startDate = rawStart.getTime() <= rawEnd.getTime() ? rawStart : rawEnd;
    const endDate = rawStart.getTime() <= rawEnd.getTime() ? rawEnd : rawStart;
    const totalDays = differenceInCalendarDays(endDate, startDate) + 1;
    const isCapped = totalDays > MAX_VISIBLE_DAYS;
    const cappedEndDate = isCapped ? addDays(startDate, MAX_VISIBLE_DAYS - 1) : endDate;

    return {
      startDate,
      endDate: cappedEndDate,
      totalDays: differenceInCalendarDays(cappedEndDate, startDate) + 1,
      isCapped,
      days: eachDayOfInterval({ start: startDate, end: cappedEndDate }),
    };
  }, [today, viewEndDate, viewStartDate]);

  const employees = useMemo(() => {
    return users.filter((user) => user.role === 'employee');
  }, [users]);

  const branchEmployeesMap = useMemo(() => {
    const map = new Map<string, User[]>();
    branches.forEach((branch) => {
      map.set(branch.id, employees.filter((user) => user.branch_id === branch.id));
    });
    return map;
  }, [branches, employees]);

  const slotConfigByBranch = useMemo(() => {
    const map = new Map<string, Record<SlotKey, SlotConfig>>();

    branches.forEach((branch) => {
      const policy = getBranchPolicy(branch.id);
      const templates = getShiftTemplatesByBranch(branch.id);
      map.set(branch.id, {
        morning: resolveSlotConfig(SLOT_DEFINITIONS[0], templates, policy),
        late: resolveSlotConfig(SLOT_DEFINITIONS[1], templates, policy),
        full: resolveSlotConfig(SLOT_DEFINITIONS[2], templates, policy),
      });
    });

    return map;
  }, [branches, getBranchPolicy, getShiftTemplatesByBranch]);

  const userMap = useMemo(() => {
    return new Map(users.map((user) => [user.id, user]));
  }, [users]);

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>();
    const userMap = new Map(users.map((user) => [user.id, user]));

    shiftAssignments.forEach((assignment) => {
      if (assignment.status !== 'scheduled') {
        return;
      }

      const user = userMap.get(assignment.user_id);
      const branchId = assignment.branch_id || user?.branch_id;
      if (!branchId) {
        return;
      }

      const slotConfigMap = slotConfigByBranch.get(branchId);
      const slotKey = getSlotKeyForAssignment(assignment, slotConfigMap);
      if (!slotKey) {
        return;
      }

      const cellKey = `${branchId}::${slotKey}::${assignment.work_date}`;
      const current = map.get(cellKey) || [];
      current.push(assignment);
      map.set(cellKey, current);
    });

    return map;
  }, [shiftAssignments, slotConfigByBranch, users]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleMouseUp = () => {
      if (pendingSelection) {
        const selectedIds = new Set<string>();
        getSelectionDateStrings(pendingSelection).forEach((workDate) => {
          const cellKey = `${pendingSelection.branchId}::${pendingSelection.slotKey}::${workDate}`;
          (assignmentsByCell.get(cellKey) || []).forEach((assignment) => {
            selectedIds.add(assignment.user_id);
          });
        });

        setSelectedEmployeeIds(Array.from(selectedIds));
        setActionError(null);
        setActiveSelection(pendingSelection);
      }
      setDragState(null);
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [assignmentsByCell, dragState, pendingSelection]);

  const visibleAssignmentCount = useMemo(() => {
    const start = format(visibleRange.startDate, 'yyyy-MM-dd');
    const end = format(visibleRange.endDate, 'yyyy-MM-dd');
    return shiftAssignments.filter((assignment) => {
      return assignment.status === 'scheduled' && assignment.work_date >= start && assignment.work_date <= end;
    }).length;
  }, [shiftAssignments, visibleRange.endDate, visibleRange.startDate]);

  const modalBranch = activeSelection
    ? branches.find((branch) => branch.id === activeSelection.branchId) || null
    : null;
  const modalSlot = activeSelection
    ? SLOT_DEFINITIONS.find((slot) => slot.key === activeSelection.slotKey) || null
    : null;
  const modalSlotConfig = activeSelection
    ? slotConfigByBranch.get(activeSelection.branchId)?.[activeSelection.slotKey] || null
    : null;
  const modalEmployees = activeSelection ? branchEmployeesMap.get(activeSelection.branchId) || [] : [];
  const modalDateStrings = useMemo(() => {
    return activeSelection ? getSelectionDateStrings(activeSelection) : [];
  }, [activeSelection]);

  const modalAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();

    if (!activeSelection) {
      return counts;
    }

    modalDateStrings.forEach((workDate) => {
      const cellKey = `${activeSelection.branchId}::${activeSelection.slotKey}::${workDate}`;
      (assignmentsByCell.get(cellKey) || []).forEach((assignment) => {
        counts.set(assignment.user_id, (counts.get(assignment.user_id) || 0) + 1);
      });
    });

    return counts;
  }, [activeSelection, assignmentsByCell, modalDateStrings]);

  const resolvedConfigBranchId = configBranchId || branches[0]?.id || '';
  const configBranch = branches.find((branch) => branch.id === resolvedConfigBranchId) || null;
  const configPolicy = configBranch ? getBranchPolicy(configBranch.id) : undefined;
  const configPolicyDraft = configBranch
    ? (policyDrafts[configBranch.id] || createDefaultPolicyDraft(configPolicy))
    : null;

  const getConfigSlotDraft = (branchId: string, slotKey: SlotKey) => {
    const draftKey = `${branchId}:${slotKey}`;
    const slotConfig = slotConfigByBranch.get(branchId)?.[slotKey];
    if (!slotConfig) {
      return null;
    }

    return slotDrafts[draftKey] || createSlotDraft(slotConfig);
  };

  const jumpToPreset = (days: number) => {
    const safeStart = format(visibleRange.startDate, 'yyyy-MM-dd');
    setViewStartDate(safeStart);
    setViewEndDate(format(addDays(visibleRange.startDate, days - 1), 'yyyy-MM-dd'));
  };

  const moveDateWindow = (direction: -1 | 1) => {
    const delta = visibleRange.totalDays * direction;
    const nextStart = addDays(visibleRange.startDate, delta);
    const nextEnd = addDays(visibleRange.endDate, delta);
    setViewStartDate(format(nextStart, 'yyyy-MM-dd'));
    setViewEndDate(format(nextEnd, 'yyyy-MM-dd'));
  };

  const resetSelection = () => {
    setActiveSelection(null);
    setPendingSelection(null);
    setDragState(null);
    setSelectedEmployeeIds([]);
    setActionError(null);
    setActionState(null);
  };

  const handleCellMouseDown = (branchId: string, slotKey: SlotKey, workDate: string) => {
    setDragState({ branchId, slotKey, anchorDate: workDate });
    setPendingSelection(buildSelection(branchId, slotKey, workDate, workDate));
    setActiveSelection(null);
  };

  const handleCellMouseEnter = (branchId: string, slotKey: SlotKey, workDate: string) => {
    if (!dragState) {
      return;
    }

    if (dragState.branchId !== branchId || dragState.slotKey !== slotKey) {
      return;
    }

    setPendingSelection(buildSelection(branchId, slotKey, dragState.anchorDate, workDate));
  };

  const isCellSelected = (branchId: string, slotKey: SlotKey, workDate: string) => {
    const selection = pendingSelection || activeSelection;
    if (!selection) {
      return false;
    }

    return (
      selection.branchId === branchId
      && selection.slotKey === slotKey
      && workDate >= selection.startDate
      && workDate <= selection.endDate
    );
  };

  const toggleEmployee = (userId: string) => {
    setSelectedEmployeeIds((current) => {
      return current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
    });
  };

  const handleAssignSelection = async () => {
    if (!activeSelection || !modalSlotConfig || selectedEmployeeIds.length === 0 || !currentUser) {
      return;
    }

    setActionState('assign');
    setActionError(null);

    const operations: Promise<boolean>[] = [];
    modalDateStrings.forEach((workDate) => {
      selectedEmployeeIds.forEach((userId) => {
        operations.push(
          upsertShiftAssignment({
            user_id: userId,
            branch_id: activeSelection.branchId,
            shift_template_id: modalSlotConfig.templateId || null,
            work_date: workDate,
            shift_name: modalSlotConfig.shiftName,
            start_time: modalSlotConfig.startTime,
            end_time: modalSlotConfig.endTime,
            break_minutes: Number(modalSlotConfig.breakMinutes || 0),
            late_grace_minutes: Number(modalSlotConfig.lateGraceMinutes || 0),
            early_out_grace_minutes: Number(modalSlotConfig.earlyOutGraceMinutes || 0),
            minimum_ot_minutes: Number(modalSlotConfig.minimumOtMinutes || 0),
            status: 'scheduled',
            notes: null,
            created_by: currentUser.id,
          }),
        );
      });
    });

    const results = await Promise.all(operations);
    const failedCount = results.filter((result) => !result).length;

    if (failedCount > 0) {
      setActionError(`บันทึกกะไม่ครบ ${failedCount} รายการ`);
      setActionState(null);
      return;
    }

    resetSelection();
  };

  const handleRemoveSelection = async () => {
    if (!activeSelection || selectedEmployeeIds.length === 0) {
      return;
    }

    setActionState('remove');
    setActionError(null);

    const operations: Promise<boolean>[] = [];
    modalDateStrings.forEach((workDate) => {
      const cellKey = `${activeSelection.branchId}::${activeSelection.slotKey}::${workDate}`;
      (assignmentsByCell.get(cellKey) || []).forEach((assignment) => {
        if (selectedEmployeeIds.includes(assignment.user_id)) {
          operations.push(deleteShiftAssignment(assignment.id));
        }
      });
    });

    if (operations.length === 0) {
      setActionError('ไม่มีรายการของพนักงานที่เลือกในช่วงวันที่นี้');
      setActionState(null);
      return;
    }

    const results = await Promise.all(operations);
    const failedCount = results.filter((result) => !result).length;

    if (failedCount > 0) {
      setActionError(`ลบกะไม่ครบ ${failedCount} รายการ`);
      setActionState(null);
      return;
    }

    resetSelection();
  };

  const updatePolicyDraft = <K extends keyof PolicyDraft>(field: K, value: PolicyDraft[K]) => {
    if (!configBranch) {
      return;
    }

    setPolicyDrafts((current) => ({
      ...current,
      [configBranch.id]: {
        ...(current[configBranch.id] || createDefaultPolicyDraft(configPolicy)),
        [field]: value,
      },
    }));
  };

  const updateSlotDraft = <K extends keyof SlotDraft>(slotKey: SlotKey, field: K, value: SlotDraft[K]) => {
    if (!configBranch) {
      return;
    }

    const draftKey = `${configBranch.id}:${slotKey}`;
    const existingDraft = getConfigSlotDraft(configBranch.id, slotKey);
    if (!existingDraft) {
      return;
    }

    setSlotDrafts((current) => ({
      ...current,
      [draftKey]: {
        ...existingDraft,
        [field]: value,
      },
    }));
  };

  const handleSaveBranchPolicy = async () => {
    if (!configBranch || !configPolicyDraft) {
      return;
    }

    setSavingConfigKey(`policy:${configBranch.id}`);
    await upsertBranchPolicy(configBranch.id, {
      shift_start_time: normalizeTimeValue(configPolicyDraft.shift_start_time),
      shift_end_time: normalizeTimeValue(configPolicyDraft.shift_end_time),
      break_minutes: Number(configPolicyDraft.break_minutes || 0),
      late_grace_minutes: Number(configPolicyDraft.late_grace_minutes || 0),
      early_out_grace_minutes: Number(configPolicyDraft.early_out_grace_minutes || 0),
      minimum_ot_minutes: Number(configPolicyDraft.minimum_ot_minutes || 0),
    });
    setSavingConfigKey(null);
  };

  const handleSaveSlotTemplate = async (slot: SlotDefinition) => {
    if (!configBranch) {
      return;
    }

    const slotDraft = getConfigSlotDraft(configBranch.id, slot.key);
    if (!slotDraft) {
      return;
    }

    const branchTemplates = getShiftTemplatesByBranch(configBranch.id);
    const existingTemplate = findTemplateForSlot(branchTemplates, slot);

    setSavingConfigKey(`slot:${configBranch.id}:${slot.key}`);

    if (existingTemplate) {
      await updateShiftTemplate(existingTemplate.id, {
        name: slotDraft.name.trim() || slot.defaultName,
        code: slot.primaryCode,
        start_time: normalizeTimeValue(slotDraft.start_time),
        end_time: normalizeTimeValue(slotDraft.end_time),
        break_minutes: Number(slotDraft.break_minutes || 0),
        late_grace_minutes: Number(slotDraft.late_grace_minutes || 0),
        early_out_grace_minutes: Number(slotDraft.early_out_grace_minutes || 0),
        minimum_ot_minutes: Number(slotDraft.minimum_ot_minutes || 0),
        color: slotDraft.color,
        is_active: true,
      });
    } else {
      await addShiftTemplate({
        branch_id: configBranch.id,
        name: slotDraft.name.trim() || slot.defaultName,
        code: slot.primaryCode,
        color: slotDraft.color,
        start_time: normalizeTimeValue(slotDraft.start_time),
        end_time: normalizeTimeValue(slotDraft.end_time),
        break_minutes: Number(slotDraft.break_minutes || 0),
        late_grace_minutes: Number(slotDraft.late_grace_minutes || 0),
        early_out_grace_minutes: Number(slotDraft.early_out_grace_minutes || 0),
        minimum_ot_minutes: Number(slotDraft.minimum_ot_minutes || 0),
        is_active: true,
      });
    }

    setSavingConfigKey(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Compact Header & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600">
            <CalendarDays className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">จัดการตารางพนักงาน</h1>
            <p className="text-sm text-slate-500">บริหารจัดการกะรายวันสำหรับทุกสาขาในหน้าเดียว</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
            <div className="h-2 w-2 rounded-full bg-slate-900" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 leading-none">สาขา</p>
              <p className="text-lg font-bold text-slate-900">{branches.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-400 leading-none">พนักงาน</p>
              <p className="text-lg font-bold text-slate-900">{employees.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-primary-50 rounded-xl border border-primary-100">
            <div className="h-2 w-2 rounded-full bg-primary-500" />
            <div>
              <p className="text-[10px] uppercase font-bold text-primary-400 leading-none">กะที่จัดแล้ว</p>
              <p className="text-lg font-bold text-slate-900">{visibleAssignmentCount}</p>
            </div>
          </div>
          <div className="flex gap-2 ml-2">
            <Button 
              variant="secondary" 
              size="sm" 
              icon={<Settings2 className="w-4 h-4" />}
              onClick={() => setShowConfig(true)}
            >
              ตั้งค่ากะ
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="px-2"
              onClick={() => setShowHelp(true)}
            >
              <AlertTriangle className="w-4 h-4 text-slate-400" />
            </Button>
          </div>
        </div>
      </div>

      {!schemaReady && (
        <Card statusColor="amber" className="bg-amber-50/80">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">ยังไม่พบตาราง HR ในฐานข้อมูล</p>
              <p className="text-xs text-amber-800 mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Control Bar & Table Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden" padding="none">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <input
                type="date"
                value={viewStartDate}
                onChange={(e) => setViewStartDate(e.target.value)}
                className="text-sm font-medium focus:outline-none"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={viewEndDate}
                onChange={(e) => setViewEndDate(e.target.value)}
                className="text-sm font-medium focus:outline-none"
              />
            </div>
            
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {[7, 10, 14].map((days) => (
                <button
                  key={days}
                  onClick={() => jumpToPreset(days)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    visibleRange.totalDays === days 
                      ? 'bg-primary-600 text-white' 
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {days} วัน
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1">
              <button 
                onClick={() => moveDateWindow(-1)}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="px-3 text-sm font-bold text-slate-700 min-w-[140px] text-center">
                {format(visibleRange.startDate, 'd MMM', { locale: th })} - {format(visibleRange.endDate, 'd MMM yyyy', { locale: th })}
              </div>
              <button 
                onClick={() => moveDateWindow(1)}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {visibleRange.isCapped && (
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-[11px] text-amber-700 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            แสดงเฉพาะ {MAX_VISIBLE_DAYS} วันแรกเพื่อประหยัดพื้นที่หน้าจอ
          </div>
        )}

          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse select-none">
              <colgroup>
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                {visibleRange.days.map((day) => (
                  <col key={day.toISOString()} className="w-[80px] min-w-[80px]" />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20 shadow-sm">
                <tr>
                  <th
                    rowSpan={2}
                    className="border-b border-r border-slate-200 bg-white px-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    สาขา / กะ
                  </th>
                  <th
                    rowSpan={2}
                    className="border-b border-r border-slate-200 bg-white px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    ประเภทกะ
                  </th>
                  {visibleRange.days.map((day) => {
                    const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                    return (
                      <th
                        key={day.toISOString()}
                        className={`border-r border-b border-slate-200 px-1 py-3 text-center ${
                          isToday ? 'bg-primary-50' : 'bg-slate-50/50'
                        }`}
                      >
                        <div className={`text-[10px] font-bold uppercase tracking-tighter ${
                          isToday ? 'text-primary-600' : 'text-slate-400'
                        }`}>
                          {format(day, 'EEE', { locale: th })}
                        </div>
                        <div className={`text-sm font-black mt-1 ${
                          isToday ? 'text-primary-700' : 'text-slate-800'
                        }`}>
                          {format(day, 'd', { locale: th })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((branch, branchIndex) => {
                  const palette = getPalette(branchIndex);
                  const branchEmployees = branchEmployeesMap.get(branch.id) || [];
                  const slotMap = slotConfigByBranch.get(branch.id);

                  return SLOT_DEFINITIONS.map((slot, slotIndex) => {
                    const slotConfig = slotMap?.[slot.key];
                    const slotColor = slotConfig?.color || palette.border;
                    const contrastText = getContrastTextColor(slotColor);

                    return (
                      <tr key={`${branch.id}:${slot.key}`} className="hover:bg-slate-50/30 transition-colors">
                        {slotIndex === 0 && (
                          <td
                            rowSpan={SLOT_DEFINITIONS.length}
                            className="border-r border-slate-200 p-0 align-top bg-white"
                          >
                            <div className="flex h-full">
                              <div className="w-1.5" style={{ backgroundColor: palette.border }} />
                              <div className="flex-1 p-3">
                                <div className="font-bold text-sm text-slate-900 leading-tight">
                                  {branch.name}
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                  <Users className="w-3 h-3" />
                                  {branchEmployees.length} คน
                                </div>
                              </div>
                            </div>
                          </td>
                        )}

                        <td className="border-r border-slate-200 px-3 py-3 bg-white">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex h-5 items-center justify-center rounded-md px-1.5 text-[10px] font-black ${contrastText}`}
                                style={{ backgroundColor: slotColor }}
                              >
                                {slot.label}
                              </span>
                              <span className="truncate text-[11px] font-bold text-slate-600">
                                {slotConfig?.shiftName || slot.modalLabel}
                              </span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-400 tabular-nums">
                              {slotConfig?.startTime || '--:--'} - {slotConfig?.endTime || '--:--'}
                            </div>
                          </div>
                        </td>

                        {visibleRange.days.map((day) => {
                          const workDate = format(day, 'yyyy-MM-dd');
                          const cellKey = `${branch.id}::${slot.key}::${workDate}`;
                          const cellAssignments = [...(assignmentsByCell.get(cellKey) || [])].sort((left, right) => {
                            const leftName = userMap.get(left.user_id)?.full_name || '';
                            const rightName = userMap.get(right.user_id)?.full_name || '';
                            return leftName.localeCompare(rightName, 'th');
                          });
                          const selected = isCellSelected(branch.id, slot.key, workDate);
                          const isToday = workDate === format(today, 'yyyy-MM-dd');

                          return (
                            <td
                              key={cellKey}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                handleCellMouseDown(branch.id, slot.key, workDate);
                              }}
                              onMouseEnter={() => handleCellMouseEnter(branch.id, slot.key, workDate)}
                              className={`group relative border-r border-slate-100 p-1 cursor-pointer transition-all ${
                                selected ? 'z-10' : ''
                              }`}
                            >
                              <div 
                                className={`min-h-[64px] rounded-xl border-2 transition-all p-1.5 flex flex-col gap-1 ${
                                  selected 
                                    ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-200' 
                                    : isToday 
                                      ? 'border-primary-100 bg-primary-50/30'
                                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50 group-hover:shadow-sm'
                                }`}
                              >
                                {cellAssignments.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {cellAssignments.slice(0, 4).map((assignment) => {
                                      const employee = userMap.get(assignment.user_id);
                                      const initials = getUserInitials(employee?.full_name || '-');

                                      return employee?.avatar_url ? (
                                        <div
                                          key={assignment.id}
                                          className="h-7 w-7 rounded-lg ring-2 ring-white shadow-sm bg-cover bg-center shrink-0"
                                          style={{ backgroundImage: `url(${employee.avatar_url})` }}
                                          title={employee.full_name}
                                        />
                                      ) : (
                                        <div
                                          key={assignment.id}
                                          className="flex h-7 w-7 items-center justify-center rounded-lg ring-2 ring-white bg-slate-200 text-[10px] font-black text-slate-600 shadow-sm shrink-0"
                                          title={employee?.full_name}
                                        >
                                          {initials}
                                        </div>
                                      );
                                    })}
                                    {cellAssignments.length > 4 && (
                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg ring-2 ring-white bg-slate-900 text-[9px] font-black text-white shadow-sm shrink-0">
                                        +{cellAssignments.length - 4}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                      <span className="text-lg leading-none">+</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
      </Card>

      {/* Settings Modal (Slide-over) */}
      <Modal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        title="ตั้งค่ากะและเวลาแต่ละสาขา"
        size="lg"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="flex-1">
              <Select
                label="เลือกสาขาที่จะตั้งค่า"
                value={resolvedConfigBranchId}
                onChange={(event) => setConfigBranchId(event.target.value)}
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              />
            </div>
          </div>

          {configBranch && configPolicyDraft && (
            <div className="space-y-8 pb-6">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 border-l-4 border-primary-500 pl-3">เวลาหลักของสาขา</h3>
                    <p className="text-xs text-slate-500 mt-1">ฐานข้อมูลสำหรับคำนวณการเข้าสาย และ OT</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveBranchPolicy()}
                    loading={savingConfigKey === `policy:${configBranch.id}`}
                  >
                    บันทึกเวลาหลัก
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <Input label="เริ่มงาน" type="time" value={configPolicyDraft.shift_start_time} onChange={(e) => updatePolicyDraft('shift_start_time', e.target.value)} />
                  <Input label="เลิกงาน" type="time" value={configPolicyDraft.shift_end_time} onChange={(e) => updatePolicyDraft('shift_end_time', e.target.value)} />
                  <Input label="พัก (นาที)" type="number" value={configPolicyDraft.break_minutes} onChange={(e) => updatePolicyDraft('break_minutes', Number(e.target.value))} />
                  <Input label="ผ่อนผันสาย" type="number" value={configPolicyDraft.late_grace_minutes} onChange={(e) => updatePolicyDraft('late_grace_minutes', Number(e.target.value))} />
                  <Input label="ผ่อนผันออกก่อน" type="number" value={configPolicyDraft.early_out_grace_minutes} onChange={(e) => updatePolicyDraft('early_out_grace_minutes', Number(e.target.value))} />
                  <Input label="ขั้นต่ำ OT" type="number" value={configPolicyDraft.minimum_ot_minutes} onChange={(e) => updatePolicyDraft('minimum_ot_minutes', Number(e.target.value))} />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 border-l-4 border-amber-500 pl-3">รายละเอียดกะ (เช้า / สาย / FD)</h3>
                </div>
                
                <div className="space-y-4">
                  {SLOT_DEFINITIONS.map((slot) => {
                    const slotDraft = getConfigSlotDraft(configBranch.id, slot.key);
                    if (!slotDraft) return null;

                    return (
                      <div key={slot.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-50">
                          <div className="flex items-center gap-3">
                            <span 
                              className={`h-6 min-w-[40px] flex items-center justify-center rounded-md text-[10px] font-black ${getContrastTextColor(slotDraft.color)}`}
                              style={{ backgroundColor: slotDraft.color }}
                            >
                              {slot.label}
                            </span>
                            <h4 className="font-bold text-slate-900">{slotDraft.name || slot.modalLabel}</h4>
                          </div>
                          <Button 
                            size="sm" 
                            variant="primary"
                            onClick={() => void handleSaveSlotTemplate(slot)}
                            loading={savingConfigKey === `slot:${configBranch.id}:${slot.key}`}
                          >
                            บันทึก {slot.label}
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="col-span-2">
                            <Input label="ชื่อเรียกกะ" value={slotDraft.name} onChange={(e) => updateSlotDraft(slot.key, 'name', e.target.value)} />
                          </div>
                          <Input label="เริ่มงาน" type="time" value={slotDraft.start_time} onChange={(e) => updateSlotDraft(slot.key, 'start_time', e.target.value)} />
                          <Input label="เลิกงาน" type="time" value={slotDraft.end_time} onChange={(e) => updateSlotDraft(slot.key, 'end_time', e.target.value)} />
                          <div className="col-span-2 flex items-end gap-3">
                            <div className="flex-1">
                              <Input label="รหัสธีมสี" type="color" value={slotDraft.color} onChange={(e) => updateSlotDraft(slot.key, 'color', e.target.value)} className="h-10 p-1" />
                            </div>
                            <div className="flex-1">
                              <Input label="พัก (นาที)" type="number" value={slotDraft.break_minutes} onChange={(e) => updateSlotDraft(slot.key, 'break_minutes', Number(e.target.value))} />
                            </div>
                          </div>
                          <Input label="สาย (นาที)" type="number" value={slotDraft.late_grace_minutes} onChange={(e) => updateSlotDraft(slot.key, 'late_grace_minutes', Number(e.target.value))} />
                          <Input label="OT ขั้นต่ำ" type="number" value={slotDraft.minimum_ot_minutes} onChange={(e) => updateSlotDraft(slot.key, 'minimum_ot_minutes', Number(e.target.value))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </Modal>

      {/* Help Modal */}
      <Modal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="วิธีใช้งานตารางจัดพนักงาน"
        size="md"
      >
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-900 p-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <CheckSquare2 className="w-6 h-6" />
                <h3 className="font-bold">จัดพนักงานได้รวดเร็ว</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                คลิกที่เซลล์หรือ Drag ค้างไว้เพื่อเลือกช่วงวันที่ในกะที่ต้องการ ระบบจะรวมพนักงานในสาขานั้นมาให้คุณเลือกทันที
              </p>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-3">
                <Clock3 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">กำหนดเวลากะ</h4>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                แก้ไขกะพนักงานของแต่ละสาขาแยกกันได้จากปุ่ม "ตั้งค่ากะ" ในหน้าจอหลัก
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">ไอคอนพนักงาน</h4>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                พนักงานที่จัดแล้วจะแสดงเป็นรูป/ชื่อย่อ พร้อมเส้นสีตามประเภทกะ (เช้า/สาย/FD)
              </p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(activeSelection)}
        onClose={resetSelection}
        title={modalBranch && modalSlotConfig ? `${modalBranch.name} • ${modalSlotConfig.shiftName}` : 'จัดกะพนักงาน'}
        size="lg"
      >
        {activeSelection && modalBranch && modalSlot && modalSlotConfig ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">สาขา</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">{modalBranch.name}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">ช่วงวันที่</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {format(parseISO(activeSelection.startDate), 'd MMM', { locale: th })}
                  {' - '}
                  {format(parseISO(activeSelection.endDate), 'd MMM yyyy', { locale: th })}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">เวลากะ</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {modalSlotConfig.startTime} - {modalSlotConfig.endTime}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">รายชื่อพนักงานในสาขานี้</p>
                <p className="text-xs text-slate-500 mt-1">
                  เลือกคนที่ต้องการใส่เข้ากะหรือลบออกจากกะในช่วง {modalDateStrings.length} วัน
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedEmployeeIds(modalEmployees.map((employee) => employee.id))}
                  disabled={modalEmployees.length === 0}
                >
                  เลือกทั้งหมด
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEmployeeIds([])}
                  disabled={selectedEmployeeIds.length === 0}
                >
                  ล้างการเลือก
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
              {modalEmployees.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                  ยังไม่มีพนักงานในสาขานี้
                </div>
              )}

              {modalEmployees.map((employee) => {
                const assignedDays = modalAssignmentCounts.get(employee.id) || 0;
                const selected = selectedEmployeeIds.includes(employee.id);

                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => toggleEmployee(employee.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-primary-600 bg-primary-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {employee.avatar_url ? (
                          <div
                            role="img"
                            aria-label={employee.full_name}
                            className="h-11 w-11 rounded-full border-2 border-white bg-cover bg-center bg-no-repeat shadow-sm"
                            style={{ backgroundImage: `url(${employee.avatar_url})` }}
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-sm font-bold text-slate-700 shadow-sm">
                            {getUserInitials(employee.full_name)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{employee.full_name}</p>
                          <p className="text-xs text-slate-500 mt-1">{employee.email}</p>
                        </div>
                      </div>
                      <div className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        assignedDays > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {assignedDays}/{modalDateStrings.length} วัน
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={resetSelection}>
                ปิด
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleRemoveSelection()}
                disabled={selectedEmployeeIds.length === 0}
                loading={actionState === 'remove'}
              >
                ลบคนที่เลือกออก
              </Button>
              <Button
                onClick={() => void handleAssignSelection()}
                disabled={selectedEmployeeIds.length === 0}
                loading={actionState === 'assign'}
              >
                ใส่เข้ากะ
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
