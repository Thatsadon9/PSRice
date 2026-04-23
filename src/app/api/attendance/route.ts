import { NextResponse } from 'next/server';
import { getAuthenticatedRequestContext, supabaseAdmin } from '@/lib/serverAuth';

/**
 * Convert a base64 data URL to a Buffer for server-side upload.
 */
function dataURLtoBuffer(dataurl: string): { buffer: Buffer; mime: string } {
  const parts = dataurl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const buffer = Buffer.from(parts[1], 'base64');
  return { buffer, mime };
}

/**
 * Upload a photo to Supabase Storage using the admin client (bypasses storage RLS).
 */
async function uploadPhotoServerSide(
  userId: string,
  photoDataUrl: string,
): Promise<string | null> {
  if (!supabaseAdmin) return null;

  try {
    const { buffer, mime } = dataURLtoBuffer(photoDataUrl);
    const extension = mime.includes('png') ? 'png' : 'jpg';
    const fileName = `attendance/${userId}/${Date.now()}.${extension}`;

    const { data, error } = await supabaseAdmin.storage
      .from('proofs')
      .upload(fileName, buffer, {
        contentType: mime,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Server photo upload error:', error.message);
      return null;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('proofs')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (err) {
    console.error('Failed to upload photo server-side:', err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client is not configured' },
        { status: 500 },
      );
    }

    const requestContext = await getAuthenticatedRequestContext(request);
    console.log('[API /attendance POST] auth result:', requestContext ? `user=${requestContext.profile.id} role=${requestContext.profile.role}` : 'FAILED');

    if (!requestContext) {
      const authHeader = request.headers.get('authorization');
      console.log('[API /attendance POST] 401 — auth header present:', !!authHeader);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requestContext.profile.status !== 'active') {
      return NextResponse.json({ error: 'บัญชีนี้ไม่พร้อมใช้งาน' }, { status: 403 });
    }

    const body = await request.json();

    // Ensure the user can only create records for themselves
    if (body.user_id && body.user_id !== requestContext.profile.id) {
      // Allow managers/admins to create records for others
      if (requestContext.profile.role === 'employee') {
        return NextResponse.json(
          { error: 'ไม่สามารถสร้างรายการให้ผู้ใช้อื่นได้' },
          { status: 403 },
        );
      }
    }

    const userId = body.user_id || requestContext.profile.id;

    // Handle photo upload server-side if it's a base64 data URL
    let photoUrl = body.photo_url || '';
    if (typeof photoUrl === 'string' && photoUrl.startsWith('data:')) {
      const uploadedUrl = await uploadPhotoServerSide(userId, photoUrl);
      if (uploadedUrl) {
        photoUrl = uploadedUrl;
      }
      // If upload fails, still save the record without the photo URL
      // rather than blocking the attendance record entirely
      if (!uploadedUrl) {
        photoUrl = '';
      }
    }

    const record = {
      user_id: userId,
      branch_id: body.branch_id,
      type: body.type,
      photo_url: photoUrl,
      latitude: body.latitude,
      longitude: body.longitude,
      gps_accuracy: body.gps_accuracy,
      verified_in_geofence: body.verified_in_geofence ?? false,
      device_info: body.device_info,
      status: body.status,
      notes: body.notes || '',
    };

    const { data, error } = await supabaseAdmin
      .from('attendance_records')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Attendance insert error:', error);
      return NextResponse.json(
        { error: error.message || 'บันทึกข้อมูลไม่สำเร็จ' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, record: data }, { status: 201 });
  } catch (error) {
    console.error('Attendance API error:', error);
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client is not configured' },
        { status: 500 },
      );
    }

    const requestContext = await getAuthenticatedRequestContext(request);
    console.log('[API /attendance GET] auth result:', requestContext ? `user=${requestContext.profile.id} role=${requestContext.profile.role}` : 'FAILED');

    if (!requestContext) {
      const authHeader = request.headers.get('authorization');
      console.log('[API /attendance GET] 401 — auth header present:', !!authHeader);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Employees can only see their own records; managers/admins see all
    let query = supabaseAdmin
      .from('attendance_records')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (requestContext.profile.role === 'employee') {
      query = query.eq('user_id', requestContext.profile.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Attendance fetch error:', error);
      return NextResponse.json(
        { error: error.message || 'ดึงข้อมูลไม่สำเร็จ' },
        { status: 500 },
      );
    }

    return NextResponse.json({ records: data || [] }, { status: 200 });
  } catch (error) {
    console.error('Attendance GET API error:', error);
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
