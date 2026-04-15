import { supabase } from './supabase';

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
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
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
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
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
