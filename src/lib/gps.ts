// ==========================================
// WorkFlow Pro — GPS Utilities
// ==========================================

import type { GPSCoordinates } from './types';

export function getCurrentPosition(): Promise<GPSCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS ไม่พร้อมใช้งานบนอุปกรณ์นี้'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS'));
            break;
          case error.TIMEOUT:
            reject(new Error('หมดเวลาการระบุตำแหน่ง กรุณาลองใหม่'));
            break;
          default:
            reject(new Error('เกิดข้อผิดพลาดในการระบุตำแหน่ง'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

export function getAccuracyLevel(accuracyMeters: number): 'high' | 'medium' | 'low' {
  if (accuracyMeters <= 20) return 'high';
  if (accuracyMeters <= 50) return 'medium';
  return 'low';
}

export function getAccuracyLabel(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return 'ความแม่นยำสูง';
    case 'medium': return 'ความแม่นยำปานกลาง';
    case 'low': return 'ความแม่นยำต่ำ';
  }
}

export function getAccuracyColor(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return 'text-emerald-600';
    case 'medium': return 'text-amber-600';
    case 'low': return 'text-red-600';
  }
}

export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform || 'Unknown',
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  };
}
