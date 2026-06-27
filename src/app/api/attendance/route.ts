import { NextResponse } from 'next/server';
import { getAuthenticatedRequestContext, supabaseAdmin } from '@/lib/serverAuth';
import { getCurrentDateStr } from '@/lib/dateUtils';

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

    const isManagerManual =
      Boolean(body.manager_manual) &&
      (requestContext.profile.role === 'admin' || requestContext.profile.role === 'manager');

    if (isManagerManual) {
      const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';
      const branchIdManual = typeof body.branch_id === 'string' ? body.branch_id : '';
      const punchType =
        body.type === 'check_in' || body.type === 'check_out' ? body.type : null;
      const createdAtRaw = typeof body.created_at === 'string' ? body.created_at : '';

      if (!targetUserId || !branchIdManual || !punchType) {
        return NextResponse.json(
          { error: 'ระบุ user_id branch_id และ type (check_in / check_out) ให้ครบ' },
          { status: 400 },
        );
      }

      const parsedCreated = Date.parse(createdAtRaw);
      if (Number.isNaN(parsedCreated)) {
        return NextResponse.json({ error: 'ระบุ created_at (เวลาบันทึก) ไม่ถูกต้อง' }, { status: 400 });
      }

      if (requestContext.profile.role === 'manager' && branchIdManual !== requestContext.profile.branch_id) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เพิ่มรายการนอกสาขา' }, { status: 403 });
      }

      const { data: targetUser, error: targetErr } = await supabaseAdmin
        .from('users')
        .select('id, role, branch_id')
        .eq('id', targetUserId)
        .maybeSingle();

      if (targetErr || !targetUser) {
        return NextResponse.json({ error: 'ไม่พบพนักงานที่ระบุ' }, { status: 404 });
      }

      if (targetUser.role !== 'employee') {
        return NextResponse.json({ error: 'ระบุได้เฉพาะพนักงาน' }, { status: 400 });
      }

      if (targetUser.branch_id !== branchIdManual) {
        return NextResponse.json({ error: 'สาขาไม่ตรงกับพนักงาน' }, { status: 400 });
      }

      if (requestContext.profile.role === 'manager' && targetUser.branch_id !== requestContext.profile.branch_id) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เพิ่มรายการให้พนักงานนอกสาขา' }, { status: 403 });
      }

      const noteExtra = typeof body.notes === 'string' ? body.notes.trim() : '';
      const auditLine = `[เพิ่มรายการโดย ${requestContext.profile.full_name}]${noteExtra ? ` ${noteExtra}` : ''}`;

      const record = {
        user_id: targetUserId,
        branch_id: branchIdManual,
        type: punchType,
        photo_url: '',
        latitude: 0,
        longitude: 0,
        gps_accuracy: 0,
        verified_in_geofence: false,
        device_info: {
          userAgent: 'manager-manual-entry',
          platform: 'web',
          screenWidth: 0,
          screenHeight: 0,
        },
        status: punchType === 'check_in' ? 'checked_in' : 'checked_out',
        notes: auditLine,
        created_at: new Date(parsedCreated).toISOString(),
      };

      const { data: created, error: insertManualErr } = await supabaseAdmin
        .from('attendance_records')
        .insert(record)
        .select()
        .single();

      if (insertManualErr) {
        console.error('Attendance manager-manual insert error:', insertManualErr);
        return NextResponse.json(
          { error: insertManualErr.message || 'บันทึกข้อมูลไม่สำเร็จ' },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, record: created }, { status: 201 });
    }

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

    // Auto-complete check-in milestone if applicable
    if (data && body.type === 'check_in') {
      try {
        const todayStr = getCurrentDateStr();
        
        // Find the pending check-in task for today
        const { data: checkInTasks } = await supabaseAdmin
          .from('tasks')
          .select('id, status, template_id, title')
          .eq('assigned_to', userId)
          .eq('due_date', todayStr)
          .in('status', ['pending', 'in_progress']);

        const checkInTask = checkInTasks?.find(t => 
          t.title && t.title.includes('เช็คอิน')
        );

        if (checkInTask) {
          // Update task to approved
          await supabaseAdmin
            .from('tasks')
            .update({ status: 'approved' })
            .eq('id', checkInTask.id);

          // Create a submission
          await supabaseAdmin
            .from('task_submissions')
            .insert({
              task_id: checkInTask.id,
              submitted_by: userId,
              note: 'เช็คอินอัตโนมัติจากระบบ',
              review_status: 'approved'
            });
        }
      } catch (err) {
        console.error('Auto-complete check-in task error:', err);
      }
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

type CorrectionUpdate = { id: string; created_at: string };

function isCorrectionUpdate(value: unknown): value is CorrectionUpdate {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CorrectionUpdate).id === 'string' &&
    typeof (value as CorrectionUpdate).created_at === 'string'
  );
}

/** Manager/admin: adjust stored punch times (updates `created_at` + normalized status + audit note). */
export async function PATCH(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client is not configured' },
        { status: 500 },
      );
    }

    const requestContext = await getAuthenticatedRequestContext(request);

    if (!requestContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profile } = requestContext;

    if (profile.status !== 'active') {
      return NextResponse.json({ error: 'บัญชีนี้ไม่พร้อมใช้งาน' }, { status: 403 });
    }

    if (profile.role !== 'admin' && profile.role !== 'manager') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการเข้างาน' }, { status: 403 });
    }

    const body = (await request.json()) as {
      updates?: unknown;
      note?: unknown;
    };

    const updatesRaw = body.updates;
    if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
      return NextResponse.json({ error: 'ระบุการอัปเดตอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    const validated = updatesRaw.filter(isCorrectionUpdate);
    const byId = new Map<string, CorrectionUpdate>();
    for (const item of validated) {
      byId.set(item.id, item);
    }
    const updates = [...byId.values()];
    if (updates.length === 0) {
      return NextResponse.json({ error: 'ข้อมูลอัปเดตไม่ถูกต้อง' }, { status: 400 });
    }

    const ids = updates.map((u) => u.id);
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .in('id', ids);

    if (fetchError || !rows?.length || rows.length !== ids.length) {
      return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการแก้ไข' }, { status: 404 });
    }

    const rowMap = new Map(rows.map((r) => [r.id as string, r]));
    const userIds = new Set(rows.map((r) => r.user_id as string));
    if (userIds.size !== 1) {
      return NextResponse.json({ error: 'แก้ไขได้ครั้งละพนักงานหนึ่งคนเท่านั้น' }, { status: 400 });
    }

    if (profile.role === 'manager') {
      const allowed = rows.every((r) => r.branch_id === profile.branch_id);
      if (!allowed) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขรายการนอกสาขา' }, { status: 403 });
      }
    }

    const noteExtra =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : '';
    const auditSuffix = `[แก้ไขเวลาโดย ${profile.full_name}]${noteExtra ? ` ${noteExtra}` : ''}`;

    const outRecords: Record<string, unknown>[] = [];

    for (const u of updates) {
      const existing = rowMap.get(u.id);
      if (!existing) {
        return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการแก้ไข' }, { status: 404 });
      }

      const parsed = Date.parse(u.created_at);
      if (Number.isNaN(parsed)) {
        return NextResponse.json({ error: 'รูปแบบเวลาไม่ถูกต้อง' }, { status: 400 });
      }

      const newStatus =
        existing.type === 'check_in'
          ? 'checked_in'
          : 'checked_out';

      const prevNotes = typeof existing.notes === 'string' ? existing.notes : '';
      const notes = prevNotes ? `${prevNotes}\n${auditSuffix}` : auditSuffix;

      const { data: updated, error: upErr } = await supabaseAdmin
        .from('attendance_records')
        .update({
          created_at: new Date(parsed).toISOString(),
          status: newStatus,
          notes,
        })
        .eq('id', u.id)
        .select()
        .single();

      if (upErr) {
        console.error('Attendance correction update error:', upErr);
        return NextResponse.json(
          { error: upErr.message || 'ไม่สามารถอัปเดตข้อมูลได้' },
          { status: 500 },
        );
      }

      if (updated) {
        outRecords.push(updated);
      }
    }

    return NextResponse.json({ success: true, records: outRecords }, { status: 200 });
  } catch (error) {
    console.error('Attendance PATCH API error:', error);
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
