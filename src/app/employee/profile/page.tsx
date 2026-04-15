'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  Camera,
  ChevronRight,
  ExternalLink,
  FileText,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  ReceiptText,
  Save,
  Shield,
  Upload,
  UserCircle,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input, { TextArea } from '@/components/ui/Input';
import { ROLE_LABELS, SHIFT_ASSIGNMENT_STATUS_LABELS } from '@/lib/constants';
import { getCurrentDateStr } from '@/lib/dateUtils';
import { resolveShiftForUserDate } from '@/lib/hr';
import { createSignedFileUrl, uploadFile, uploadPrivateFile } from '@/lib/storage';
import { getAccessToken } from '@/lib/supabase';
import type { User } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useHrStore } from '@/store/hrStore';

type ProfileFormState = {
  full_name: string;
  address: string;
  citizen_id: string;
  avatar_url: string;
  citizen_id_card_path: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_book_path: string;
};

type PasswordFormState = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

type UploadTarget = 'avatar' | 'citizen_id_card_path' | 'bank_book_path';
type DocumentTarget = 'citizen_id_card_path' | 'bank_book_path';
type EditTarget = 'personal' | 'bank' | 'documents' | 'password';

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900 border-b border-slate-50 pb-2">{value || '-'}</p>
    </div>
  );
}

function buildProfileForm(user: User | null): ProfileFormState {
  return {
    full_name: user?.full_name || '',
    address: user?.address || '',
    citizen_id: user?.citizen_id || '',
    avatar_url: user?.avatar_url || '',
    citizen_id_card_path: user?.citizen_id_card_path || '',
    bank_name: user?.bank_name || '',
    bank_account_name: user?.bank_account_name || '',
    bank_account_number: user?.bank_account_number || '',
    bank_book_path: user?.bank_book_path || '',
  };
}

function buildProfilePayload(form: ProfileFormState) {
  return {
    full_name: form.full_name,
    address: form.address,
    citizen_id: form.citizen_id,
    avatar_url: form.avatar_url,
    citizen_id_card_path: form.citizen_id_card_path,
    bank_name: form.bank_name,
    bank_account_name: form.bank_account_name,
    bank_account_number: form.bank_account_number,
    bank_book_path: form.bank_book_path,
  };
}

function getFileExtension(file: File) {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase();

  if (fromName) {
    return fromName;
  }

  if (file.type === 'application/pdf') {
    return 'pdf';
  }

  return 'jpg';
}

function buildStoragePath(userId: string, prefix: string, file: File) {
  return `${userId}/${prefix}-${Date.now()}.${getFileExtension(file)}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, logout, refreshCurrentUser } = useAuthStore();
  const branchStore = useBranchStore();
  const hrStore = useHrStore();
  const [form, setForm] = useState<ProfileFormState>(() => buildProfileForm(currentUser));
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<UploadTarget | null>(null);
  const [openingDocument, setOpeningDocument] = useState<DocumentTarget | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const citizenCardInputRef = useRef<HTMLInputElement>(null);
  const bankBookInputRef = useRef<HTMLInputElement>(null);
  const hydratedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      hydratedUserIdRef.current = null;
      return;
    }

    if (hydratedUserIdRef.current !== currentUser.id) {
      hydratedUserIdRef.current = currentUser.id;
      setForm(buildProfileForm(currentUser));
    }
  }, [currentUser]);

  const branch = currentUser ? branchStore.getBranchById(currentUser.branch_id) : null;
  const todayShift = useMemo(() => {
    if (!currentUser) {
      return null;
    }

    return resolveShiftForUserDate({
      user: currentUser,
      workDate: getCurrentDateStr(),
      assignments: hrStore.shiftAssignments,
      branchPolicies: hrStore.branchPolicies,
    });
  }, [currentUser, hrStore.branchPolicies, hrStore.shiftAssignments]);

  if (!currentUser) {
    return null;
  }

  const submitProfilePatch = async (payload: Partial<ReturnType<typeof buildProfilePayload>>, successMessage: string) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error('ไม่พบ session การเข้าสู่ระบบ');
    }

    const response = await fetch('/api/employee/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'บันทึกข้อมูลไม่สำเร็จ');
    }

    await refreshCurrentUser();
    setProfileError('');
    setProfileSuccess(successMessage);

    return result.user as User;
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setSavingProfile(true);

    try {
      const updatedUser = await submitProfilePatch(
        buildProfilePayload(form),
        'บันทึกข้อมูลส่วนตัวเรียบร้อย',
      );

      setForm(buildProfileForm(updatedUser));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setSavingPassword(true);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
        throw new Error('ไม่พบ session การเข้าสู่ระบบ');
      }

      const response = await fetch('/api/employee/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(passwordForm),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }

      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setPasswordSuccess('เปลี่ยนรหัสผ่านเรียบร้อย');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadingTarget('avatar');
    setProfileError('');
    setProfileSuccess('');

    try {
      const avatarUrl = await uploadFile(
        'avatars',
        buildStoragePath(currentUser.id, 'avatar', file),
        file,
      );

      if (!avatarUrl) {
        throw new Error('อัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
      }

      await submitProfilePatch(
        { avatar_url: avatarUrl },
        'อัปโหลดรูปโปรไฟล์เรียบร้อย',
      );

      setForm((prev) => ({ ...prev, avatar_url: avatarUrl }));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
    } finally {
      setUploadingTarget(null);
      event.target.value = '';
    }
  };

  const handlePrivateDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: DocumentTarget,
    prefix: 'citizen-card' | 'bank-book',
    successMessage: string,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadingTarget(target);
    setProfileError('');
    setProfileSuccess('');

    try {
      const path = await uploadPrivateFile(
        'employee-documents',
        buildStoragePath(currentUser.id, prefix, file),
        file,
      );

      if (!path) {
        throw new Error('อัปโหลดเอกสารไม่สำเร็จ');
      }

      await submitProfilePatch({ [target]: path }, successMessage);
      setForm((prev) => ({ ...prev, [target]: path }));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'อัปโหลดเอกสารไม่สำเร็จ');
    } finally {
      setUploadingTarget(null);
      event.target.value = '';
    }
  };

  const handleOpenDocument = async (target: DocumentTarget) => {
    const path = form[target];

    if (!path) {
      return;
    }

    setOpeningDocument(target);
    setProfileError('');

    try {
      const signedUrl = await createSignedFileUrl('employee-documents', path);

      if (!signedUrl) {
        throw new Error('เปิดไฟล์เอกสารไม่สำเร็จ');
      }

      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'เปิดไฟล์เอกสารไม่สำเร็จ');
    } finally {
      setOpeningDocument(null);
    }
  };

  const displayName = form.full_name.trim() || currentUser.full_name;

  return (
    <div className="space-y-5 px-4 py-5 pb-24 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">โปรไฟล์พนักงาน</h1>
        <p className="text-sm text-slate-500">
          อัปเดตข้อมูลส่วนตัว เอกสารสำคัญ และความปลอดภัยของบัญชีด้วยตัวเอง
        </p>
      </div>

      <Card className="overflow-hidden border-slate-100 shadow-sm">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="relative group">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt={displayName}
                className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-primary-100 shadow-md">
                <UserCircle className="h-14 w-14 text-primary-700" />
              </div>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
            disabled={uploadingTarget === 'avatar'}
          />
          <input
            ref={citizenCardInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => void handlePrivateDocumentUpload(
              event,
              'citizen_id_card_path',
              'citizen-card',
              'อัปโหลดบัตรประชาชนเรียบร้อย',
            )}
            disabled={uploadingTarget === 'citizen_id_card_path'}
          />
          <input
            ref={bankBookInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => void handlePrivateDocumentUpload(
              event,
              'bank_book_path',
              'bank-book',
              'อัปโหลดสมุดบัญชีธนาคารเรียบร้อย',
            )}
            disabled={uploadingTarget === 'bank_book_path'}
          />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-500">{ROLE_LABELS[currentUser.role]}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
              <Building2 className="h-3.5 w-3.5" />
              {branch?.name || 'ไม่ระบุสาขา'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
              <Shield className="h-3.5 w-3.5" />
              {currentUser.email}
            </span>
          </div>
          
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 rounded-full font-bold shadow-sm"
            onClick={() => setIsActionMenuOpen(true)}
            icon={<UserCog className="h-4 w-4" />}
          >
            จัดการโปรไฟล์
          </Button>
        </div>
      </Card>

      {todayShift && (
        <Card className="border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-teal-50 p-3 text-teal-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">กะทำงานวันนี้</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{todayShift.shift_name}</p>
                <p className="mt-1 text-xs text-slate-500">{todayShift.start_time} - {todayShift.end_time}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {SHIFT_ASSIGNMENT_STATUS_LABELS[todayShift.status]}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-primary-600"
              onClick={() => router.push('/employee/history?tab=schedule')}
            >
              ดูกะ
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {/* Personal Summary Card */}
        <Card className="border-slate-100 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
                <UserCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">ข้อมูลส่วนตัว</h3>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
             <InfoRow label="ชื่อ-นามสกุล" value={currentUser.full_name} />
             <InfoRow label="อีเมล" value={currentUser.email} icon={Shield} />
             <InfoRow label="เลขบัตรประชาชน" value={currentUser.citizen_id} icon={Shield} />
             <InfoRow label="ที่อยู่" value={currentUser.address} icon={MapPin} />
          </div>
        </Card>

        {/* Bank Summary Card */}
        <Card className="border-slate-100 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">ข้อมูลบัญชีธนาคาร</h3>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
             <InfoRow label="ธนาคาร" value={currentUser.bank_name} icon={Landmark} />
             <InfoRow label="ชื่อบัญชี" value={currentUser.bank_account_name} icon={ReceiptText} />
             <InfoRow label="เลขบัญชี" value={currentUser.bank_account_number} icon={MapPin} />
          </div>
        </Card>

        {/* Documents Summary Card */}
        <Card className="border-slate-100 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">เอกสารแนบส่วนตัว</h3>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
               <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">บัตรประชาชน</p>
                  <p className="text-sm font-semibold text-slate-900">{currentUser.citizen_id_card_path ? 'อัปโหลดแล้ว' : 'ยังไม่ได้อัปโหลด'}</p>
               </div>
               {currentUser.citizen_id_card_path && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDocument('citizen_id_card_path')}
                    disabled={openingDocument === 'citizen_id_card_path'}
                  >
                    เปิดดู
                  </Button>
               )}
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
               <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">สมุดบัญชีธนาคาร</p>
                  <p className="text-sm font-semibold text-slate-900">{currentUser.bank_book_path ? 'อัปโหลดแล้ว' : 'ยังไม่ได้อัปโหลด'}</p>
               </div>
               {currentUser.bank_book_path && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDocument('bank_book_path')}
                    disabled={openingDocument === 'bank_book_path'}
                  >
                    เปิดดู
                  </Button>
               )}
            </div>
          </div>
        </Card>
      </div>

      {/* Removed Change Password Card from main flow */}

      <Card padding="none" className="overflow-hidden border-slate-100 shadow-sm">
        <div className="divide-y divide-slate-100">
          <button
            type="button"
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50"
            onClick={() => router.push('/employee/history?tab=schedule')}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary-50 p-2 text-primary-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-slate-900">กะงานของฉัน</span>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-400" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50"
            onClick={() => router.push('/employee/requests')}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary-50 p-2 text-primary-600">
                <ReceiptText className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-slate-900">คำขอและรายงาน</span>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </Card>

      <Button
        variant="danger"
        fullWidth
        onClick={() => {
          void handleLogout();
        }}
        icon={<LogOut className="h-4 w-4" />}
      >
        ออกจากระบบ
      </Button>

      {/* Profile Action Menu Modal */}
      <Modal
        isOpen={isActionMenuOpen}
        onClose={() => setIsActionMenuOpen(false)}
        title="จัดการข้อมูลโปรไฟล์"
        bottomSheet
      >
        <div className="space-y-3 pb-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-widest px-1">อัปเดตข้อมูล</p>
          
          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all active:scale-[0.98] hover:bg-slate-100"
            onClick={() => {
              setIsActionMenuOpen(false);
              avatarInputRef.current?.click();
            }}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700">
               <Camera className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
               <p className="text-sm font-semibold text-slate-900">เปลี่ยนรูปโปรไฟล์</p>
               <p className="text-xs text-slate-500">อัปโหลดรูปภาพใหม่ของคุณ</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all active:scale-[0.98] hover:bg-slate-100"
            onClick={() => {
              setIsActionMenuOpen(false);
              setEditTarget('personal');
            }}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700">
               <UserCircle className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
               <p className="text-sm font-semibold text-slate-900">แก้ไขข้อมูลส่วนตัว</p>
               <p className="text-xs text-slate-500">ชื่อ ที่อยู่ และเลขบัตรประชาชน</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all active:scale-[0.98] hover:bg-slate-100"
            onClick={() => {
              setIsActionMenuOpen(false);
              setEditTarget('bank');
            }}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-amber-100 text-amber-700">
               <Landmark className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
               <p className="text-sm font-semibold text-slate-900">แก้ไขบัญชีธนาคาร</p>
               <p className="text-xs text-slate-500">อัปเดตช่องทางการรับเงินเดือน</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all active:scale-[0.98] hover:bg-slate-100"
            onClick={() => {
              setIsActionMenuOpen(false);
              setEditTarget('documents');
            }}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-sky-100 text-sky-700">
               <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
               <p className="text-sm font-semibold text-slate-900">อัปโหลดเอกสารสำคัญ</p>
               <p className="text-xs text-slate-500">บัตรประชาชน และสมุดบัญชี</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all active:scale-[0.98] hover:bg-slate-100"
            onClick={() => {
              setIsActionMenuOpen(false);
              setEditTarget('password');
            }}
          >
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-100 text-red-700">
               <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
               <p className="text-sm font-semibold text-slate-900">เปลี่ยนรหัสผ่าน</p>
               <p className="text-xs text-slate-500">เพื่อความปลอดภัยของบัญชี</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </Modal>

      {/* Personal Info Modal */}
      <Modal
        isOpen={editTarget === 'personal'}
        onClose={() => {
          setEditTarget(null);
          setProfileError('');
          setProfileSuccess('');
        }}
        title="แก้ไขข้อมูลส่วนตัว"
        size="lg"
      >
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <Input
            id="modal-full-name"
            label="ชื่อ-นามสกุล"
            value={form.full_name}
            onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
            placeholder="กรอกชื่อ-นามสกุล"
            required
          />
          <Input
            id="modal-email"
            label="อีเมลเข้าสู่ระบบ"
            value={currentUser.email}
            disabled
            helperText="หากต้องการเปลี่ยนอีเมล ให้ติดต่อผู้จัดการหรือแอดมิน"
          />
          <TextArea
            id="modal-address"
            label="ที่อยู่"
            rows={4}
            value={form.address}
            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            placeholder="กรอกที่อยู่ปัจจุบัน"
          />
          <Input
            id="modal-citizen-id"
            label="เลขบัตรประชาชน"
            value={form.citizen_id}
            onChange={(event) => setForm((prev) => ({ ...prev, citizen_id: event.target.value }))}
            placeholder="13 หลัก"
            inputMode="numeric"
            maxLength={13}
            icon={<Shield className="h-4 w-4" />}
          />

          {(profileError || profileSuccess) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${profileError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {profileError || profileSuccess}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button type="submit" fullWidth loading={savingProfile} icon={<Save className="h-4 w-4" />}>บันทึกข้อมูล</Button>
          </div>
        </form>
      </Modal>

      {/* Bank Info Modal */}
      <Modal
        isOpen={editTarget === 'bank'}
        onClose={() => {
          setEditTarget(null);
          setProfileError('');
          setProfileSuccess('');
        }}
        title="แก้ไขบัญชีธนาคาร"
      >
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <Input
            id="modal-bank-name"
            label="ธนาคาร"
            value={form.bank_name}
            onChange={(event) => setForm((prev) => ({ ...prev, bank_name: event.target.value }))}
            placeholder="เช่น ธนาคารกสิกรไทย"
            icon={<Landmark className="h-4 w-4" />}
          />
          <Input
            id="modal-bank-account-name"
            label="ชื่อบัญชี"
            value={form.bank_account_name}
            onChange={(event) => setForm((prev) => ({ ...prev, bank_account_name: event.target.value }))}
            placeholder="ชื่อเจ้าของบัญชี"
            icon={<ReceiptText className="h-4 w-4" />}
          />
          <Input
            id="modal-bank-account-number"
            label="เลขบัญชีธนาคาร"
            value={form.bank_account_number}
            onChange={(event) => setForm((prev) => ({ ...prev, bank_account_number: event.target.value }))}
            placeholder="เช่น 123-4-56789-0"
            inputMode="numeric"
            icon={<MapPin className="h-4 w-4" />}
          />

          {(profileError || profileSuccess) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${profileError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {profileError || profileSuccess}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button type="submit" fullWidth loading={savingProfile} icon={<Save className="h-4 w-4" />}>บันทึกข้อมูล</Button>
          </div>
        </form>
      </Modal>

      {/* Documents Modal */}
      <Modal
        isOpen={editTarget === 'documents'}
        onClose={() => {
          setEditTarget(null);
          setProfileError('');
          setProfileSuccess('');
        }}
        title="อัปโหลดเอกสารสำคัญ"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">บัตรประชาชน</p>
                <p className="text-xs text-slate-500">{form.citizen_id_card_path ? 'มีไฟล์ล่าสุดแล้ว' : 'ยังไม่มีไฟล์แนบ'}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => citizenCardInputRef.current?.click()}
                  disabled={uploadingTarget === 'citizen_id_card_path'}
                  icon={<Upload className="h-4 w-4" />}
                >
                  {uploadingTarget === 'citizen_id_card_path' ? 'กำลังอัปโหลด...' : 'อัปเดตไฟล์'}
                </Button>
                {form.citizen_id_card_path && (
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenDocument('citizen_id_card_path')}
                    icon={<ExternalLink className="h-4 w-4" />}
                    disabled={openingDocument === 'citizen_id_card_path'}
                  >
                    <span className="sr-only">เปิดดูบัตรประชาชน</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">สมุดบัญชีธนาคาร</p>
                <p className="text-xs text-slate-500">{form.bank_book_path ? 'มีไฟล์ล่าสุดแล้ว' : 'ยังไม่มีไฟล์แนบ'}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => bankBookInputRef.current?.click()}
                  disabled={uploadingTarget === 'bank_book_path'}
                  icon={<Upload className="h-4 w-4" />}
                >
                  {uploadingTarget === 'bank_book_path' ? 'กำลังอัปโหลด...' : 'อัปเดตไฟล์'}
                </Button>
                {form.bank_book_path && (
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenDocument('bank_book_path')}
                    icon={<ExternalLink className="h-4 w-4" />}
                    disabled={openingDocument === 'bank_book_path'}
                  >
                    <span className="sr-only">เปิดดูสมุดบัญชีธนาคาร</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {(profileError || profileSuccess) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${profileError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {profileError || profileSuccess}
            </div>
          )}
          
          <Button variant="outline" fullWidth onClick={() => setEditTarget(null)}>ปิด</Button>
        </div>
      </Modal>

      {/* Password Modal */}
      <Modal
        isOpen={editTarget === 'password'}
        onClose={() => {
          setEditTarget(null);
          setPasswordError('');
          setPasswordSuccess('');
        }}
        title="เปลี่ยนรหัสผ่าน"
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            id="current-password"
            type="password"
            label="รหัสผ่านปัจจุบัน"
            value={passwordForm.current_password}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))}
            required
          />
          <Input
            id="new-password"
            type="password"
            label="รหัสผ่านใหม่"
            value={passwordForm.new_password}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
            required
          />
          <Input
            id="confirm-password"
            type="password"
            label="ยืนยันรหัสผ่านใหม่"
            value={passwordForm.confirm_password}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
            required
          />

          {(passwordError || passwordSuccess) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${passwordError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {passwordError || passwordSuccess}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setEditTarget(null)}>ยกเลิก</Button>
            <Button type="submit" fullWidth loading={savingPassword}>เปลี่ยนรหัสผ่าน</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
