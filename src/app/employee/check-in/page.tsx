'use client';
/* eslint-disable @next/next/no-img-element */

import { differenceInMinutes, format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import { useHrStore } from '@/store/hrStore';
import { formatTime, getCurrentDateStr } from '@/lib/dateUtils';
import { checkGeofence, formatDistance } from '@/lib/geofence';
import { createLocalDateTime, resolveShiftForUserDate, formatMinutesAsHours } from '@/lib/hr';
import { getAccuracyColor, getAccuracyLabel, getAccuracyLevel, getDeviceInfo } from '@/lib/gps';
import type { AttendanceRecord, GPSCoordinates } from '@/lib/types';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  RotateCcw,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react';
import { openCamera, stopCamera, capturePhoto } from '@/lib/camera';

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
    
    // Ensure video is ready
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
    // Removed artificial delay for production readiness

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
        ? todayShift ? `เช็กเอาต์กะ ${todayShift.shift_name}` : ''
        : isLate
          ? `เข้างานสาย ${formatMinutesAsHours(lateMinutes)}`
          : todayShift
            ? `เช็กอินกะ ${todayShift.shift_name}`
            : '',
    };

    const result = await attendanceStore.addRecord(record);

    if (result.success) {
      setResultStatus('success');
      setResultMessage(
        isCheckOut
          ? 'เช็กเอาต์สำเร็จ'
          : isLate
            ? `เช็กอินสำเร็จ (สาย ${formatMinutesAsHours(lateMinutes)})`
            : 'เช็กอินสำเร็จ',
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

  return (
    <div className="px-4 py-8 space-y-6 animate-fade-in pb-24 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 leading-tight">
            {isCheckIn ? 'ลงเวลาเข้างาน' : 'ลงเวลาออกงาน'}
          </h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">ศุนย์ลงเวลาพนักงาน</p>
        </div>
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg ${isCheckIn ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-slate-900 text-white shadow-slate-200'}`}>
           {isCheckIn ? <MapPin className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
        </div>
      </div>

      {!schemaReady && (
        <Card className="bg-amber-50 border-amber-100 rounded-[2rem] p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-900 leading-tight">สถานะซิงก์: ออฟไลน์</p>
              <p className="text-[10px] font-bold text-amber-800/60 uppercase tracking-wider mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {todayShift && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-primary-500 rounded-[2rem] blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
          <Card className="relative bg-white border-slate-100 rounded-[2rem] p-5 shadow-xl shadow-slate-200/50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">{format(new Date(), 'EEE', { locale: th })}</span>
                  <span className="text-lg font-black text-slate-900 leading-none">{format(new Date(), 'd')}</span>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 underline decoration-primary-200 decoration-2 underline-offset-4">{todayShift.shift_name}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {todayShift.start_time} - {todayShift.end_time}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge variant={todayShift.source === 'assignment' ? 'success' : 'info'} className="font-black uppercase text-[9px] tracking-tight">
                  {todayShift.source === 'assignment' ? 'ซิงก์แล้ว' : 'ค่าเริ่มต้น'}
                </Badge>
                {isCrossBranch && (
                  <Badge variant="warning" className="font-black uppercase text-[9px] tracking-tight bg-amber-100 text-amber-700">
                    ปฏิบัติงานต่างสาขา
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {alreadyDone && step === 'status' && (
        <Card className="bg-slate-900 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="p-4 rounded-[2rem] bg-emerald-500/10 text-emerald-400 mb-6 border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-white mb-2 tracking-tight">คุณลงเวลาออกงานแล้ว</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              เข้า: {todayRecord.checkIn ? formatTime(todayRecord.checkIn.created_at) : '--:--'} <span className="mx-2 text-slate-700">•</span> ออก: {todayRecord.checkOut ? formatTime(todayRecord.checkOut.created_at) : '--:--'}
            </p>
            <div className="mt-8 w-full flex gap-3">
               <Button fullWidth variant="none" className="bg-white/5 border border-white/10 text-white font-black text-xs h-12 rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest" onClick={() => router.push('/employee')}>
                 🏠 หน้าแรก
               </Button>
               <Button fullWidth variant="none" className="bg-primary-600 text-white font-black text-xs h-12 rounded-2xl shadow-lg shadow-primary-900/40 hover:bg-primary-500 transition-all uppercase tracking-widest" onClick={() => router.push('/employee/history?tab=attendance')}>
                 📜 ดูประวัติ
               </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'status' && !alreadyDone && (
        <div className="space-y-6">
          {!canCheckIn && (
            <Card className="bg-red-50 border-red-100 rounded-[2rem] p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-red-900">ตรวจพบสถานะการลา ระบบล็อคชั่วคราว</p>
                  <p className="text-[10px] font-bold text-red-800/60 uppercase tracking-wider mt-1">Leave status detected. System locked.</p>
                </div>
              </div>
            </Card>
          )}

          <div className="mb-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-2">สถานที่ลงเวลา</label>
            <div className="relative">
              <select
                value={activeBranchId || ''}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  fetchGPS();
                }}
                className="w-full bg-white border-2 border-slate-100 rounded-[2rem] px-5 py-4 text-sm font-black text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 appearance-none shadow-sm transition-all"
              >
                {branchStore.branches
                  .filter(b => currentUser?.role === 'admin' || !b.admin_only)
                  .map(b => (
                  <option key={b.id} value={b.id}>{b.name} {b.id === currentUser?.branch_id ? '(สาขาหลัก)' : ''}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <Card className="p-5 rounded-[2rem] border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                   <div className="p-2.5 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform">
                      <Navigation className={`w-5 h-5 ${gpsCoords ? 'text-emerald-500' : 'text-slate-400'}`} />
                   </div>
                   {gpsLoading && <div className="w-4 h-4 rounded-full border-2 border-primary-100 border-t-primary-600 animate-spin" />}
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">สัญญาณ GPS</p>
                <div className="flex items-baseline gap-1.5">
                   <p className="text-lg font-black text-slate-900">{gpsCoords ? 'พร้อม' : 'กำลังค้นหา...'}</p>
                   {gpsCoords && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
                </div>
                {gpsCoords && (
                  <p className={`text-[9px] font-black uppercase mt-1 tracking-tighter ${getAccuracyColor(getAccuracyLevel(gpsCoords.accuracy))}`}>
                    แม่นยำระยะ {Math.round(gpsCoords.accuracy)}ม. • {getAccuracyLabel(getAccuracyLevel(gpsCoords.accuracy))}
                  </p>
                )}
             </Card>

             <Card className="p-5 rounded-[2rem] border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="flex items-center justify-between mb-3">
                   <div className="p-2.5 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform">
                      <MapPin className={`w-5 h-5 ${geofenceResult?.isWithinGeofence ? 'text-emerald-500' : 'text-slate-400'}`} />
                   </div>
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Location</p>
                <p className="text-lg font-black text-slate-900 truncate">
                   {geofenceResult ? (geofenceResult.isWithinGeofence ? 'ตรงพิกัด' : 'นอกพื้นที่') : '--'}
                </p>
                {geofenceResult && (
                  <p className={`text-[9px] font-black uppercase mt-1 tracking-tighter ${geofenceResult.isWithinGeofence ? 'text-emerald-600' : 'text-red-600'}`}>
                    {geofenceResult.isWithinGeofence ? 'อยู่ในพื้นที่' : 'อยู่นอกพื้นที่'}
                  </p>
                )}
             </Card>
          </div>

          {gpsError && (
            <Card className="bg-red-50 border-red-100 rounded-[2rem] p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-red-900">ไม่สามารถเข้าถึง GPS</p>
                  <p className="text-[10px] font-bold text-red-800/70 uppercase tracking-wider mt-1">{gpsError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 px-0 text-red-700 hover:bg-transparent"
                    onClick={fetchGPS}
                  >
                    ลองใหม่อีกครั้ง
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-4">
             <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/20 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -ml-12 -mb-12" />
                
                <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                   <div className="p-6 rounded-[2.5rem] bg-white/5 border border-white/10 shadow-inner group-hover:scale-105 transition-transform duration-500">
                      <Camera className="w-12 h-12 text-white" />
                   </div>
                   
                   <div className="space-y-2">
                      <h3 className="text-xl font-black text-white tracking-tight">ตรวจสอบความปลอดภัย</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">ถ่ายรูปเซลฟีเพื่อยืนยันตัวตน</p>
                   </div>
                   
                   <Button
                      fullWidth
                      size="lg"
                      variant="none"
                      onClick={() => setStep('camera')}
                      disabled={!gpsCoords || !geofenceResult?.isWithinGeofence || !canCheckIn}
                      className={`h-16 rounded-[2rem] text-sm font-black uppercase tracking-widest transition-all
                        ${!gpsCoords || !geofenceResult?.isWithinGeofence || !canCheckIn 
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                          : 'bg-primary-600 text-white shadow-xl shadow-primary-900/40 hover:bg-primary-500 active:scale-95'}
                      `}
                   >
                     📸 ถ่ายรูปยืนยัน
                   </Button>
                </div>
             </div>
             
             <div className="flex items-center justify-center gap-6 px-4">
                <div className="flex items-center gap-2">
                   <Shield className="w-3 h-3 text-slate-300" />
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ระบบยืนยันตัวตน</span>
                </div>
                <div className="flex items-center gap-2">
                   <Navigation className="w-3 h-3 text-slate-300" />
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">บังคับใช้พิกัด</span>
                </div>
             </div>
          </div>
        </div>
      )}

      {step === 'camera' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
           <div className="relative rounded-[3rem] overflow-hidden shadow-2xl bg-black aspect-[3/4]">
              <div className="absolute inset-0 z-0 opacity-40">
                 <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)]" />
              </div>
              
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-900">
                   <XCircle className="w-12 h-12 text-red-500 mb-4" />
                   <p className="text-lg font-black text-white leading-tight">{cameraError}</p>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="mt-6 border-white/20 text-white hover:bg-white/10" 
                     onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.setAttribute('capture', 'user');
                        input.onchange = (e: any) => {
                          const file = e.target.files?.[0];
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
                     ลองใหม่
                   </Button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              
              <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/20 rounded-[3rem]" />
              
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full px-8 flex justify-center">
                 <button
                   onClick={takePhoto}
                   disabled={Boolean(cameraError) || !cameraStream}
                   className="w-20 h-20 rounded-full bg-white p-1 hover:scale-110 active:scale-95 transition-all shadow-2xl disabled:opacity-50"
                 >
                    <div className="w-full h-full rounded-full border-4 border-slate-900 flex items-center justify-center text-slate-900">
                       <div className="w-4 h-4 bg-slate-900 rounded-sm" />
                    </div>
                 </button>
              </div>

              <button 
                 onClick={() => { stopCameraStream(); setStep('status'); }}
                 className="absolute top-8 left-8 p-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white hover:bg-black/60 transition-all"
              >
                 <ArrowLeft className="w-5 h-5" />
              </button>
           </div>
           
           <canvas ref={canvasRef} className="hidden" />
           <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">จัดใบหน้าให้อยู่ในกรอบที่กำหนด</p>
        </div>
      )}

      {step === 'confirm' && photoData && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="relative group">
             <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-emerald-500 rounded-[3rem] blur opacity-10"></div>
             <Card padding="none" className="relative overflow-hidden rounded-[3rem] shadow-2xl aspect-[3/4]">
                <img src={photoData} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                   <div className="flex items-center justify-between gap-4">
                      <div>
                         <p className="text-xl font-black text-white">{isCheckIn ? 'เข้างาน' : 'ออกงาน'}</p>
                         <p className="text-xs font-black text-white/60 uppercase tracking-widest">ยืนยันตัวตนแล้ว</p>
                      </div>
                      <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/40">
                         <CheckCircle2 className="w-6 h-6" />
                      </div>
                   </div>
                </div>
             </Card>
          </div>

          <Card className="rounded-[2.5rem] border-slate-100 p-6 space-y-4 shadow-xl shadow-slate-200/50">
             <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รายละเอียดการลงเวลา</p>
                <div className="h-2 w-2 bg-emerald-500 rounded-full" />
             </div>
             
             <div className="space-y-3">
               {[
                 { label: 'เวลาที่บันทึก', value: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
                 { label: 'สาขา/ศูนย์ปฏิบัติงาน', value: branch?.name + (isCrossBranch ? ` (สาขาหลัก: ${homeBranch?.name})` : '') },
                 { label: 'กะงาน', value: todayShift?.shift_name || 'ทั่วไป' },
                 { label: 'ความแม่นยำ GPS', value: `${Math.round(gpsCoords?.accuracy || 0)} เมตร`, color: getAccuracyColor(getAccuracyLevel(gpsCoords?.accuracy || 0)) },
               ].map((item, idx) => (
                 <div key={idx} className="flex justify-between items-baseline">
                   <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{item.label}</span>
                   <span className={`text-[13px] font-black ${item.color || 'text-slate-900'}`}>{item.value}</span>
                 </div>
               ))}
             </div>
          </Card>

          <div className="flex gap-4">
            <Button
              variant="none"
              fullWidth
              onClick={() => {
                setPhotoData(null);
                setStep('camera');
              }}
              className="h-16 rounded-[2rem] bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              ถ่ายใหม่
            </Button>
            <Button
              fullWidth
              size="lg"
              variant="none"
              loading={submitting}
              onClick={handleSubmit}
              className={`h-16 rounded-[2rem] text-white font-black uppercase tracking-widest text-xs shadow-xl transition-all flex items-center justify-center gap-2
                ${isCheckIn ? 'bg-emerald-600 shadow-emerald-900/40 hover:bg-emerald-500' : 'bg-slate-900 shadow-slate-900/40 hover:bg-slate-800'}
              `}
            >
               ยืนยันและส่งข้อมูล
               <CheckCircle2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && (
        <div className="animate-in zoom-in-95 fade-in-0 duration-700 max-w-sm mx-auto pt-10">
          <Card className="rounded-[3rem] border-slate-100 shadow-2xl relative overflow-hidden group">
            <div className={`h-2.5 w-full ${resultStatus === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            
            <div className="p-10 flex flex-col items-center text-center">
              <div className={`p-6 rounded-[2.5rem] mb-8 relative ${resultStatus === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {resultStatus === 'success' ? (
                  <>
                    <CheckCircle2 className="w-16 h-16" />
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-bounce">
                       <Zap className="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <XCircle className="w-16 h-16" />
                )}
              </div>
              
              <h3 className={`text-2xl font-black mb-3 tracking-tight ${resultStatus === 'success' ? 'text-slate-900' : 'text-red-900'}`}>
                {resultMessage}
              </h3>
              
              <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] leading-relaxed mb-8">
                {resultStatus === 'success'
                  ? `${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} • เชื่อมต่อข้อมูลสำเร็จ`
                  : 'เกิดข้อผิดพลาดรุนแรง โปรดติดต่อผู้ดูแลระบบหากยังพบปัญหา'}
              </p>
              
              <div className="w-full space-y-3">
                {resultStatus === 'success' ? (
                  <Button 
                     fullWidth 
                     variant="none" 
                     onClick={() => router.push('/employee')}
                     className="h-14 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-slate-800 hover:shadow-xl transition-all"
                  >
                    กลับสู่แดชบอร์ด
                  </Button>
                ) : (
                  <Button 
                     fullWidth 
                     variant="none"
                     onClick={reset}
                     className="h-14 rounded-2xl bg-red-600 text-white font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    เริ่มกระบวนการใหม่
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
