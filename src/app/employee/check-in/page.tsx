'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Camera, MapPin, CheckCircle2, XCircle, AlertTriangle,
  Navigation, Clock, Shield, Crosshair, RotateCcw
} from 'lucide-react';
import { ATTENDANCE_STATUS_LABELS } from '@/lib/constants';
import { formatTime } from '@/lib/dateUtils';
import type { GPSCoordinates, AttendanceRecord } from '@/lib/types';
import { checkGeofence, formatDistance } from '@/lib/geofence';
import { getAccuracyLevel, getAccuracyLabel, getAccuracyColor, getDeviceInfo } from '@/lib/gps';

type Step = 'status' | 'camera' | 'confirm' | 'result';

export default function CheckInPage() {
  const { currentUser } = useAuthStore();
  const attendanceStore = useAttendanceStore();
  const branchStore = useBranchStore();

  const [step, setStep] = useState<Step>('status');
  const [gpsCoords, setGpsCoords] = useState<GPSCoordinates | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultStatus, setResultStatus] = useState<'success' | 'error'>('success');
  const [resultMessage, setResultMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!currentUser) return null;

  const branch = branchStore.getBranchById(currentUser.branch_id);
  const todayStatus = attendanceStore.getTodayStatus(currentUser.id);
  const todayRecord = attendanceStore.getTodayRecordForUser(currentUser.id);
  const isCheckOut = todayStatus === 'checked_in' || todayStatus === 'late';
  const alreadyDone = todayStatus === 'checked_out';

  const geofenceResult = gpsCoords && branch
    ? checkGeofence(gpsCoords, branch)
    : null;

  // GPS
  const fetchGPS = useCallback(() => {
    setGpsLoading(true);
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsError('GPS ไม่พร้อมใช้งานบนอุปกรณ์นี้');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setGpsLoading(false);
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง',
          2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS',
          3: 'หมดเวลาการระบุตำแหน่ง กรุณาลองใหม่',
        };
        setGpsError(msgs[err.code] || 'เกิดข้อผิดพลาดในการระบุตำแหน่ง');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (step === 'status') fetchGPS();
  }, [step, fetchGPS]);

  // Camera
  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง');
    }
  };

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPhotoData(dataUrl);
    stopCameraStream();
    setStep('confirm');
  };

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => {
      if (step === 'camera') stopCameraStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Submit
  const handleSubmit = async () => {
    if (!gpsCoords || !branch || !photoData) return;

    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));

    const geoResult = checkGeofence(gpsCoords, branch);

    if (!geoResult.isWithinGeofence) {
      setResultStatus('error');
      setResultMessage(`คุณอยู่ห่างจาก${branch.name} ${formatDistance(geoResult.distanceMeters)} เกินรัศมีที่อนุญาต (${branch.geofence_radius_meters} ม.)`);
      setStep('result');
      setSubmitting(false);
      return;
    }

    const now = new Date().toISOString();
    const isLate = !isCheckOut && new Date().getHours() >= 8 && new Date().getMinutes() > 45;

    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      user_id: currentUser.id,
      branch_id: branch.id,
      type: isCheckOut ? 'check_out' : 'check_in',
      photo_url: photoData,
      latitude: gpsCoords.latitude,
      longitude: gpsCoords.longitude,
      gps_accuracy: gpsCoords.accuracy,
      verified_in_geofence: true,
      device_info: getDeviceInfo(),
      created_at: now,
      server_timestamp: now,
      status: isCheckOut ? 'checked_out' : (isLate ? 'late' : 'checked_in'),
      notes: isLate ? `เข้างานสาย` : '',
    };

    await attendanceStore.addRecord(record);
    setResultStatus('success');
    setResultMessage(isCheckOut ? 'เช็กเอาต์สำเร็จ' : (isLate ? 'เช็กอินสำเร็จ (สาย)' : 'เช็กอินสำเร็จ'));
    setStep('result');
    setSubmitting(false);
  };

  // Reset for retry
  const reset = () => {
    setPhotoData(null);
    setStep('status');
    fetchGPS();
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-slate-900">
        {isCheckOut ? 'เช็กเอาต์ออกงาน' : 'เช็กอินเข้างาน'}
      </h1>

      {/* Already checked out */}
      {alreadyDone && step === 'status' && (
        <Card statusColor="blue">
          <div className="flex flex-col items-center text-center py-6">
            <div className="p-3 rounded-full bg-blue-100 mb-3">
              <CheckCircle2 className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">เช็กเอาต์แล้ววันนี้</h3>
            <p className="text-sm text-slate-500">
              เช็กอิน {todayRecord.checkIn && formatTime(todayRecord.checkIn.created_at)} —
              เช็กเอาต์ {todayRecord.checkOut && formatTime(todayRecord.checkOut.created_at)}
            </p>
          </div>
        </Card>
      )}

      {/* Step: Status / GPS */}
      {step === 'status' && !alreadyDone && (
        <>
          {/* GPS Status */}
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${gpsCoords ? 'bg-emerald-100' : gpsError ? 'bg-red-100' : 'bg-slate-100'}`}>
                <Navigation className={`w-5 h-5 ${gpsCoords ? 'text-emerald-600' : gpsError ? 'text-red-600' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">ตำแหน่ง GPS</p>
                {gpsLoading && <p className="text-xs text-slate-500">กำลังระบุตำแหน่ง...</p>}
                {gpsError && <p className="text-xs text-red-600">{gpsError}</p>}
                {gpsCoords && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="success" size="sm" dot>พร้อม</Badge>
                    <span className={`text-xs ${getAccuracyColor(getAccuracyLevel(gpsCoords.accuracy))}`}>
                      {getAccuracyLabel(getAccuracyLevel(gpsCoords.accuracy))} ({Math.round(gpsCoords.accuracy)} ม.)
                    </span>
                  </div>
                )}
              </div>
              {(gpsError || gpsCoords) && (
                <button onClick={fetchGPS} className="p-2 rounded-lg hover:bg-slate-100">
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>

            {gpsCoords && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  <Crosshair className="w-3 h-3" />
                  {gpsCoords.latitude.toFixed(6)}, {gpsCoords.longitude.toFixed(6)}
                </div>
              </div>
            )}
          </Card>

          {/* Geofence Status */}
          {geofenceResult && (
            <Card statusColor={geofenceResult.isWithinGeofence ? 'green' : 'red'}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${geofenceResult.isWithinGeofence ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  <MapPin className={`w-5 h-5 ${geofenceResult.isWithinGeofence ? 'text-emerald-600' : 'text-red-600'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {geofenceResult.isWithinGeofence ? 'อยู่ในพื้นที่ทำงาน' : 'อยู่นอกพื้นที่ทำงาน'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {geofenceResult.branchName} — ห่าง {formatDistance(geofenceResult.distanceMeters)}
                    {' '}(อนุญาต {geofenceResult.allowedRadius} ม.)
                  </p>
                </div>
                {geofenceResult.isWithinGeofence ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
            </Card>
          )}

          {/* Warning for low accuracy */}
          {gpsCoords && gpsCoords.accuracy > 100 && (
            <Card statusColor="amber" className="bg-amber-50/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  ความแม่นยำ GPS ต่ำ ({Math.round(gpsCoords.accuracy)} ม.) อาจส่งผลต่อการตรวจสอบตำแหน่ง
                </p>
              </div>
            </Card>
          )}

          {/* Action button */}
          <Button
            fullWidth
            size="lg"
            onClick={() => setStep('camera')}
            disabled={!gpsCoords || !geofenceResult?.isWithinGeofence}
            icon={<Camera className="w-5 h-5" />}
          >
            ถ่ายรูปเพื่อ{isCheckOut ? 'เช็กเอาต์' : 'เช็กอิน'}
          </Button>

          {gpsError && (
            <Button fullWidth variant="outline" onClick={fetchGPS} icon={<RotateCcw className="w-4 h-4" />}>
              ลองระบุตำแหน่งอีกครั้ง
            </Button>
          )}

          {/* Security note */}
          <div className="flex items-start gap-2 px-1">
            <Shield className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ระบบจะบันทึกรูปถ่ายสด, พิกัด GPS, เวลาเซิร์ฟเวอร์ และข้อมูลอุปกรณ์ เพื่อใช้ยืนยันตัวตนและตรวจสอบย้อนหลัง
              Browser/device อาจมีข้อจำกัดด้าน anti-spoofing ระบบออกแบบเป็น best-effort security
            </p>
          </div>
        </>
      )}

      {/* Step: Camera */}
      {step === 'camera' && (
        <div className="space-y-4">
          <Card padding="none" className="overflow-hidden">
            {cameraError ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <XCircle className="w-10 h-10 text-red-400 mb-2" />
                <p className="text-sm text-red-600 text-center">{cameraError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={startCamera}>
                  ลองใหม่
                </Button>
              </div>
            ) : (
              <div className="camera-viewfinder">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-[3/4] object-cover bg-black"
                />
              </div>
            )}
          </Card>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => { stopCameraStream(); setStep('status'); }}
            >
              ยกเลิก
            </Button>
            <Button
              fullWidth
              size="lg"
              onClick={takePhoto}
              disabled={!!cameraError || !cameraStream}
              icon={<Camera className="w-5 h-5" />}
            >
              ถ่ายรูป
            </Button>
          </div>

          <p className="text-xs text-center text-slate-400">
            กรุณาถ่ายรูปใบหน้าให้ชัดเจน ไม่อนุญาตให้ใช้รูปจาก Gallery
          </p>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && photoData && (
        <div className="space-y-4">
          <Card padding="none" className="overflow-hidden">
            <img src={photoData} alt="Preview" className="w-full aspect-[3/4] object-cover" />
          </Card>

          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">ประเภท</span>
                <span className="font-medium">{isCheckOut ? 'เช็กเอาต์' : 'เช็กอิน'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">เวลา</span>
                <span className="font-medium">{new Date().toLocaleTimeString('th-TH')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">สถานที่</span>
                <span className="font-medium">{branch?.name}</span>
              </div>
              {gpsCoords && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">พิกัด</span>
                    <span className="font-medium text-xs">
                      {gpsCoords.latitude.toFixed(6)}, {gpsCoords.longitude.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ความแม่นยำ</span>
                    <span className={`font-medium ${getAccuracyColor(getAccuracyLevel(gpsCoords.accuracy))}`}>
                      {Math.round(gpsCoords.accuracy)} ม.
                    </span>
                  </div>
                </>
              )}
              {geofenceResult && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ระยะจากสาขา</span>
                  <span className="font-medium">{formatDistance(geofenceResult.distanceMeters)}</span>
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => { setPhotoData(null); setStep('camera'); }}
            >
              ถ่ายใหม่
            </Button>
            <Button
              fullWidth
              size="lg"
              loading={submitting}
              onClick={handleSubmit}
              icon={<CheckCircle2 className="w-5 h-5" />}
              variant={isCheckOut ? 'primary' : 'success'}
            >
              ยืนยัน{isCheckOut ? 'เช็กเอาต์' : 'เช็กอิน'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && (
        <Card>
          <div className="flex flex-col items-center text-center py-6">
            <div className={`p-4 rounded-full mb-4 ${resultStatus === 'success' ? 'bg-emerald-100' : 'bg-red-100'}`}>
              {resultStatus === 'success' ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              ) : (
                <XCircle className="w-10 h-10 text-red-600" />
              )}
            </div>
            <h3 className={`text-lg font-semibold mb-1 ${resultStatus === 'success' ? 'text-emerald-900' : 'text-red-900'}`}>
              {resultMessage}
            </h3>
            <p className="text-sm text-slate-500">
              {resultStatus === 'success'
                ? `${new Date().toLocaleTimeString('th-TH')} — ${branch?.name}`
                : 'กรุณาลองใหม่อีกครั้ง'}
            </p>
            <div className="mt-4 w-full">
              {resultStatus === 'success' ? (
                <Button fullWidth variant="outline" onClick={() => window.history.back()}>
                  กลับหน้าหลัก
                </Button>
              ) : (
                <Button fullWidth onClick={reset} icon={<RotateCcw className="w-4 h-4" />}>
                  ลองใหม่
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Today's check-in info (shown on status step) */}
      {step === 'status' && todayRecord.checkIn && !alreadyDone && (
        <Card className="bg-primary-50/50">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-primary-600" />
            <div>
              <p className="text-xs text-primary-600 font-medium">เช็กอินวันนี้เมื่อ</p>
              <p className="text-sm font-semibold text-slate-900">{formatTime(todayRecord.checkIn.created_at)}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
