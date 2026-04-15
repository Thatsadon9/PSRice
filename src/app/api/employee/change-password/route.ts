import { NextResponse } from 'next/server';
import { getAuthenticatedRequestContext, supabaseAdmin, verifyUserPassword } from '@/lib/serverAuth';

interface ChangePasswordBody {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

export async function POST(request: Request) {
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

    const payload = (await request.json()) as ChangePasswordBody;
    const currentPassword = payload.current_password?.trim() || '';
    const newPassword = payload.new_password?.trim() || '';
    const confirmPassword = payload.confirm_password?.trim() || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: 'กรุณากรอกรหัสผ่านให้ครบทุกช่อง' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน' }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม' }, { status: 400 });
    }

    const passwordMatches = await verifyUserPassword(requestContext.profile.email, currentPassword);

    if (!passwordMatches) {
      return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(requestContext.profile.id, {
      password: newPassword,
    });

    if (error) {
      return NextResponse.json({ error: error.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
