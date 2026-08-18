type ImagePreset = 'avatar' | 'document' | 'proof' | 'attendance';

type ImageOptimizationOptions = {
  maxDimension: number;
  quality: number;
  maxBytes: number;
  outputType: 'image/webp' | 'image/jpeg';
};

export type OptimizedImage = {
  blob: Blob;
  extension: 'webp' | 'jpg';
  optimized: boolean;
};

const PRESETS: Record<ImagePreset, ImageOptimizationOptions> = {
  avatar: { maxDimension: 768, quality: 0.8, maxBytes: 1_500_000, outputType: 'image/webp' },
  document: { maxDimension: 2_000, quality: 0.84, maxBytes: 4_000_000, outputType: 'image/webp' },
  proof: { maxDimension: 1_280, quality: 0.78, maxBytes: 3_000_000, outputType: 'image/webp' },
  attendance: { maxDimension: 1_280, quality: 0.76, maxBytes: 2_000_000, outputType: 'image/jpeg' },
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImageSource(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    image.src = objectUrl;
  });

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(objectUrl),
  };
}

function scaledDimensions(width: number, height: number, maxDimension: number) {
  const largest = Math.max(width, height);
  const scale = largest > maxDimension ? maxDimension / largest : 1;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function optimizeImage(
  file: Blob,
  preset: ImagePreset = 'proof',
): Promise<OptimizedImage> {
  const isOptimizable =
    typeof window !== 'undefined'
    && file.type.startsWith('image/')
    && !['image/gif', 'image/svg+xml'].includes(file.type);

  if (!isOptimizable) {
    return {
      blob: file,
      extension: file.type === 'image/webp' ? 'webp' : 'jpg',
      optimized: false,
    };
  }

  const options = PRESETS[preset];
  const loaded = await loadImageSource(file);

  try {
    const dimensions = scaledDimensions(loaded.width, loaded.height, options.maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d', { alpha: options.outputType === 'image/webp' });
    if (!context) {
      throw new Error('อุปกรณ์นี้ไม่รองรับการย่อรูปภาพ');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(loaded.source, 0, 0, dimensions.width, dimensions.height);

    let optimized = await canvasToBlob(canvas, options.outputType, options.quality);
    let extension: OptimizedImage['extension'] = options.outputType === 'image/webp' ? 'webp' : 'jpg';

    if (!optimized) {
      optimized = await canvasToBlob(canvas, 'image/jpeg', options.quality);
      extension = 'jpg';
    }

    if (!optimized) {
      throw new Error('บีบอัดรูปภาพไม่สำเร็จ');
    }

    if (optimized.size > options.maxBytes) {
      const retryQuality = Math.max(0.58, options.quality - 0.16);
      const retried = await canvasToBlob(canvas, extension === 'webp' ? 'image/webp' : 'image/jpeg', retryQuality);
      if (retried && retried.size < optimized.size) {
        optimized = retried;
      }
    }

    const wasScaled = dimensions.width !== loaded.width || dimensions.height !== loaded.height;
    const shouldUseOptimized = wasScaled || optimized.size < file.size;

    if (!shouldUseOptimized) {
      return {
        blob: file,
        extension: file.type === 'image/webp' ? 'webp' : 'jpg',
        optimized: false,
      };
    }

    if (optimized.size > options.maxBytes) {
      throw new Error(`รูปภาพมีขนาดใหญ่เกินไปหลังบีบอัด (${Math.ceil(optimized.size / 1_000_000)} MB)`);
    }

    return { blob: optimized, extension, optimized: true };
  } finally {
    loaded.close();
  }
}

export function replaceFileExtension(path: string, extension: string) {
  const queryIndex = path.indexOf('?');
  const cleanPath = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  const lastSlash = cleanPath.lastIndexOf('/');
  const lastDot = cleanPath.lastIndexOf('.');

  if (lastDot > lastSlash) {
    return `${cleanPath.slice(0, lastDot)}.${extension}`;
  }

  return `${cleanPath}.${extension}`;
}

export async function imageFileToDataUrl(file: Blob, preset: ImagePreset = 'attendance') {
  const optimized = await optimizeImage(file, preset);

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.readAsDataURL(optimized.blob);
  });
}
