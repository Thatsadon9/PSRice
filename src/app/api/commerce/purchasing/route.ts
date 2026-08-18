import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, canManageCommerce, getCommerceRequestContext, requireSupabaseAdmin } from '@/lib/commerceServer';

type PurchaseRecommendation = {
  supplier_id: string;
  product_id: string;
  product_unit_id: string;
  last_quantity: number;
  last_unit_cost: number;
  order_count: number;
  last_ordered_at: string;
};

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูใบสั่งซื้อ' }, { status: 403 });
    const branchId = new URL(request.url).searchParams.get('branch_id') || context.profile.branch_id;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูข้อมูลสาขานี้' }, { status: 403 });

    const admin = requireSupabaseAdmin();
    const [suppliersResult, ordersResult, historyResult] = await Promise.all([
      admin.from('suppliers').select('id, code, name, phone').eq('is_active', true).order('name'),
      admin.from('purchase_orders')
        .select('id, purchase_order_number, supplier_id, status, document_date, ordered_at, grand_total, note, suppliers(name), purchase_order_items(id, product_id, product_unit_id, quantity_ordered, quantity_received, unit_cost)')
        .eq('branch_id', branchId)
        .neq('status', 'cancelled')
        .order('document_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      admin.from('purchase_order_items')
        .select('product_id, product_unit_id, quantity_ordered, unit_cost, created_at, purchase_orders!inner(supplier_id, branch_id, status, document_date, ordered_at)')
        .eq('purchase_orders.branch_id', branchId)
        .neq('purchase_orders.status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const error = suppliersResult.error || ordersResult.error || historyResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const recommendationByKey = new Map<string, PurchaseRecommendation>();
    for (const row of historyResult.data || []) {
      const relation = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
      if (!relation?.supplier_id) continue;
      const key = `${relation.supplier_id}:${row.product_id}:${row.product_unit_id}`;
      const previous = recommendationByKey.get(key);
      if (previous) {
        previous.order_count += 1;
      } else {
        recommendationByKey.set(key, {
          supplier_id: relation.supplier_id,
          product_id: row.product_id,
          product_unit_id: row.product_unit_id,
          last_quantity: Number(row.quantity_ordered),
          last_unit_cost: Number(row.unit_cost),
          order_count: 1,
          last_ordered_at: relation.document_date || relation.ordered_at,
        });
      }
    }

    return NextResponse.json({
      suppliers: suppliersResult.data || [],
      purchaseOrders: ordersResult.data || [],
      recommendations: [...recommendationByKey.values()]
        .sort((left, right) => right.order_count - left.order_count || right.last_ordered_at.localeCompare(left.last_ordered_at)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load purchase orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างใบสั่งซื้อ' }, { status: 403 });
    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
    const documentDate = typeof body.document_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.document_date) ? body.document_date : null;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!branchId || !supplierId || !canAccessCommerceBranch(context.profile, branchId) || !items.length) {
      return NextResponse.json({ error: 'เลือกผู้ขายและเพิ่มสินค้าอย่างน้อยหนึ่งรายการ' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.rpc('commerce_create_purchase_order', {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_supplier_id: supplierId,
      p_document_date: documentDate,
      p_items: items,
      p_note: typeof body.note === 'string' ? body.note : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ purchaseOrder: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create purchase order' }, { status: 500 });
  }
}
