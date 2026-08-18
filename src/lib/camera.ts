// ==========================================
// WorkFlow Pro — Camera Utilities
// ==========================================

/**
 * Open camera stream (live only, no gallery)
 */
export async function openCamera(
  facingMode: 'user' | 'environment' = 'user'
): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('กล้องไม่พร้อมใช้งานบนอุปกรณ์นี้');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    return stream;
  } catch (error) {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          throw new Error('กรุณาอนุญาตการเข้าถึงกล้อง');
        case 'NotFoundError':
          throw new Error('ไม่พบกล้องบนอุปกรณ์นี้');
        case 'NotReadableError':
          throw new Error('กล้องกำลังถูกใช้งานโดยแอปอื่น');
        default:
          throw new Error('ไม่สามารถเปิดกล้องได้');
      }
    }
    throw error;
  }
}

/**
 * Capture a photo from a video element
 */
export function capturePhoto(
  videoElement: HTMLVideoElement,
  quality: number = 0.76
): { blob: Blob; dataUrl: string } | null {
  const canvas = document.createElement('canvas');
  const maxDimension = 1280;
  const largestDimension = Math.max(videoElement.videoWidth, videoElement.videoHeight);
  const scale = largestDimension > maxDimension ? maxDimension / largestDimension : 1;
  canvas.width = Math.max(1, Math.round(videoElement.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoElement.videoHeight * scale));
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const byteString = atob(dataUrl.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: 'image/jpeg' });
  
  return { blob, dataUrl };
}

/**
 * Stop all tracks in a media stream
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

/**
 * Generate a simple hash of image data for duplicate detection
 */
export async function generateImageHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
