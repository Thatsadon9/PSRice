import { NextResponse } from 'next/server';
import { getAuthenticatedRequestContext, supabaseAdmin } from '@/lib/serverAuth';

interface ProfileUpdateBody {
  full_name?: string;
  address?: string | null;
  citizen_id?: string | null;
  avatar_url?: string | null;
  citizen_id_card_path?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_book_path?: string | null;
}

function nullableText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeCitizenId(value: unknown) {
  const normalized = nullableText(value);

  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/\D/g, '');

  if (digits.length !== 13) {
    throw new Error('เลขบัตรประชาชนต้องมี 13 หลัก');
  }

  return digits;
}

function normalizeBankAccountNumber(value: unknown) {
  const normalized = nullableText(value);

  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/[^\d-]/g, '');

  if (digits.length < 6) {
    throw new Error('เลขบัญชีธนาคารไม่ถูกต้อง');
  }

  return digits;
}

function normalizePrivatePath(value: unknown, userId: string) {
  const normalized = nullableText(value);

  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith(`${userId}/`) || normalized.includes('..')) {
    throw new Error('ไฟล์เอกสารไม่ถูกต้อง');
  }

  return normalized;
}

function normalizeAvatarUrl(value: unknown, userId: string) {
  const normalized = nullableText(value);

  if (!normalized) {
    return null;
  }

  if (!normalized.includes(`/storage/v1/object/public/avatars/${userId}/`)) {
    throw new Error('รูปโปรไฟล์ไม่ถูกต้อง');
  }

  return normalized;
}

export async function PATCH(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 500 });
    }

    const requestContext = await getAuthenticatedRequestContext(request);

    if (!requestContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requestContext.profile.status !== 'active') {
      return NextResponse.json({ error: 'บัญชีนี้ไม่พร้อมใช้งาน' }, { status: 403 });
    }

    const payload = (await request.json()) as ProfileUpdateBody;
    const updates: Record<string, string | null> = {};

    if ('full_name' in payload) {
      const nextFullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';

      if (!nextFullName) {
        return NextResponse.json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, { status: 400 });
      }

      updates.full_name = nextFullName;
    }

    if ('address' in payload) {
      updates.address = nullableText(payload.address);
    }

    if ('citizen_id' in payload) {
      updates.citizen_id = normalizeCitizenId(payload.citizen_id);
    }

    if ('avatar_url' in payload) {
      updates.avatar_url = normalizeAvatarUrl(payload.avatar_url, requestContext.profile.id);
    }

    if ('citizen_id_card_path' in payload) {
      updates.citizen_id_card_path = normalizePrivatePath(payload.citizen_id_card_path, requestContext.profile.id);
    }

    if ('bank_name' in payload) {
      updates.bank_name = nullableText(payload.bank_name);
    }

    if ('bank_account_name' in payload) {
      updates.bank_account_name = nullableText(payload.bank_account_name);
    }

    if ('bank_account_number' in payload) {
      updates.bank_account_number = normalizeBankAccountNumber(payload.bank_account_number);
    }

    if ('bank_book_path' in payload) {
      updates.bank_book_path = normalizePrivatePath(payload.bank_book_path, requestContext.profile.id);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลที่ต้องการอัปเดต' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', requestContext.profile.id)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'บันทึกข้อมูลไม่สำเร็จ' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
