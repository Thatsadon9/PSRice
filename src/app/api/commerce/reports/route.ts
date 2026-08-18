import { NextResponse } from 'next/server';
import { buildCommerceReport } from '@/lib/commerceReportsServer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const result = await buildCommerceReport(request);
    return NextResponse.json(result.report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ' }, { status });
  }
}
