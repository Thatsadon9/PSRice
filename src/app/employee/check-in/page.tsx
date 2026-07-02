'use client';
/* eslint-disable @next/next/no-img-element */

import { differenceInMinutes } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Page, PageHeader } from '@/components/ui/Page';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import { useHrStore } from '@/store/hrStore';
import { formatTime, getCurrentDateStr } from '@/lib/dateUtils';
import { checkGeofence, formatDistance } from '@/lib/geofence';
import { createLocalDateTime, formatMinutesAsHours, resolveShiftForUserDate } from '@/lib/hr';
import { getAccuracyColor, getAccuracyLabel, getAccuracyLevel, getDeviceInfo } from '@/lib/gps';
import type { AttendanceRecord, GPSCoordinates } from '@/lib/types';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  MapPin,
  Navigation,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { capturePhoto, openCamera, stopCamera } from '@/lib/camera';

type Step = 'status' | 'camera' | 'confirm' | 'result';

export default function CheckInPage() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const attendanceStore = useAttendanceStore();
  const branchStore = useBranchStore();
  const branchPolicies = useHrStore((state) => state.branchPolicies);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);
  const schemaReady = useHrStore((state) => state.schemaReady);
  const schemaMessage = useHrStore((state) => state.schemaMessage);

  const [step, setStep] = useState<Step>('status');
  const [gpsCoords, setGpsCoords] = useState<GPSCoordinates | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultStatus, setResultStatus] = useState<'success' | 'error'>('success');
  const [resultMessage, setResultMessage] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const todayDate = getCurrentDateStr();

  const todayShift = useMemo(() => {
    if (!currentUser) {
      return null;
    }

    return resolveShiftForUserDate({
      user: currentUser,
      workDate: todayDate,
      assignments: shiftAssignments,
      branchPolicies,
    });
  }, [branchPolicies, currentUser, shiftAssignments, todayDate]);

  const defaultBranchId = todayShift?.branch_id ?? currentUser?.branch_id;
  const activeBranchId = selectedBranchId || defaultBranchId;
  const branch = activeBranchId ? branchStore.getBranchById(activeBranchId) : null;
  const homeBranch = currentUser ? branchStore.getBranchById(currentUser.branch_id) : null;
  const isCrossBranch = activeBranchId !== currentUser?.branch_id;

  const todayStatus = currentUser ? attendanceStore.getTodayStatus(currentUser.id) : 'not_checked_in';
  const todayRecord = currentUser
    ? attendanceStore.getTodayRecordForUser(currentUser.id)
    : { checkIn: undefined, checkOut: undefined };
  const isCheckOut = todayStatus === 'checked_in' || todayStatus === 'late';
  const isCheckIn = !isCheckOut;
  const alreadyDone = todayStatus === 'checked_out';

  const shiftStartAt = todayShift ? createLocalDateTime(todayDate, todayShift.start_time) : null;
  const shiftLateThreshold = useMemo(() => {
    if (!shiftStartAt || !todayShift) {
      return null;
    }

    return new Date(shiftStartAt.getTime() + (todayShift.late_grace_minutes * 60 * 1000));
  }, [shiftStartAt, todayShift]);

  const geofenceResult = gpsCoords && branch
    ? checkGeofence(gpsCoords, branch)
    : null;
  const canCheckIn = todayShift?.status !== 'leave';

  const fetchGPS = useCallback(() => {
    setGpsLoading(true);
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsError('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setGpsLoading(false);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'กรุณาอนุญาตการเข้าถึงตำแหน่ง',
          2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS',
          3: 'หมดเวลาการระบุตำแหน่ง กรุณาลองใหม่อีกครั้ง',
        };
        setGpsError(messages[error.code] || 'เกิดข้อผิดพลาดในการระบุตำแหน่ง');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (step === 'status') {
      const timer = window.setTimeout(() => {
        fetchGPS();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [fetchGPS, step]);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      stopCamera(streamRef.current);
      streamRef.current = null;
    }
    setCameraStream(null);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');

    try {
      const stream = await openCamera('user');
      streamRef.current = stream;
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'ไม่สามารถเปิดกล้องได้');
    }
  }, []);

  const takePhoto = () => {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;

    if (video.videoWidth === 0 || video.readyState < 2) {
      return;
    }

    const result = capturePhoto(video);
    if (!result) {
      return;
    }

    setPhotoData(result.dataUrl);
    stopCameraStream();
    setStep('confirm');
  };

  useEffect(() => {
    if (step === 'camera') {
      const timer = window.setTimeout(() => {
        void startCamera();
      }, 0);

      return () => {
        window.clearTimeout(timer);
        stopCameraStream();
      };
    }
  }, [startCamera, step, stopCameraStream]);

  if (!currentUser) {
    return null;
  }

  const handleSubmit = async () => {
    if (!gpsCoords || !branch || !photoData) {
      return;
    }

    setSubmitting(true);

    const geoResult = checkGeofence(gpsCoords, branch);

    if (!geoResult.isWithinGeofence) {
      setResultStatus('error');
      setResultMessage(`อยู่นอกพื้นที่ ${branch.name} ${formatDistance(geoResult.distanceMeters)}`);
      setStep('result');
      setSubmitting(false);
      return;
    }

    const now = new Date();
    const lateMinutes = !isCheckOut && shiftLateThreshold
      ? Math.max(0, differenceInMinutes(now, shiftLateThreshold))
      : 0;
    const isLate = lateMinutes > 0;

    const record: Omit<AttendanceRecord, 'id' | 'created_at' | 'server_timestamp'> = {
      user_id: currentUser.id,
      branch_id: branch.id,
      type: isCheckOut ? 'check_out' : 'check_in',
      photo_url: photoData,
      latitude: gpsCoords.latitude,
      longitude: gpsCoords.longitude,
      gps_accuracy: gpsCoords.accuracy,
      verified_in_geofence: true,
      device_info: getDeviceInfo(),
      status: isCheckOut ? 'checked_out' : isLate ? 'late' : 'checked_in',
      notes: isCheckOut
        ? todayShift ? `เช็คเอาต์กะ ${todayShift.shift_name}` : ''
        : isLate
          ? `เข้างานสาย ${formatMinutesAsHours(lateMinutes)}`
          : todayShift
            ? `เช็คอินกะ ${todayShift.shift_name}`
            : '',
    };

    const result = await attendanceStore.addRecord(record);

    if (result.success) {
      setResultStatus('success');
      setResultMessage(
        isCheckOut
          ? 'เช็คเอาต์สำเร็จ'
          : isLate
            ? `เช็คอินสำเร็จ (สาย ${formatMinutesAsHours(lateMinutes)})`
            : 'เช็คอินสำเร็จ',
      );
    } else {
      setResultStatus('error');
      setResultMessage(result.error || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่');
    }

    setStep('result');
    setSubmitting(false);
  };

  const reset = () => {
    setPhotoData(null);
    setStep('status');
    fetchGPS();
  };

  const branchOptions = branchStore.branches.filter(
    (item) => currentUser.role === 'admin' || !item.admin_only || currentUser.branch_id === item.id || todayShift?.branch_id === item.id
  );
  const canStartCamera = Boolean(gpsCoords && geofenceResult?.isWithinGeofence && canCheckIn);
  const canSubmit = Boolean(photoData && gpsCoords && branch && geofenceResult?.isWithinGeofence && canCheckIn);
  const pageTitle = isCheckIn ? 'ลงเวลาเข้างาน' : 'ลงเวลาออกงาน';
  const gpsStatusLabel = gpsLoading ? 'กำลังค้นหา...' : gpsCoords ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม';
  const locationLabel = geofenceResult
    ? geofenceResult.isWithinGeofence ? 'อยู่ในพื้นที่' : 'นอกพื้นที่'
    : '--';

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        title={pageTitle}
        description={branch ? `สาขา ${branch.name}` : 'ตรวจสอบสาขาและตำแหน่งก่อนลงเวลา'}
        action={(
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push('/employee')}>
            กลับ
          </Button>
        )}
      />

      {!schemaReady && (
        <Card className="border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-950">สถานะซิงก์: ออฟไลน์</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{todayShift?.shift_name || 'กะทั่วไป'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {todayShift ? `${todayShift.start_time} - ${todayShift.end_time}` : 'ไม่พบตารางกะ'}
            </p>
          </div>
          <Badge variant={alreadyDone ? 'success' : isCheckOut ? 'info' : 'default'}>
            {alreadyDone ? 'ลงเวลาแล้ว' : isCheckOut ? 'รอเช็คเอาต์' : 'รอเช็คอิน'}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">เวลาเข้า</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {todayRecord.checkIn ? formatTime(todayRecord.checkIn.created_at) : '--:--'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">เวลาออก</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {todayRecord.checkOut ? formatTime(todayRecord.checkOut.created_at) : '--:--'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Select
            label="สาขาที่ลงเวลา"
            value={activeBranchId || ''}
            onChange={(event) => {
              setSelectedBranchId(event.target.value);
              fetchGPS();
            }}
            options={branchOptions.map((item) => ({
              value: item.id,
              label: item.name,
              description: item.id === currentUser.branch_id ? 'สาขาหลัก' : undefined,
            }))}
          />
        </div>

        {isCrossBranch && (
          <p className="mt-2 text-xs text-amber-700">
            ลงเวลาต่างสาขา จากสาขาหลัก {homeBranch?.name || '-'}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <Navigation className={`h-4 w-4 ${gpsCoords ? 'text-emerald-600' : 'text-slate-400'}`} />
              {gpsLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-100 border-t-primary-600" />}
            </div>
            <p className="mt-2 text-xs text-slate-500">GPS</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{gpsStatusLabel}</p>
            {gpsCoords && (
              <p className={`mt-1 text-xs ${getAccuracyColor(getAccuracyLevel(gpsCoords.accuracy))}`}>
                {Math.round(gpsCoords.accuracy)} ม. · {getAccuracyLabel(getAccuracyLevel(gpsCoords.accuracy))}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <MapPin className={`h-4 w-4 ${geofenceResult?.isWithinGeofence ? 'text-emerald-600' : 'text-slate-400'}`} />
            <p className="mt-2 text-xs text-slate-500">พื้นที่</p>
            <p className={`mt-1 truncate text-sm font-semibold ${geofenceResult?.isWithinGeofence ? 'text-emerald-700' : 'text-slate-950'}`}>
              {locationLabel}
            </p>
            {geofenceResult && (
              <p className="mt-1 text-xs text-slate-500">{formatDistance(geofenceResult.distanceMeters)}</p>
            )}
          </div>
        </div>
      </Card>

      {alreadyDone && step === 'status' && (
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-950">คุณลงเวลาออกงานแล้ว</h3>
          <p className="mt-2 text-sm text-slate-500">
            เข้า: {todayRecord.checkIn ? formatTime(todayRecord.checkIn.created_at) : '--:--'} · ออก: {todayRecord.checkOut ? formatTime(todayRecord.checkOut.created_at) : '--:--'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => router.push('/employee')}>หน้าแรก</Button>
            <Button onClick={() => router.push('/employee/history?tab=attendance')}>ประวัติ</Button>
          </div>
        </Card>
      )}

      {step === 'status' && !alreadyDone && (
        <div className="space-y-5">
          {!canCheckIn && (
            <Card className="border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
                  <XCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-950">วันนี้มีสถานะลา</p>
                  <p className="mt-1 text-xs leading-5 text-red-700">ระบบจึงปิดการลงเวลาชั่วคราว</p>
                </div>
              </div>
            </Card>
          )}

          {gpsError && (
            <Card className="border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-950">ไม่สามารถเข้าถึง GPS</p>
                  <p className="mt-1 text-xs leading-5 text-red-700">{gpsError}</p>
                  <Button variant="ghost" size="sm" className="mt-2 px-0 text-red-700 hover:bg-transparent" onClick={fetchGPS}>
                    ลองใหม่อีกครั้ง
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                <Camera className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-950">ยืนยันตัวตนก่อนลงเวลา</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">ถ่ายรูปเซลฟีและตรวจสอบตำแหน่งก่อนส่งข้อมูล</p>
              </div>
            </div>
            <Button
              fullWidth
              size="lg"
              icon={<Camera className="h-5 w-5" />}
              onClick={() => setStep('camera')}
              disabled={!canStartCamera}
            >
              ถ่ายรูปยืนยันตัวตน
            </Button>
          </Card>
        </div>
      )}

      {step === 'camera' && (
        <div className="space-y-4">
          <Card padding="none" className="overflow-hidden bg-black">
            <div className="relative aspect-[3/4]">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-8 text-center">
                  <XCircle className="mb-4 h-12 w-12 text-red-500" />
                  <p className="text-base font-semibold text-white">{cameraError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-5 border-white/20 text-white hover:bg-white/10"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.setAttribute('capture', 'user');
                      input.onchange = (event: Event) => {
                        const target = event.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            stopCameraStream();
                            setPhotoData(reader.result as string);
                            setStep('confirm');
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    เลือกรูปจากเครื่อง
                  </Button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
              )}

              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20" />

              <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center px-8">
                <button
                  type="button"
                  onClick={takePhoto}
                  disabled={Boolean(cameraError) || !cameraStream}
                  className="h-20 w-20 rounded-full bg-white p-1 shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                  aria-label="ถ่ายรูป"
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-slate-900 text-slate-900">
                    <div className="h-4 w-4 rounded-sm bg-slate-900" />
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => { stopCameraStream(); setStep('status'); }}
                className="absolute left-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-black/50 text-white transition-colors hover:bg-black/70"
                aria-label="กลับ"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
          </Card>

          <canvas ref={canvasRef} className="hidden" />
          <p className="text-center text-xs text-slate-500">จัดใบหน้าให้อยู่ในกรอบ แล้วกดถ่ายรูป</p>
        </div>
      )}

      {step === 'confirm' && photoData && (
        <div className="space-y-5">
          <Card padding="none" className="overflow-hidden">
            <div className="relative aspect-[3/4]">
              <img src={photoData} alt="Preview" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white">
                <p className="text-lg font-semibold">{isCheckIn ? 'เข้างาน' : 'ออกงาน'}</p>
                <p className="mt-1 text-xs text-white/70">ยืนยันตัวตนแล้ว</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <p className="text-sm font-semibold text-slate-950">รายละเอียดการลงเวลา</p>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>

            <div className="space-y-3">
              {[
                { label: 'เวลาที่บันทึก', value: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
                { label: 'สาขา', value: branch?.name ? `${branch.name}${isCrossBranch ? ` (สาขาหลัก: ${homeBranch?.name || '-'})` : ''}` : '-' },
                { label: 'กะงาน', value: todayShift?.shift_name || 'ทั่วไป' },
                { label: 'ความแม่นยำ GPS', value: `${Math.round(gpsCoords?.accuracy || 0)} เมตร`, color: getAccuracyColor(getAccuracyLevel(gpsCoords?.accuracy || 0)) },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className={`min-w-0 truncate text-right text-sm font-semibold ${item.color || 'text-slate-950'}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              fullWidth
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setPhotoData(null);
                setStep('camera');
              }}
            >
              ถ่ายใหม่
            </Button>
            <Button
              fullWidth
              size="lg"
              loading={submitting}
              disabled={!photoData || !canSubmit}
              onClick={handleSubmit}
            >
              ยืนยันการลงเวลา
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && (
        <Card className="p-6 text-center">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
            resultStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {resultStatus === 'success' ? <CheckCircle2 className="h-9 w-9" /> : <XCircle className="h-9 w-9" />}
          </div>

          <h3 className={`mt-5 text-xl font-semibold ${resultStatus === 'success' ? 'text-slate-950' : 'text-red-950'}`}>
            {resultMessage}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {resultStatus === 'success'
              ? `${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · เชื่อมต่อข้อมูลสำเร็จ`
              : 'เกิดข้อผิดพลาด กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'}
          </p>

          <div className="mt-6">
            {resultStatus === 'success' ? (
              <Button fullWidth size="lg" onClick={() => router.push('/employee')}>
                กลับสู่แดชบอร์ด
              </Button>
            ) : (
              <Button fullWidth size="lg" variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
                เริ่มใหม่
              </Button>
            )}
          </div>
        </Card>
      )}
    </Page>
  );
}
