'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import {
  CommerceBootstrap,
  CommercePaymentMethod,
  CommerceProduct,
  CommerceUnit,
  PosCartLine,
  PosPaymentLine,
  PAYMENT_METHOD_LABELS,
  formatBaht,
  toNumber,
} from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

const paymentMethods: CommercePaymentMethod[] = ['cash', 'qr', 'transfer', 'card', 'welfare', 'credit'];

type HeldSale = { id: string; held_number: string; items: Array<{ product_id: string; product_unit_id: string; quantity: number; discount_amount: number }>; note: string | null; created_at: string };
type SaleHistory = { id: string; receipt_number: string; grand_total: number | string; status: string; completed_at: string; items: Array<{ id: string; product_name_snapshot: string; unit_name_snapshot: string; quantity: number | string; line_total: number | string }> };
type PosCustomer = { id: string; full_name: string; phone: string | null; member_code: string | null; customer_type: string; points_balance: number | string };
type PosNoticeTone = 'error' | 'success' | 'info';
type PosNotice = { tone: PosNoticeTone; title: string; message: string };
type PosCatalogView = number | 'list';

const POS_CATALOG_VIEW_STORAGE_KEY = 'psrice.pos.catalog-view';
const POS_CATALOG_MAX_COLUMNS = 8;

function readPosCatalogView(value: string | null): PosCatalogView | null {
  if (value === 'list') return 'list';
  const normalized = value?.replace(/^grid-/, '');
  const columns = Number(normalized);
  return Number.isInteger(columns) && columns >= 1 && columns <= POS_CATALOG_MAX_COLUMNS ? columns : null;
}

function getPosCatalogViewLabel(view: PosCatalogView) {
  return view === 'list' ? 'แถว' : `${view} คอลัมน์`;
}

function getPosErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  const normalized = message.toLocaleLowerCase('en-US');
  if (normalized.includes('credit payment requires a customer')) return 'การชำระแบบเครดิตต้องเลือกลูกค้าก่อน';
  if (normalized.includes('payment total must equal') || (normalized.includes('payment') && normalized.includes('total') && normalized.includes('sale'))) return 'ยอดรับชำระต้องเท่ากับยอดขาย';
  return message;
}

function PosNoticePopup({ notice, onClose }: { notice: PosNotice | null; onClose: () => void }) {
  if (!notice) return null;
  const isError = notice.tone === 'error';
  const isSuccess = notice.tone === 'success';
  const Icon = isError ? AlertCircle : isSuccess ? CheckCircle2 : Info;
  const tone = isError
    ? { border: 'border-red-200', accent: 'bg-red-50 text-red-700', title: 'text-red-950', message: 'text-red-800' }
    : isSuccess
      ? { border: 'border-emerald-200', accent: 'bg-emerald-50 text-emerald-700', title: 'text-emerald-950', message: 'text-emerald-800' }
      : { border: 'border-sky-200', accent: 'bg-sky-50 text-sky-700', title: 'text-sky-950', message: 'text-sky-800' };

  return <div className="no-print fixed inset-x-0 top-4 z-[120] flex justify-center px-4 sm:left-auto sm:right-5 sm:w-[min(26rem,calc(100vw-2rem))] sm:justify-end sm:px-0" role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
    <div className={`flex w-full items-start gap-3 border bg-white p-4 shadow-2xl shadow-slate-900/15 ${tone.border}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone.accent}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 pt-0.5"><p className={`text-sm font-semibold ${tone.title}`}>{notice.title}</p><p className={`mt-1 text-sm leading-5 ${tone.message}`}>{notice.message}</p></div>
      <button type="button" onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="ปิดการแจ้งเตือน"><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  </div>;
}

async function commerceFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ไม่สามารถเชื่อมต่อระบบขายได้');
  return body;
}

export default function PosTerminal() {
  const [data, setData] = useState<CommerceBootstrap | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ทั้งหมด');
  const [catalogView, setCatalogView] = useState<PosCatalogView>(POS_CATALOG_MAX_COLUMNS);
  const [status, setStatus] = useState('กำลังโหลดข้อมูลสินค้า…');
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [registerName, setRegisterName] = useState('Counter 1');
  const [countedCash, setCountedCash] = useState('0');
  const [payments, setPayments] = useState<PosPaymentLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<{ receipt: string; total: number } | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [history, setHistory] = useState<SaleHistory[]>([]);
  const [panel, setPanel] = useState<'held' | 'history' | null>(null);
  const [returnSale, setReturnSale] = useState<SaleHistory | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnRefundMethod, setReturnRefundMethod] = useState<CommercePaymentMethod>('cash');
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrPayload, setQrPayload] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrReceiverLabel, setQrReceiverLabel] = useState('');
  const [qrPaymentConfirmed, setQrPaymentConfirmed] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [billDiscountMode, setBillDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [billDiscountValue, setBillDiscountValue] = useState('0');
  const [cashReceived, setCashReceived] = useState('0');
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<'cash_in' | 'cash_out' | 'expense' | 'drop'>('cash_in');
  const [cashMovementAmount, setCashMovementAmount] = useState('0');
  const [cashMovementReason, setCashMovementReason] = useState('');
  const [notice, setNotice] = useState<PosNotice | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogViewMenuRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem(POS_CATALOG_VIEW_STORAGE_KEY);
      const parsedView = readPosCatalogView(storedView);
      if (parsedView !== null) setCatalogView(parsedView);
    } catch {
      // localStorage may be unavailable in private browsing; the default view still works.
    }
  }, []);

  const updateCatalogView = (nextView: PosCatalogView) => {
    setCatalogView(nextView);
    try {
      window.localStorage.setItem(POS_CATALOG_VIEW_STORAGE_KEY, String(nextView));
    } catch {
      // The display preference is optional; do not block selling when storage is unavailable.
    }
  };

  const [catalogViewMenuOpen, setCatalogViewMenuOpen] = useState(false);

  useEffect(() => {
    if (!catalogViewMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!catalogViewMenuRef.current?.contains(event.target as Node)) setCatalogViewMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCatalogViewMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [catalogViewMenuOpen]);

  const showNotice = useCallback((message: string, tone: PosNoticeTone = 'error') => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    const isError = tone === 'error';
    setNotice({
      tone,
      title: isError ? 'ตรวจสอบรายการ' : tone === 'success' ? 'ดำเนินการสำเร็จ' : 'แจ้งเตือนจาก POS',
      message: isError ? getPosErrorMessage(message) : message,
    });
    noticeTimerRef.current = setTimeout(() => setNotice(null), isError ? 6500 : 4000);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const load = useCallback(async (branchId?: string, customerType = 'retail') => {
    try {
      setIsCatalogLoading(true);
      setLoadError('');
      setStatus('กำลังโหลดข้อมูลสินค้า…');
      const query = `?${new URLSearchParams({ ...(branchId ? { branch_id: branchId } : {}), customer_type: customerType, catalog: 'pos' }).toString()}`;
      const next = await commerceFetch(`/api/commerce/bootstrap${query}`) as CommerceBootstrap;
      const customerResult = await commerceFetch('/api/commerce/customers') as { customers: PosCustomer[] };
      setData(next);
      setCustomers(customerResult.customers);
      setRegisterName(next.posSettings.defaultRegisterName);
      setStatus(next.products.length ? 'พร้อมขาย' : 'ยังไม่มีสินค้า — เพิ่มสินค้าและรับสต๊อกที่หน้า “สินค้าและบริการ”');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูล POS ได้';
      setLoadError(message);
      setStatus(message);
    } finally { setIsCatalogLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const qrPayment = payments.find((payment) => payment.method === 'qr');
  const qrAmount = qrPayment?.amount || 0;
  useEffect(() => {
    if (!qrOpen || !data || qrAmount <= 0) return;
    let cancelled = false;
    setQrPayload(''); setQrImage(''); setQrError('');
    void commerceFetch(`/api/commerce/promptpay-qr?${new URLSearchParams({ branch_id: data.branchId, amount: String(qrAmount) }).toString()}`)
      .then((result: { payload: string; receiverLabel: string }) => {
        if (cancelled) return;
        setQrPayload(result.payload); setQrReceiverLabel(result.receiverLabel);
      })
      .catch((error) => { if (!cancelled) setQrError(error instanceof Error ? error.message : 'สร้าง QR ไม่สำเร็จ'); });
    return () => { cancelled = true; };
  }, [data, qrAmount, qrOpen]);

  useEffect(() => {
    if (!qrPayload) return;
    let cancelled = false;
    void QRCode.toDataURL(qrPayload, { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((image) => { if (!cancelled) setQrImage(image); })
      .catch(() => { if (!cancelled) setQrError('ไม่สามารถแสดงภาพ QR ได้'); });
    return () => { cancelled = true; };
  }, [qrPayload]);

  const loadHeldSales = async () => {
    if (!data) return;
    try {
      const response = await commerceFetch(`/api/commerce/held-sales?branch_id=${encodeURIComponent(data.branchId)}`) as { heldSales: HeldSale[] };
      setHeldSales(response.heldSales);
      setPanel('held');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
  };

  const loadHistory = async () => {
    if (!data) return;
    try {
      const response = await commerceFetch(`/api/commerce/sales?branch_id=${encodeURIComponent(data.branchId)}`) as { sales: SaleHistory[] };
      setHistory(response.sales);
      setPanel('history');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
  };

  const lineSubtotal = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discountAmount, 0), [cart]);
  const billDiscountAmount = Math.min(lineSubtotal, billDiscountMode === 'percent' ? lineSubtotal * Math.min(100, Math.max(0, toNumber(billDiscountValue))) / 100 : Math.max(0, toNumber(billDiscountValue)));
  const total = Math.max(0, Math.round((lineSubtotal - billDiscountAmount) * 100) / 100);
  const paid = useMemo(() => payments.reduce((sum, line) => sum + line.amount, 0), [payments]);
  const due = Math.max(0, total - paid);
  const totalBaseQuantity = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.conversionToBase, 0), [cart]);
  const changeAmount = Math.max(0, toNumber(cashReceived) - (payments.find((payment) => payment.method === 'cash')?.amount || 0));
  const categories = useMemo(() => ['ทั้งหมด', ...Array.from(new Set(data?.products.map((product) => product.categoryName).filter((name): name is string => Boolean(name)) || []))], [data]);
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (data?.products || []).filter((product) => {
      const categoryMatch = category === 'ทั้งหมด' || product.categoryName === category;
      const unitText = product.units.map((unit) => `${unit.name} ${unit.code} ${unit.barcode || ''}`).join(' ');
      const text = `${product.name} ${product.brand || ''} ${product.sku} ${product.barcodes.join(' ')} ${unitText}`.toLocaleLowerCase();
      return categoryMatch && (!query || text.includes(query));
    });
  }, [category, data, search]);
  const visibleProductUnits = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return visibleProducts.flatMap((product) => product.units
      .filter((unit) => unit.canSell && (data?.posSettings.showOutOfStock || unit.available > 0))
      .filter((unit) => !query || `${product.name} ${product.brand || ''} ${product.sku} ${product.categoryName || ''} ${unit.name} ${unit.code} ${unit.barcode || ''}`.toLocaleLowerCase().includes(query))
      .map((unit) => ({ product, unit })));
  }, [data, search, visibleProducts]);

  const addProduct = (productId: string, requestedUnitId?: string) => {
    const product = data?.products.find((item) => item.id === productId);
    if (!product) return;
    const requestedUnit = requestedUnitId ? product.units.find((item) => item.id === requestedUnitId) : null;
    const unit = requestedUnitId
      ? requestedUnit && requestedUnit.canSell && requestedUnit.available > 0 ? requestedUnit : null
      : product.units.find((item) => item.isDefault && item.canSell && item.available > 0)
        || product.units.find((item) => item.canSell && item.available > 0);
    if (!unit) {
      showNotice(`สต๊อก ${product.name} ไม่เพียงพอสำหรับขาย`);
      return;
    }
    const key = `${product.id}:${unit.id}`;
    setCart((current) => {
      const found = current.find((line) => line.key === key);
      if (found) {
        if (found.quantity + 1 > found.available) {
          showNotice(`สต๊อก ${product.name} มีไม่พอ`);
          return current;
        }
        return current.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        key,
        productId: product.id,
        productUnitId: unit.id,
        productName: product.name,
        unitName: unit.name,
        quantity: 1,
        unitPrice: unit.salePrice,
        priceReason: unit.priceReason,
        conversionToBase: unit.conversionToBase,
        available: unit.available,
        discountAmount: 0,
      }];
    });
    setStatus('พร้อมขาย');
  };

  const changeUnit = (key: string, nextUnitId: string) => {
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const product = data?.products.find((item) => item.id === line.productId);
      const unit = product?.units.find((item) => item.id === nextUnitId);
      if (!product || !unit || !unit.canSell || line.quantity > unit.available) {
        showNotice('หน่วยขายที่เลือกมีจำนวนเกินสต๊อกพร้อมขาย');
        return [line];
      }
      const nextKey = `${product.id}:${unit.id}`;
      return [{ ...line, key: nextKey, productUnitId: unit.id, unitName: unit.name, unitPrice: unit.salePrice, priceReason: unit.priceReason, conversionToBase: unit.conversionToBase, available: unit.available }];
    }));
    setPayments([]);
  };

  const changeQuantity = (key: string, difference: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const next = Math.round((line.quantity + difference) * 1000) / 1000;
      if (next <= 0) return [];
      if (next > line.available) {
        showNotice(`สต๊อก ${line.productName} มี ${line.available.toLocaleString('th-TH')} ${line.unitName}`);
        return [line];
      }
      return [{ ...line, quantity: next }];
    }));
  };

  const selectPayment = (method: CommercePaymentMethod) => {
    if (total <= 0) return;
    if (method === 'qr' && !data?.posSettings.promptpayEnabled) {
      showNotice('สาขานี้ยังไม่ได้ตั้งค่า PromptPay QR');
      return;
    }
    const nextAmount = Math.max(0, total - payments.reduce((sum, line) => sum + line.amount, 0)) || total;
    setPayments((current) => {
      const remaining = Math.max(0, total - current.reduce((sum, line) => sum + line.amount, 0));
      const existing = current.find((line) => line.method === method);
      if (existing) return current.map((line) => line.method === method ? { ...line, amount: remaining || total } : line);
      return [...current, { method, amount: remaining || total }];
    });
    if (method === 'cash') setCashReceived(String(nextAmount));
    if (method === 'qr') { setQrPaymentConfirmed(false); setQrOpen(true); showNotice(`สร้าง PromptPay QR ${formatBaht(nextAmount)}`, 'info'); }
  };

  const openRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    try {
      setIsSubmitting(true);
      await commerceFetch('/api/commerce/register', { method: 'POST', body: JSON.stringify({ action: 'open', branch_id: data.branchId, register_name: registerName, opening_float: toNumber(openingFloat) }) });
      setOpening(false);
      await load(data.branchId);
      showNotice('เปิดกะ POS เรียบร้อยแล้ว', 'success');
    } catch (error) {
      showNotice(getPosErrorMessage(error));
    } finally { setIsSubmitting(false); }
  };

  const closeRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.registerSession) return;
    try {
      setIsSubmitting(true);
      const response = await commerceFetch('/api/commerce/register', { method: 'POST', body: JSON.stringify({ action: 'close', session_id: data.registerSession.id, counted_cash: toNumber(countedCash) }) });
      setClosing(false);
      setCart([]);
      setPayments([]);
      await load(data.branchId);
      showNotice(`ปิดกะแล้ว ส่วนต่างเงินสด ${formatBaht(toNumber(response.variance))}`, 'success');
    } catch (error) {
      showNotice(getPosErrorMessage(error));
    } finally { setIsSubmitting(false); }
  };

  const saveCashMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.registerSession) return;
    try {
      setIsSubmitting(true);
      const response = await commerceFetch('/api/commerce/cash-movements', { method: 'POST', body: JSON.stringify({ session_id: data.registerSession.id, movement_type: cashMovementType, amount: toNumber(cashMovementAmount), reason: cashMovementReason }) });
      setCashMovementOpen(false); setCashMovementAmount('0'); setCashMovementReason('');
      await load(data.branchId); showNotice(`บันทึกเงินระหว่างกะแล้ว ยอดเงินสดตามระบบ ${formatBaht(toNumber(response.expected_cash))}`, 'success');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };

  const completeSale = async (qrAlreadyConfirmed = false) => {
    if (!data) return;
    if (!data.registerSession && data.posSettings.requireOpenRegister) { setOpening(true); return; }
    if (!cart.length) { showNotice('เพิ่มสินค้าเข้ารายการก่อนชำระเงิน'); return; }
    if (Math.abs(total - paid) > 0.01) { showNotice('ยอดรับชำระต้องเท่ากับยอดขาย'); return; }
    if (payments.some((payment) => payment.method === 'qr') && !qrAlreadyConfirmed && !qrPaymentConfirmed) { setQrOpen(true); showNotice('ตรวจสอบเงินเข้าในแอปธนาคารก่อนยืนยันรับชำระ', 'info'); return; }
    let allocatedDiscount = 0;
    const saleItems = cart.map((line, index) => {
      const lineNet = Math.max(0, line.quantity * line.unitPrice - line.discountAmount);
      const allocatedBillDiscount = index === cart.length - 1
        ? Math.max(0, Math.round((billDiscountAmount - allocatedDiscount) * 100) / 100)
        : (lineSubtotal > 0 ? Math.round((billDiscountAmount * lineNet / lineSubtotal) * 100) / 100 : 0);
      allocatedDiscount += allocatedBillDiscount;
      return { product_id: line.productId, product_unit_id: line.productUnitId, quantity: line.quantity, discount_amount: Math.min(line.quantity * line.unitPrice, line.discountAmount + allocatedBillDiscount) };
    });
    try {
      setIsSubmitting(true);
      const result = await commerceFetch('/api/commerce/sales', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: data.branchId,
          register_session_id: data.registerSession?.id || null,
          customer_id: customerId || null,
          items: saleItems,
          payments,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      setCompletedReceipt({ receipt: result.result.receipt_number, total: toNumber(result.result.grand_total) });
      setCart([]);
      setPayments([]);
      setBillDiscountValue('0');
      setCashReceived('0');
      setQrPaymentConfirmed(false);
      await load(data.branchId);
      setStatus('บันทึกการขายและตัดสต๊อกเรียบร้อยแล้ว');
    } catch (error) {
      showNotice(getPosErrorMessage(error));
    } finally { setIsSubmitting(false); }
  };

  const holdSale = async () => {
    if (!data?.registerSession) { setOpening(true); return; }
    if (!cart.length) { showNotice('เพิ่มสินค้าเข้ารายการก่อนพักบิล'); return; }
    try {
      setIsSubmitting(true);
      const response = await commerceFetch('/api/commerce/held-sales', { method: 'POST', body: JSON.stringify({ branch_id: data.branchId, register_session_id: data.registerSession.id, items: cart.map((line) => ({ product_id: line.productId, product_unit_id: line.productUnitId, quantity: line.quantity, discount_amount: line.discountAmount })) }) }) as { heldSale: HeldSale };
      setHeldSales((current) => [response.heldSale, ...current]);
      setCart([]);
      setPayments([]);
      showNotice(`พักบิล ${response.heldSale.held_number} แล้ว`, 'success');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };

  const recallHeldSale = async (heldSale: HeldSale) => {
    if (!data) return;
    const restored = heldSale.items.flatMap((item) => {
      const product = data.products.find((candidate) => candidate.id === item.product_id);
      const unit = product?.units.find((candidate) => candidate.id === item.product_unit_id);
      if (!product || !unit) return [];
      return [{ key: `${product.id}:${unit.id}`, productId: product.id, productUnitId: unit.id, productName: product.name, unitName: unit.name, quantity: toNumber(item.quantity), unitPrice: unit.salePrice, priceReason: unit.priceReason, conversionToBase: unit.conversionToBase, available: unit.available, discountAmount: toNumber(item.discount_amount) }];
    });
    if (!restored.length || restored.length !== heldSale.items.length) { showNotice('สินค้าบางรายการไม่พร้อมเรียกกลับ กรุณาตรวจสอบแคตตาล็อก'); return; }
    try {
      setIsSubmitting(true);
      await commerceFetch('/api/commerce/held-sales', { method: 'POST', body: JSON.stringify({ action: 'recall', held_sale_id: heldSale.id }) });
      setCart(restored);
      setPayments([]);
      setHeldSales((current) => current.filter((item) => item.id !== heldSale.id));
      setPanel(null);
      showNotice(`เรียกบิล ${heldSale.held_number} กลับแล้ว`, 'success');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };

  const startReturn = (sale: SaleHistory) => {
    if (!data?.registerSession) { setOpening(true); return; }
    setReturnSale(sale);
    setReturnQuantities(Object.fromEntries(sale.items.map((item) => [item.id, toNumber(item.quantity)])));
    setReturnReason('');
    setReturnRefundMethod('cash');
    setPanel(null);
  };

  const returnTotal = useMemo(() => returnSale?.items.reduce((sum, item) => sum + Math.round((toNumber(item.line_total) / toNumber(item.quantity)) * (returnQuantities[item.id] || 0) * 100) / 100, 0) || 0, [returnQuantities, returnSale]);

  const completeReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.registerSession || !returnSale) return;
    const items = returnSale.items.filter((item) => (returnQuantities[item.id] || 0) > 0).map((item) => ({ original_sale_item_id: item.id, quantity: returnQuantities[item.id] }));
    if (!items.length) { showNotice('เลือกรายการที่จะคืนอย่างน้อยหนึ่งรายการ'); return; }
    try {
      setIsSubmitting(true);
      const result = await commerceFetch('/api/commerce/returns', { method: 'POST', body: JSON.stringify({ branch_id: data.branchId, register_session_id: data.registerSession.id, original_sale_id: returnSale.id, items, refunds: [{ method: returnRefundMethod, amount: returnTotal }], reason: returnReason, idempotency_key: crypto.randomUUID() }) });
      setReturnSale(null);
      await load(data.branchId);
      showNotice(`คืนสินค้า ${result.result.return_number} และคืนเงิน ${formatBaht(toNumber(result.result.refund_total))} แล้ว`, 'success');
    } catch (error) { showNotice(getPosErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };

  const voidSale = async (sale: SaleHistory) => {
    const reason = window.prompt(`ระบุเหตุผลยกเลิกบิล ${sale.receipt_number}`)?.trim();
    if (!reason || !window.confirm(`ยืนยันยกเลิกบิล ${sale.receipt_number}\nผลรายการ: คืนสต๊อก แต้ม เครดิต และคอมมิชชัน`)) return;
    const managerPin = window.prompt('Manager PIN (เว้นว่างได้หากบัญชีนี้มีสิทธิ์ยกเลิกบิล)')?.trim() || '';
    try {
      setIsSubmitting(true);
      await commerceFetch('/api/commerce/sales', { method: 'PATCH', body: JSON.stringify({ action: 'void', sale_id: sale.id, reason, manager_pin: managerPin }) });
      showNotice(`ยกเลิกบิล ${sale.receipt_number} แล้ว`, 'success');
      await loadHistory();
      await load(data?.branchId);
    } catch (error) { showNotice(getPosErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F9') {
        event.preventDefault();
        void completeSale();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'Enter' && search.trim()) {
        const scanned = search.trim().toLocaleLowerCase();
        const product = data?.products.find((item) => item.sku.toLocaleLowerCase() === scanned || item.barcodes.some((barcode) => barcode.toLocaleLowerCase() === scanned));
        if (product) {
          const unit = product.units.find((item) => item.barcode?.toLocaleLowerCase() === scanned);
          event.preventDefault(); addProduct(product.id, unit?.id); setSearch('');
        }
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
        searchRef.current?.focus();
        setSearch((current) => current + event.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!data) {
    return <CommerceShell section="pos"><main className="mx-auto max-w-[1680px] px-3 py-3 sm:px-5">{loadError ? <PosLoadError message={loadError} onRetry={() => void load()} /> : <PosLoadingWorkspace />}</main></CommerceShell>;
  }

  const needsOpeningRegister = data.posSettings.requireOpenRegister && !data.registerSession;

  return <CommerceShell section="pos">
    <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 pb-3 text-xs text-slate-500">
        <span className={status === 'พร้อมขาย' ? 'font-medium text-primary-800' : ''}>{status}</span>
        {data && <><Link href="/backoffice/pos-settings" className="font-medium text-slate-500 hover:text-primary-800">ตั้งค่า POS</Link><span className="ml-auto hidden text-slate-400 sm:inline">F9 ชำระเงิน · F11 เต็มจอ</span>
        {data.registerSession ? <div className="flex items-center"><button type="button" onClick={() => setCashMovementOpen(true)} className="h-9 border border-r-0 border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">เงินในกะ</button><button type="button" onClick={() => { setCountedCash(String(data.registerSession?.expectedCash || 0)); setClosing(true); }} className="inline-flex h-9 items-center border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"><span>กะ: {data.registerSession.registerName}</span><span className="ml-2 border-l border-slate-300 pl-2 text-slate-900">ปิดกะ</span></button></div> : needsOpeningRegister ? <button type="button" onClick={() => setOpening(true)} className="ml-auto inline-flex h-9 items-center bg-amber-500 px-3 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400">เปิดกะเพื่อเริ่มขาย</button> : <span className="font-medium text-primary-800">พร้อมรับชำระ</span>}</>}
      </div>

      <div className="grid min-h-[calc(100dvh-8.25rem)] gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="flex min-h-0 flex-col border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; const scanned = search.trim().toLocaleLowerCase(); const product = data.products.find((item) => item.sku.toLocaleLowerCase() === scanned || item.barcodes.some((barcode) => barcode.toLocaleLowerCase() === scanned)); if (product) { const unit = product.units.find((item) => item.barcode?.toLocaleLowerCase() === scanned); event.preventDefault(); addProduct(product.id, unit?.id); setSearch(''); } }} autoFocus placeholder="ยิงบาร์โค้ด หรือค้นหาชื่อ / SKU / หมวด" className="h-10 min-w-[13rem] flex-1 basis-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 sm:basis-auto" />
            <span className="text-xs text-slate-400">{visibleProductUnits.length} รายการ</span>
            <PosCatalogViewSwitcher containerRef={catalogViewMenuRef} value={catalogView} open={catalogViewMenuOpen} onToggle={() => setCatalogViewMenuOpen((current) => !current)} onChange={updateCatalogView} />
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2">
            {categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium ${category === item ? 'border-primary-800 text-primary-800' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{item}</button>)}
          </div>
          <div className={`relative app-scrollbar flex-1 overflow-y-auto ${catalogView === 'list' ? 'bg-slate-50/60' : ''}`}>
            {catalogView === 'list' ? <div className="divide-y divide-slate-200">{visibleProductUnits.map(({ product, unit }) => <PosCatalogItem key={`${product.id}:${unit.id}`} product={product} unit={unit} view={catalogView} onAdd={addProduct} />)}</div> : <div className="grid grid-cols-2 content-start sm:grid-cols-[repeat(var(--pos-columns),minmax(0,1fr))]" style={{ '--pos-columns': String(catalogView) } as unknown as CSSProperties}>{visibleProductUnits.map(({ product, unit }) => <PosCatalogItem key={`${product.id}:${unit.id}`} product={product} unit={unit} view={catalogView} onAdd={addProduct} />)}</div>}
            {!isCatalogLoading && !visibleProductUnits.length && <div className="grid min-h-48 place-items-center p-6 text-center text-sm text-slate-500">ไม่พบหน่วยขายในรายการนี้</div>}
            {isCatalogLoading && <div className="absolute inset-0 grid place-items-center bg-white/80 backdrop-blur-[1px]"><div className="flex items-center gap-3 border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-800" />กำลังอัปเดตสินค้าและสต๊อก…</div></div>}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3"><div className="flex items-center justify-between"><h1 className="text-sm font-semibold">รายการขาย</h1><div className="flex items-center gap-3"><button type="button" onClick={() => void loadHeldSales()} className="text-xs text-slate-500 hover:text-primary-800">บิลพัก</button><button type="button" onClick={() => void loadHistory()} className="text-xs text-slate-500 hover:text-primary-800">ประวัติ</button><button type="button" onClick={() => { setCart([]); setPayments([]); setCustomerId(''); void load(data?.branchId, 'retail'); }} className="text-xs text-slate-500 hover:text-red-700">ล้าง</button></div></div><Select value={customerId} onChange={(event) => { const nextId = event.target.value; const customerType = customers.find((customer) => customer.id === nextId)?.customer_type || 'retail'; setCustomerId(nextId); setCart([]); setPayments([]); void load(data?.branchId, customerType); }} className="mt-2 h-8 w-full border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-primary-700"><option value="">ลูกค้าทั่วไป (ไม่รับแต้ม)</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ''}{customer.member_code ? ` · ${customer.member_code}` : ''}</option>)}</Select></div>
          <div className="app-scrollbar flex-1 overflow-y-auto">
            {cart.map((line) => <div key={line.key} className="border-b border-slate-100 px-4 py-3">
              <div className="flex gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.productName}</p><p className="text-[11px] text-slate-500">{formatBaht(line.unitPrice)} / {line.unitName} · {line.priceReason}</p></div><p className="text-sm font-medium">{formatBaht(line.quantity * line.unitPrice - line.discountAmount)}</p></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><div className="flex border border-slate-300"><button type="button" onClick={() => changeQuantity(line.key, -1)} className="h-7 w-7 text-slate-500 hover:bg-slate-100">−</button><span className="grid min-w-9 place-items-center border-x border-slate-300 px-1 text-xs">{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.key, 1)} className="h-7 w-7 text-slate-500 hover:bg-slate-100">+</button></div><Select value={line.productUnitId} onChange={(event) => changeUnit(line.key, event.target.value)} className="h-7 max-w-28 border border-slate-300 bg-white px-1 text-[11px]">{data.products.find((product) => product.id === line.productId)?.units.filter((unit) => unit.canSell).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.available.toLocaleString('th-TH')}</option>)}</Select><label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">ลด<input type="number" min="0" max={line.quantity * line.unitPrice} step="0.01" value={line.discountAmount} onChange={(event) => { const value = Math.min(line.quantity * line.unitPrice, Math.max(0, toNumber(event.target.value))); setCart((current) => current.map((item) => item.key === line.key ? { ...item, discountAmount: value } : item)); setPayments([]); }} className="h-7 w-16 border border-slate-300 px-1 text-right text-xs" /></label></div>
            </div>)}
            {!cart.length && <div className="grid min-h-48 place-items-center px-8 text-center text-sm text-slate-400">เลือกสินค้าเพื่อเริ่มรายการ</div>}
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>{cart.length} รายการ · {totalBaseQuantity.toLocaleString('th-TH')} หน่วยฐาน</span>{billDiscountAmount > 0 ? <span className="text-amber-700">ส่วนลด {formatBaht(billDiscountAmount)}</span> : null}</div>
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_7.5rem_6.5rem] gap-1"><label className="sr-only">ส่วนลดท้ายบิล</label><span className="self-center text-xs text-slate-500">ส่วนลดท้ายบิล</span><Select value={billDiscountMode} onChange={(event) => { setBillDiscountMode(event.target.value as 'amount' | 'percent'); setPayments([]); }} className="h-8 w-full border border-slate-300 bg-white px-1 text-xs"><option value="amount">บาท</option><option value="percent">เปอร์เซ็นต์</option></Select><input type="number" min="0" step="0.01" value={billDiscountValue} onChange={(event) => { setBillDiscountValue(event.target.value); setPayments([]); }} className="h-8 min-w-0 border border-slate-300 px-2 text-right text-sm" /></div>
            <div className="flex items-end justify-between"><span className="text-sm text-slate-600">รวมสุทธิ</span><strong className="text-2xl tracking-tight">{formatBaht(total)}</strong></div>
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden border border-slate-300 bg-slate-300">
            {(data?.posSettings.enabledPaymentMethods || paymentMethods).map((method) => <button type="button" key={method} onClick={() => selectPayment(method)} className={`bg-white px-1 py-2 text-xs transition hover:bg-slate-50 ${payments.some((payment) => payment.method === method) ? 'font-semibold text-primary-800' : 'text-slate-600'}`}>{PAYMENT_METHOD_LABELS[method]}</button>)}
            </div>
            {payments.map((payment, index) => <div className="mt-2 flex items-center gap-2" key={payment.method}><span className="w-14 text-xs text-slate-500">{PAYMENT_METHOD_LABELS[payment.method]}</span><input type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => { if (payment.method === 'qr') setQrPaymentConfirmed(false); setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: toNumber(event.target.value) } : item)); }} className="h-8 min-w-0 flex-1 border border-slate-300 px-2 text-right text-sm outline-none focus:border-primary-700" /><button type="button" onClick={() => { if (payment.method === 'qr') { setQrOpen(false); setQrPaymentConfirmed(false); } setPayments((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} className="text-xs text-slate-400 hover:text-red-700">ลบ</button></div>)}
            {payments.some((payment) => payment.method === 'cash') ? <div className="mt-2 border-t border-dashed border-slate-200 pt-2"><div className="flex items-center gap-2"><span className="w-14 text-xs text-slate-500">รับเงินสด</span><input type="number" min="0" step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} className="h-8 min-w-0 flex-1 border border-slate-300 px-2 text-right text-sm" /><span className="text-xs font-semibold text-primary-800">ทอน {formatBaht(changeAmount)}</span></div><div className="mt-2 grid grid-cols-4 gap-1">{[100, 500, 1000].map((amount) => <button key={amount} type="button" onClick={() => setCashReceived(String(amount))} className="h-7 border border-slate-200 text-xs text-slate-600">{amount}</button>)}<button type="button" onClick={() => setCashReceived(String(Math.ceil((payments.find((payment) => payment.method === 'cash')?.amount || 0) / 100) * 100))} className="h-7 border border-slate-200 text-xs text-slate-600">พอดีร้อย</button></div></div> : null}
            {payments.length > 0 && <div className="mt-3 flex justify-between border-t border-dashed border-slate-300 pt-2 text-xs"><span className="text-slate-500">คงเหลือ</span><span className={due > 0.01 ? 'font-semibold text-amber-700' : 'font-semibold text-primary-800'}>{formatBaht(due)}</span></div>}
            <div className="mt-4 grid grid-cols-[7rem_1fr] gap-2"><button type="button" disabled={isSubmitting || !cart.length} onClick={holdSale} className="h-11 border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">พักบิล</button><button type="button" disabled={isSubmitting || !cart.length || needsOpeningRegister} onClick={() => void completeSale()} className="h-11 bg-primary-800 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">{data?.registerSession ? isSubmitting ? 'กำลังบันทึก…' : `รับชำระ ${formatBaht(total)} · F9` : data?.posSettings.requireOpenRegister ? 'เปิดกะก่อนเริ่มขาย' : `รับชำระ ${formatBaht(total)} · F9`}</button></div>
          </div>
        </aside>
      </div>
    </div>

    {opening && <div className="no-print fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={openRegister} className="w-full max-w-sm bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">เปิดกะ POS</h2><p className="mt-1 text-xs text-slate-500">ระบุเงินทอนตั้งต้นก่อนเริ่มรับชำระ</p></div><div className="space-y-4 p-5"><label className="block text-xs font-medium text-slate-700">ชื่อจุดขาย<input value={registerName} onChange={(event) => setRegisterName(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" required /></label><label className="block text-xs font-medium text-slate-700">เงินทอนตั้งต้น<input type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" required /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setOpening(false)} className="h-9 px-3 text-sm text-slate-600">ยกเลิก</button><button disabled={isSubmitting} className="h-9 bg-primary-800 px-4 text-sm font-medium text-white disabled:bg-slate-300">{isSubmitting ? 'กำลังบันทึก…' : 'เปิดกะ'}</button></div></form></div>}
    {closing && data?.registerSession && <div className="no-print fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={closeRegister} className="w-full max-w-sm bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">ปิดกะ POS</h2><p className="mt-1 text-xs text-slate-500">ยอดเงินสดตามระบบ {formatBaht(data.registerSession.expectedCash)}</p></div><div className="space-y-4 p-5"><label className="block text-xs font-medium text-slate-700">เงินสดที่นับได้<input type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" required /></label><p className="text-xs text-slate-500">ส่วนต่าง {formatBaht(toNumber(countedCash) - data.registerSession.expectedCash)}</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setClosing(false)} className="h-9 px-3 text-sm text-slate-600">ยกเลิก</button><button disabled={isSubmitting} className="h-9 bg-slate-900 px-4 text-sm font-medium text-white disabled:bg-slate-300">{isSubmitting ? 'กำลังบันทึก…' : 'ยืนยันปิดกะ'}</button></div></form></div>}
    {cashMovementOpen && data?.registerSession ? <div className="no-print fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={saveCashMovement} className="w-full max-w-sm bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">เงินระหว่างกะ</h2><p className="mt-1 text-xs text-slate-500">ยอดเงินสดตามระบบ {formatBaht(data.registerSession.expectedCash)}</p></div><div className="space-y-4 p-5"><label className="block text-xs font-medium">ประเภทรายการ<Select value={cashMovementType} onChange={(event) => setCashMovementType(event.target.value as typeof cashMovementType)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm"><option value="cash_in">เติมเงินเข้าลิ้นชัก</option><option value="cash_out">ถอนเงิน</option><option value="expense">ค่าใช้จ่ายหน้าร้าน</option><option value="drop">นำส่งเงิน</option></Select></label><label className="block text-xs font-medium">จำนวนเงิน<input required min="0.01" step="0.01" type="number" value={cashMovementAmount} onChange={(event) => setCashMovementAmount(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" /></label><label className="block text-xs font-medium">เหตุผล<input required value={cashMovementReason} onChange={(event) => setCashMovementReason(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" placeholder="ระบุเหตุผลทุกครั้ง" /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setCashMovementOpen(false)} className="h-9 px-3 text-sm text-slate-600">ยกเลิก</button><button disabled={isSubmitting} className="h-9 bg-primary-800 px-4 text-sm font-medium text-white disabled:bg-slate-300">บันทึก</button></div></form></div> : null}
    {qrOpen && <div className="no-print fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4"><section className="w-full max-w-sm bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">สแกน PromptPay เพื่อชำระเงิน</h2><p className="mt-1 text-xs text-slate-500">QR นี้ผูกยอด {formatBaht(qrAmount)}</p></div><button type="button" onClick={() => setQrOpen(false)} className="text-sm text-slate-500">ปิด</button></div><div className="p-5 text-center">{qrImage ? <Image src={qrImage} alt={`PromptPay QR ยอด ${formatBaht(qrAmount)}`} width={256} height={256} unoptimized className="mx-auto h-64 w-64" /> : <div className="grid h-64 place-items-center text-sm text-slate-500">{qrError || 'กำลังสร้าง QR…'}</div>}<p className="mt-4 text-2xl font-semibold tabular-nums">{formatBaht(qrAmount)}</p><p className="mt-1 text-xs text-slate-500">ผู้รับ: {qrReceiverLabel || data?.posSettings.promptpayDisplayName || 'กำลังโหลด'}</p><p className="mt-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-900">ตรวจยอดและชื่อผู้รับในแอปธนาคารก่อนกดปุ่มด้านล่าง ระบบไม่สามารถตรวจเงินเข้าอัตโนมัติได้</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setQrOpen(false)} className="h-9 px-3 text-sm text-slate-600">รอการชำระ</button><button type="button" disabled={isSubmitting || !qrImage || Boolean(qrError)} onClick={() => { setQrPaymentConfirmed(true); setQrOpen(false); void completeSale(true); }} className="h-9 bg-primary-800 px-4 text-sm font-medium text-white disabled:bg-slate-300">ตรวจเงินเข้าแล้ว · บันทึกขาย</button></div></section></div>}
    {completedReceipt && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><div className="w-full max-w-sm bg-white shadow-2xl"><div className="p-6 text-center"><p className="text-sm text-primary-800">บันทึกการขายแล้ว</p><h2 className="mt-2 text-2xl font-semibold">{completedReceipt.receipt}</h2><p className="mt-2 text-sm text-slate-600">ยอดสุทธิ {formatBaht(completedReceipt.total)}</p>{data?.posSettings.receiptFooter && <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">{data.posSettings.receiptFooter}</p>}</div><div className="no-print flex justify-center gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => window.print()} className="h-9 border border-slate-300 px-4 text-sm">พิมพ์ใบเสร็จ</button><button type="button" onClick={() => setCompletedReceipt(null)} className="h-9 bg-primary-800 px-4 text-sm font-medium text-white">ทำรายการต่อ</button></div></div></div>}
    {panel && <div className="no-print fixed inset-0 z-40 flex justify-end bg-slate-950/30"><section className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">{panel === 'held' ? 'บิลพัก' : 'รายการขายล่าสุด'}</h2><button type="button" onClick={() => setPanel(null)} className="text-sm text-slate-500">ปิด</button></div><div className="app-scrollbar flex-1 overflow-y-auto">{panel === 'held' ? heldSales.map((sale) => <div key={sale.id} className="border-b border-slate-100 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{sale.held_number}</p><p className="mt-1 text-xs text-slate-500">{sale.items.length} รายการ · {new Date(sale.created_at).toLocaleString('th-TH')}</p></div><button type="button" disabled={isSubmitting} onClick={() => void recallHeldSale(sale)} className="h-8 border border-primary-700 px-3 text-xs font-medium text-primary-800">เรียกบิล</button></div></div>) : history.map((sale) => <div key={sale.id} className="border-b border-slate-100 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{sale.receipt_number}</p><p className="mt-1 text-xs text-slate-500">{new Date(sale.completed_at).toLocaleString('th-TH')} · {sale.status}</p><p className="mt-1 text-sm font-medium">{formatBaht(toNumber(sale.grand_total))}</p></div>{['completed', 'partially_returned'].includes(sale.status) && <div className="flex shrink-0 flex-col gap-2"><button type="button" onClick={() => startReturn(sale)} className="h-8 border border-slate-300 px-3 text-xs text-slate-700">คืนสินค้า</button>{sale.status === 'completed' ? <button type="button" disabled={isSubmitting} onClick={() => void voidSale(sale)} className="h-8 border border-red-200 px-3 text-xs text-red-700">ยกเลิกบิล</button> : null}</div>}</div></div>)}{(panel === 'held' ? !heldSales.length : !history.length) && <p className="p-8 text-center text-sm text-slate-500">ยังไม่มีรายการ</p>}</div></section></div>}
    {returnSale && <div className="no-print fixed inset-0 z-40 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={completeReturn} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">คืนสินค้า {returnSale.receipt_number}</h2><p className="mt-1 text-xs text-slate-500">ยอดคืนเงินจะคำนวณจากราคาที่ขายจริงในใบเสร็จ</p></div><div className="space-y-3 p-5">{returnSale.items.map((item) => <label key={item.id} className="flex items-center gap-3 border-b border-slate-100 pb-3"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.product_name_snapshot}</span><span className="text-xs text-slate-500">ซื้อ {item.quantity} {item.unit_name_snapshot} · {formatBaht(toNumber(item.line_total))}</span></span><input type="number" min="0" max={toNumber(item.quantity)} step="0.001" value={returnQuantities[item.id] || 0} onChange={(event) => setReturnQuantities((current) => ({ ...current, [item.id]: Math.min(toNumber(item.quantity), Math.max(0, toNumber(event.target.value))) }))} className="h-9 w-20 border border-slate-300 px-2 text-right text-sm outline-none focus:border-primary-700" /></label>)}<label className="block text-xs font-medium text-slate-700">เหตุผลการคืน<textarea required value={returnReason} onChange={(event) => setReturnReason(event.target.value)} className="mt-1.5 min-h-18 w-full border border-slate-300 p-2 text-sm font-normal outline-none focus:border-primary-700" placeholder="เช่น สินค้าชำรุด หรือเปลี่ยนสินค้า" /></label><label className="block text-xs font-medium text-slate-700">วิธีคืนเงิน<Select value={returnRefundMethod} onChange={(event) => setReturnRefundMethod(event.target.value as CommercePaymentMethod)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm font-normal outline-none focus:border-primary-700">{paymentMethods.map((method) => <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>)}</Select></label><div className="flex justify-between border-t border-slate-200 pt-3"><span className="text-sm text-slate-600">คืนผ่าน {PAYMENT_METHOD_LABELS[returnRefundMethod]}</span><strong>{formatBaht(returnTotal)}</strong></div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setReturnSale(null)} className="h-9 px-4 text-sm text-slate-600">ยกเลิก</button><button disabled={isSubmitting || returnTotal <= 0} className="h-9 bg-slate-900 px-4 text-sm font-medium text-white disabled:bg-slate-300">{isSubmitting ? 'กำลังบันทึก…' : 'ยืนยันคืนสินค้า'}</button></div></form></div>}
    <PosNoticePopup notice={notice} onClose={() => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); setNotice(null); }} />
  </CommerceShell>;
}

function PosCatalogViewSwitcher({ containerRef, value, open, onToggle, onChange }: { containerRef: RefObject<HTMLDivElement | null>; value: PosCatalogView; open: boolean; onToggle: () => void; onChange: (value: PosCatalogView) => void }) {
  const sliderValue = value === 'list' ? POS_CATALOG_MAX_COLUMNS : value;

  return <div ref={containerRef} className="relative shrink-0">
    <button type="button" onClick={onToggle} aria-expanded={open} aria-haspopup="dialog" className="text-xs text-slate-500 transition hover:text-slate-950 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2">{getPosCatalogViewLabel(value)}</button>
    {open ? <div role="dialog" aria-label="ตั้งค่ามุมมองสินค้า" className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-900/10">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
        <div><p className="text-sm font-semibold text-slate-900">มุมมองสินค้า</p><p className="mt-1 text-xs text-slate-500">ปรับจำนวนสินค้าที่เห็นต่อแถว</p></div>
        <span className="shrink-0 text-sm font-semibold text-primary-800">{getPosCatalogViewLabel(value)}</span>
      </div>
      <div className="pt-4">
        <div className="flex items-center justify-between text-xs text-slate-500"><span>1 ช่อง</span><span>{POS_CATALOG_MAX_COLUMNS} ช่อง</span></div>
        <input type="range" min="1" max={POS_CATALOG_MAX_COLUMNS} step="1" value={sliderValue} onChange={(event) => onChange(Number(event.target.value))} aria-label="จำนวนคอลัมน์สินค้า" className="mt-2 h-2 w-full cursor-pointer accent-primary-800" />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>เห็นข้อมูลใหญ่</span><span>เห็นสินค้าได้มากขึ้น</span></div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[11px] font-medium text-slate-500">เลือกด่วน</p><div className="mt-2 grid grid-cols-3 gap-1.5"><button type="button" onClick={() => onChange(4)} aria-pressed={value === 4} className={`h-8 border text-xs transition ${value === 4 ? 'border-primary-800 bg-primary-50 font-semibold text-primary-800' : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-950'}`}>4 คอลัมน์</button><button type="button" onClick={() => onChange(8)} aria-pressed={value === 8} className={`h-8 border text-xs transition ${value === 8 ? 'border-primary-800 bg-primary-50 font-semibold text-primary-800' : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-950'}`}>8 คอลัมน์</button><button type="button" onClick={() => onChange('list')} aria-pressed={value === 'list'} className={`h-8 border text-xs transition ${value === 'list' ? 'border-primary-800 bg-primary-50 font-semibold text-primary-800' : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-950'}`}>แถว</button></div></div>
    </div> : null}
  </div>;
}

function PosCatalogItem({ product, unit, view, onAdd }: { product: CommerceProduct; unit: CommerceUnit; view: PosCatalogView; onAdd: (productId: string, unitId: string) => void }) {
  const imageSrc = unit.imageUrl || product.imageUrl;
  const isOutOfStock = unit.available <= 0;
  const unitLabel = `${unit.name}${unit.isDefault ? ' · หน่วยหลัก' : ''}`;
  const productMeta = [product.sku, product.categoryName].filter(Boolean).join(' · ');

  const image = <div className={`relative shrink-0 overflow-hidden bg-slate-50 ${view === 'list' ? 'h-14 w-14' : view === 8 ? 'h-20 w-full' : 'h-24 w-full'}`}>
    {imageSrc ? <Image src={imageSrc} alt={`${product.name} ${unit.name}`} fill sizes={view === 'list' ? '56px' : '(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 20vw'} className={`object-contain p-1 transition ${isOutOfStock ? 'grayscale opacity-40' : 'group-hover:scale-[1.03]'}`} /> : <div className="grid h-full place-items-center text-[10px] font-semibold tracking-wider text-slate-300">NO IMAGE</div>}
    {isOutOfStock ? <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 border border-red-300 bg-white/95 py-1 text-center text-[10px] font-semibold text-red-700">สินค้าหมด</span> : null}
  </div>;

  if (view === 'list') {
    return <button type="button" disabled={isOutOfStock} onClick={() => onAdd(product.id, unit.id)} aria-label={`${product.name} · ${unit.name} · ${formatBaht(unit.salePrice)}`} className="group flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left transition hover:bg-primary-50 focus-visible:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 sm:px-4">
      {image}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{product.name}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-primary-800">{unitLabel}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-400">{productMeta || 'ไม่มี SKU'}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold text-slate-900">{formatBaht(unit.salePrice)}</span>
        <span className={`mt-0.5 block text-[11px] ${isOutOfStock ? 'text-red-600' : 'text-slate-500'}`}>{isOutOfStock ? 'สินค้าหมด' : `เหลือ ${unit.available.toLocaleString('th-TH')}`}</span>
      </span>
      <span className="hidden shrink-0 border border-primary-700 px-2.5 py-1.5 text-xs font-semibold text-primary-800 transition group-hover:bg-primary-800 group-hover:text-white sm:inline-block">เพิ่ม</span>
    </button>;
  }

  return <button type="button" disabled={isOutOfStock} onClick={() => onAdd(product.id, unit.id)} aria-label={`${product.name} · ${unit.name} · ${formatBaht(unit.salePrice)}`} className={`group min-w-0 border-b border-r border-slate-200 text-left transition hover:bg-primary-50 focus-visible:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-700 disabled:cursor-not-allowed disabled:bg-slate-50 ${view === 8 ? 'min-h-40 p-2' : 'min-h-52 p-3'}`}>
    {image}
    <p className={`mt-2 truncate font-semibold leading-5 text-slate-800 ${view === 8 ? 'text-xs' : 'text-sm'}`}>{product.name}</p>
    <p className={`mt-0.5 truncate font-semibold text-primary-800 ${view === 8 ? 'text-[11px]' : 'text-xs'}`}>{unitLabel}</p>
    <p className={`mt-1 truncate text-slate-400 ${view === 8 ? 'text-[10px]' : 'text-[11px]'}`}>{productMeta || 'ไม่มี SKU'}</p>
    <div className={`mt-2 flex gap-2 ${view === 8 ? 'flex-col items-start' : 'items-end justify-between'}`}>
      <span className={`font-semibold text-slate-900 ${view === 8 ? 'text-xs' : 'text-sm'}`}>{formatBaht(unit.salePrice)}</span>
      <span className={`truncate text-[11px] ${isOutOfStock ? 'text-red-600' : 'text-slate-500'}`}>{isOutOfStock ? 'สินค้าหมด' : `เหลือ ${unit.available.toLocaleString('th-TH')}`}</span>
    </div>
  </button>;
}

function PosLoadingWorkspace() {
  return <div className="animate-pulse"><div className="mb-3 flex h-9 items-center border-b border-slate-200"><div className="h-3 w-36 rounded bg-slate-200" /><div className="ml-auto h-8 w-40 rounded bg-slate-200" /></div><div className="grid min-h-[calc(100dvh-8.25rem)] gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]"><section className="border border-slate-200 bg-white"><div className="flex flex-wrap gap-3 border-b border-slate-200 p-3"><div className="h-10 min-w-0 flex-1 basis-full rounded bg-slate-100 sm:basis-auto" /><div className="h-5 w-14 self-center rounded bg-slate-100" /><div className="h-9 w-48 rounded bg-slate-100" /></div><div className="flex gap-3 border-b border-slate-200 px-3 py-2"><div className="h-7 w-14 rounded bg-slate-100" /><div className="h-7 w-20 rounded bg-slate-100" /><div className="h-7 w-16 rounded bg-slate-100" /></div><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 12 }, (_, index) => <div key={index} className="min-h-31 border-b border-r border-slate-100 p-3"><div className="h-20 rounded bg-slate-100" /><div className="mt-2 h-4 w-4/5 rounded bg-slate-100" /><div className="mt-2 h-3 w-2/5 rounded bg-slate-100" /><div className="mt-3 flex justify-between"><div className="h-4 w-16 rounded bg-slate-100" /><div className="h-3 w-12 rounded bg-slate-100" /></div></div>)}</div></section><aside className="border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4"><div className="h-4 w-24 rounded bg-slate-100" /><div className="mt-3 h-8 w-full rounded bg-slate-100" /></div><div className="p-4"><div className="h-4 w-24 rounded bg-slate-100" /><div className="mt-3 h-10 w-full rounded bg-slate-100" /><div className="mt-3 h-10 w-full rounded bg-slate-100" /></div></aside></div></div>;
}

function PosLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="grid min-h-[70dvh] place-items-center"><section className="w-full max-w-md border border-slate-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-semibold text-slate-900">ยังโหลดข้อมูลจุดขายไม่สำเร็จ</p><p className="mt-2 text-sm leading-6 text-slate-500">{message}</p><button type="button" onClick={onRetry} className="mt-5 h-10 bg-primary-800 px-4 text-sm font-medium text-white hover:bg-primary-900">ลองใหม่</button></section></div>;
}
