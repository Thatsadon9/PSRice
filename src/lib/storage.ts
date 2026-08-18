import { supabase } from './supabase';
import { optimizeImage, replaceFileExtension } from './imageOptimization';

function getImagePreset(bucket: string, path: string) {
  if (bucket === 'avatars') return 'avatar' as const;
  if (bucket === 'employee-documents') return 'document' as const;
  if (path.startsWith('attendance/')) return 'attendance' as const;
  return 'proof' as const;
}

async function prepareUpload(bucket: string, path: string, file: Blob | File) {
  if (!file.type.startsWith('image/')) {
    return { path, file };
  }

  const optimized = await optimizeImage(file, getImagePreset(bucket, path));

  return {
    path: optimized.optimized ? replaceFileExtension(path, optimized.extension) : path,
    file: optimized.blob,
  };
}

/**
 * Uploads a file (Blob/File) to a Supabase Storage bucket.
 * @param bucket The name of the bucket (e.g., 'proofs')
 * @param path The subdirectory/filename path (e.g., 'attendance/user_123/img.jpg')
 * @param file The file or blob to upload
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Blob | File
): Promise<string | null> {
  try {
    const prepared = await prepareUpload(bucket, path, file);
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(prepared.path, prepared.file, {
        cacheControl: '31536000',
        contentType: prepared.file.type || undefined,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error.message);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (err) {
    console.error('Failed to upload file:', err);
    return null;
  }
}

export async function uploadPrivateFile(
  bucket: string,
  path: string,
  file: Blob | File
): Promise<string | null> {
  try {
    const prepared = await prepareUpload(bucket, path, file);
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(prepared.path, prepared.file, {
        cacheControl: '31536000',
        contentType: prepared.file.type || undefined,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error.message);
      return null;
    }

    return data.path;
  } catch (err) {
    console.error('Failed to upload private file:', err);
    return null;
  }
}

function resolveStoredObjectPath(bucket: string, urlOrPath: string) {
  if (!urlOrPath) return null;

  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath.replace(/^\/+/, '');
  }

  try {
    const fileUrl = new URL(urlOrPath);
    const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    const marker = `/storage/v1/object/public/${bucket}/`;

    if (fileUrl.hostname !== projectUrl.hostname || !fileUrl.pathname.includes(marker)) {
      return null;
    }

    return decodeURIComponent(fileUrl.pathname.split(marker)[1] || '');
  } catch {
    return null;
  }
}

export async function removeStoredFile(bucket: string, urlOrPath: string | null | undefined) {
  const objectPath = resolveStoredObjectPath(bucket, urlOrPath || '');
  if (!objectPath) return false;

  const { error } = await supabase.storage.from(bucket).remove([objectPath]);

  if (error) {
    console.error('Storage delete error:', error.message);
    return false;
  }

  return true;
}

export async function createSignedFileUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error('Signed URL error:', error.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Failed to create signed URL:', err);
    return null;
  }
}

function getDownloadFilename(fileUrl: string, fallback = 'attachment') {
  try {
    const url = new URL(fileUrl);
    const segment = url.pathname.split('/').filter(Boolean).pop();

    if (!segment) {
      return fallback;
    }

    return decodeURIComponent(segment);
  } catch {
    return fallback;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(objectUrl);
}

export async function downloadFileFromUrl(fileUrl: string, preferredFilename?: string): Promise<void> {
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const filename = preferredFilename?.trim() || getDownloadFilename(fileUrl);

  triggerBlobDownload(blob, filename);
}

/**
 * Utility to convert dataURL/base64 to Blob
 */
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
