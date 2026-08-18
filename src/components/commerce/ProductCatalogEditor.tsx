'use client';
/* eslint-disable @next/next/no-img-element */

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Barcode,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  Image as ImageIcon,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Select from '@/components/ui/Select';
import { getAccessToken } from '@/lib/supabase';

export type CatalogCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type CatalogProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  base_unit_code: string;
  default_sale_price: number | string;
  default_cost_price: number | string;
  reorder_point: number | string;
  is_active: boolean;
  track_inventory: boolean;
  is_weighted: boolean;
  allow_branch_price: boolean;
  tax_rate: number | string;
  weight_kg: number | string | null;
  area_sqm: number | string | null;
  unit_inventory_mode: 'shared_base' | 'separate_unit';
  updated_at: string;
  default_unit: {
    id: string;
    code: string;
    name: string;
    conversion_to_base: number | string;
    allow_decimal: boolean;
    is_default: boolean;
  } | null;
};

type CustomerType = 'member' | 'wholesale' | 'dealer';
type PriceCustomerType = 'retail' | CustomerType;
type EditorSection = 'general' | 'pricing' | 'sales' | 'content';
type PricingPanel = 'base' | 'units' | 'customer' | 'branch';
type PriceRuleForm = { customer_type: CustomerType; enabled: boolean; minimum_quantity: string; price: string };
type UnitForm = { name: string; code: string; conversion_to_base: string; barcode: string; allow_decimal: boolean; can_sell: boolean; can_receive: boolean };
type BranchPriceForm = { unit_id: string; branch_id: string; customer_type: PriceCustomerType; minimum_quantity: string; price: string; starts_at: string; ends_at: string };

type ProductForm = {
  sku: string;
  name: string;
  brand: string;
  barcode: string;
  category_id: string;
  unit_name: string;
  unit_code: string;
  sale_price: string;
  cost_price: string;
  reorder_point: string;
  is_active: boolean;
  track_inventory: boolean;
  is_weighted: boolean;
  allow_branch_price: boolean;
  tax_rate: string;
  weight_kg: string;
  area_sqm: string;
  description: string;
  price_rules: PriceRuleForm[];
  unit_inventory_mode: 'shared_base' | 'separate_unit';
};

type DetailResponse = {
  product: CatalogProduct & { description: string | null };
  units: Array<{ id: string; code: string; name: string; barcode: string | null; image_url: string | null; conversion_to_base: number | string; allow_decimal: boolean; is_default: boolean; can_sell: boolean; can_receive: boolean }>;
  price_rules: Array<{ customer_type: CustomerType; minimum_quantity: number | string; price: number | string; is_active: boolean }>;
  prices: Array<{ id: string; product_unit_id: string; branch_id: string | null; customer_type: PriceCustomerType; minimum_quantity: number | string; price: number | string; priority: number; is_active: boolean; starts_at: string | null; ends_at: string | null; is_inventory_default: boolean }>;
  branches: Array<{ id: string; name: string }>;
};

const PRICE_LABELS: Record<CustomerType, { label: string; description: string }> = {
  member: { label: 'สมาชิก', description: 'ราคาสำหรับลูกค้าที่มีสถานะสมาชิก' },
  wholesale: { label: 'ราคาส่ง', description: 'ใช้เมื่อสั่งถึงจำนวนขั้นต่ำที่กำหนด' },
  dealer: { label: 'ตัวแทนจำหน่าย', description: 'ราคาสำหรับคู่ค้ากลุ่มตัวแทน' },
};

const PRICE_TYPE_LABELS: Record<PriceCustomerType, string> = {
  retail: 'ลูกค้าทั่วไป',
  member: 'สมาชิก',
  wholesale: 'ค้าส่ง',
  dealer: 'ตัวแทนจำหน่าย',
};

const blankPriceRules = (): PriceRuleForm[] => (['member', 'wholesale', 'dealer'] as CustomerType[]).map((customerType) => ({
  customer_type: customerType,
  enabled: false,
  minimum_quantity: '1',
  price: '',
}));

const blankUnitForm = (): UnitForm => ({ name: '', code: '', conversion_to_base: '1', barcode: '', allow_decimal: true, can_sell: true, can_receive: true });
const blankBranchPriceForm = (unitId = ''): BranchPriceForm => ({ unit_id: unitId, branch_id: '', customer_type: 'retail', minimum_quantity: '0', price: '', starts_at: '', ends_at: '' });

const blankForm = (): ProductForm => ({
  sku: '',
  name: '',
  brand: '',
  barcode: '',
  category_id: '',
  unit_name: 'กิโลกรัม',
  unit_code: 'kg',
  sale_price: '',
  cost_price: '',
  reorder_point: '0',
  is_active: true,
  track_inventory: true,
  is_weighted: false,
  allow_branch_price: false,
  tax_rate: '0',
  weight_kg: '',
  area_sqm: '',
  description: '',
  price_rules: blankPriceRules(),
  unit_inventory_mode: 'shared_base',
});

async function catalogFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

async function fetchProductDetail(productId: string) {
  return await catalogFetch(`/api/commerce/catalog/products/${encodeURIComponent(productId)}`) as DetailResponse;
}

export function ProductCatalogEditor({
  productId,
  categories,
  onClose,
  onSaved,
  onCategoryCreated,
}: {
  productId: string | null;
  categories: CatalogCategory[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onCategoryCreated: (category: CatalogCategory) => void;
}) {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [section, setSection] = useState<EditorSection>('general');
  const [pricingPanels, setPricingPanels] = useState<Record<PricingPanel, boolean>>({ base: false, units: false, customer: false, branch: false });
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm>(blankUnitForm);
  const [unitFormOpen, setUnitFormOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitMenuId, setUnitMenuId] = useState<string | null>(null);
  const [branchPriceForm, setBranchPriceForm] = useState<BranchPriceForm>(blankBranchPriceForm);
  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [unitWorking, setUnitWorking] = useState(false);
  const [priceWorking, setPriceWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const previewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    setSection('general');
    setPricingPanels({ base: false, units: false, customer: false, branch: false });
    setMessage('');
    setImageFile(null);
    setRemoveImage(false);
    setDetail(null);
    setUnitForm(blankUnitForm());
    setUnitFormOpen(false);
    setEditingUnitId(null);
    setUnitMenuId(null);
    setBranchPriceForm(blankBranchPriceForm());
    if (!productId) {
      setForm(blankForm());
      setImageUrl(null);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    void fetchProductDetail(productId)
      .then((response: DetailResponse) => {
        if (cancelled) return;
        setDetail(response);
        const product = response.product;
        const unit = response.units.find((item) => item.is_default) || response.units[0];
        const rules = blankPriceRules().map((rule) => {
          const saved = response.price_rules.find((item) => item.customer_type === rule.customer_type && item.is_active);
          return saved ? {
            ...rule,
            enabled: true,
            minimum_quantity: stringValue(saved.minimum_quantity),
            price: stringValue(saved.price),
          } : rule;
        });
        setForm({
          sku: product.sku || '',
          name: product.name || '',
          brand: product.brand || '',
          barcode: product.barcode || '',
          category_id: product.category_id || '',
          unit_name: unit?.name || product.base_unit_code || '',
          unit_code: unit?.code || product.base_unit_code || '',
          sale_price: stringValue(product.default_sale_price),
          cost_price: stringValue(product.default_cost_price),
          reorder_point: stringValue(product.reorder_point),
          is_active: product.is_active !== false,
          track_inventory: product.track_inventory !== false,
          is_weighted: product.is_weighted === true,
          allow_branch_price: product.allow_branch_price === true,
          tax_rate: Number(product.tax_rate) === 7 ? '7' : '0',
          weight_kg: stringValue(product.weight_kg),
          area_sqm: stringValue(product.area_sqm),
          description: product.description || '',
          price_rules: rules,
          unit_inventory_mode: product.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base',
        });
        setBranchPriceForm(blankBranchPriceForm(unit?.id || ''));
        setImageUrl(product.image_url || null);
      })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'โหลดสินค้าไม่สำเร็จ'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const update = <Key extends keyof ProductForm>(key: Key, value: ProductForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateRule = (type: CustomerType, changes: Partial<PriceRuleForm>) => {
    setForm((current) => ({
      ...current,
      price_rules: current.price_rules.map((rule) => rule.customer_type === type ? { ...rule, ...changes } : rule),
    }));
  };

  const refreshDetail = async () => {
    if (!productId) return null;
    const response = await fetchProductDetail(productId);
    setDetail(response);
    return response;
  };

  const togglePricingPanel = (panel: PricingPanel) => {
    setPricingPanels((current) => ({ ...current, [panel]: !current[panel] }));
  };

  const startAddUnit = () => {
    setEditingUnitId(null);
    setUnitForm(blankUnitForm());
    setUnitMenuId(null);
    setUnitFormOpen(true);
  };

  const startEditUnit = (unit: DetailResponse['units'][number]) => {
    setEditingUnitId(unit.id);
    setUnitForm({
      name: unit.name,
      code: unit.code,
      conversion_to_base: stringValue(unit.conversion_to_base),
      barcode: unit.barcode || '',
      allow_decimal: unit.allow_decimal,
      can_sell: unit.can_sell !== false,
      can_receive: unit.can_receive !== false,
    });
    setUnitMenuId(null);
    setUnitFormOpen(true);
  };

  const cancelUnitForm = () => {
    setUnitFormOpen(false);
    setEditingUnitId(null);
    setUnitForm(blankUnitForm());
  };

  const saveUnit = async () => {
    if (!productId) {
      setMessage('บันทึกสินค้าแล้วจึงเพิ่มหน่วยเสริมได้');
      return;
    }
    const name = unitForm.name.trim();
    const code = unitForm.code.trim().toLowerCase();
    const conversion = Number(unitForm.conversion_to_base);
    if (!name || !code || !Number.isFinite(conversion) || conversion <= 0) {
      setMessage('กรอกชื่อหน่วย รหัสหน่วย และอัตราเทียบหน่วยให้ถูกต้อง');
      return;
    }
    try {
      setUnitWorking(true);
      setMessage('');
      await catalogFetch(editingUnitId ? `/api/commerce/catalog/units/${encodeURIComponent(editingUnitId)}` : '/api/commerce/catalog/units', {
        method: editingUnitId ? 'PATCH' : 'POST',
        body: JSON.stringify({ product_id: productId, name, code, conversion_to_base: conversion, barcode: unitForm.barcode.trim() || null, allow_decimal: unitForm.allow_decimal, can_sell: unitForm.can_sell, can_receive: unitForm.can_receive }),
      });
      await refreshDetail();
      const wasEditing = Boolean(editingUnitId);
      cancelUnitForm();
      setMessage(wasEditing ? 'แก้ไขหน่วยขายแล้ว' : 'เพิ่มหน่วยขายแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : editingUnitId ? 'แก้ไขหน่วยไม่สำเร็จ' : 'เพิ่มหน่วยไม่สำเร็จ');
    } finally {
      setUnitWorking(false);
    }
  };

  const removeUnit = async (unit: DetailResponse['units'][number]) => {
    if (unit.is_default || !productId) return;
    if (!window.confirm(`ต้องการลบหน่วย “${unit.name}” ใช่หรือไม่?`)) return;
    try {
      setUnitWorking(true);
      setUnitMenuId(null);
      setMessage('');
      await catalogFetch(`/api/commerce/catalog/units/${encodeURIComponent(unit.id)}`, { method: 'DELETE' });
      await refreshDetail();
      if (editingUnitId === unit.id) cancelUnitForm();
      setMessage('ลบหน่วยขายแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ลบหน่วยไม่สำเร็จ');
    } finally {
      setUnitWorking(false);
    }
  };

  const addBranchPrice = async () => {
    if (!productId) {
      setMessage('บันทึกสินค้าแล้วจึงเพิ่มราคาสาขาได้');
      return;
    }
    const price = Number(branchPriceForm.price);
    const minimumQuantity = Number(branchPriceForm.minimum_quantity || 0);
    if (!branchPriceForm.unit_id || !Number.isFinite(price) || price < 0 || !Number.isFinite(minimumQuantity) || minimumQuantity < 0) {
      setMessage('เลือกหน่วยขายและกรอกราคาให้ถูกต้อง');
      return;
    }
    try {
      setPriceWorking(true);
      setMessage('');
      await catalogFetch('/api/commerce/catalog/prices', {
        method: 'POST',
        body: JSON.stringify({
          product_id: productId,
          product_unit_id: branchPriceForm.unit_id,
          branch_id: branchPriceForm.branch_id,
          customer_type: branchPriceForm.customer_type,
          minimum_quantity: minimumQuantity,
          price,
          starts_at: branchPriceForm.starts_at || null,
          ends_at: branchPriceForm.ends_at || null,
        }),
      });
      await refreshDetail();
      setBranchPriceForm((current) => ({ ...current, price: '', starts_at: '', ends_at: '' }));
      setMessage(branchPriceForm.branch_id ? 'บันทึกราคาสาขาแล้ว ราคานี้จะถูกใช้ก่อนราคากลางเมื่อขายที่สาขานี้' : 'บันทึกราคากลางของหน่วยขายแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกราคาสาขาไม่สำเร็จ');
    } finally {
      setPriceWorking(false);
    }
  };

  const createCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;
    try {
      setCreatingCategory(true);
      setMessage('');
      const response = await catalogFetch('/api/commerce/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }) as { category: CatalogCategory };
      onCategoryCreated({ ...response.category, is_active: true });
      update('category_id', response.category.id);
      setCategoryName('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เพิ่มหมวดสินค้าไม่สำเร็จ');
    } finally {
      setCreatingCategory(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      setSection('general');
      setMessage('ระบุ SKU และชื่อสินค้าให้ครบถ้วน');
      return;
    }
    if (!form.unit_name.trim() || !form.unit_code.trim() || form.sale_price === '' || Number(form.sale_price) < 0) {
      setSection('pricing');
      setMessage('ระบุหน่วยหลัก รหัสหน่วย และราคาขายให้ถูกต้อง');
      return;
    }
    const invalidPriceRule = form.price_rules.find((rule) => (
      rule.enabled && (rule.price === '' || Number(rule.price) < 0 || Number(rule.minimum_quantity) <= 0)
    ));
    if (invalidPriceRule) {
      setSection('pricing');
      setMessage(`ตรวจสอบราคา${PRICE_LABELS[invalidPriceRule.customer_type].label}และจำนวนขั้นต่ำ`);
      return;
    }
    try {
      setSaving(true);
      setMessage('');
      const payload = {
        ...form,
        sale_price: Number(form.sale_price),
        cost_price: Number(form.cost_price || 0),
        reorder_point: Number(form.reorder_point || 0),
        tax_rate: Number(form.tax_rate),
        weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
        area_sqm: form.area_sqm === '' ? null : Number(form.area_sqm),
        allow_decimal: form.is_weighted,
        unit_inventory_mode: form.unit_inventory_mode,
        price_rules: form.price_rules.map((rule) => ({
          ...rule,
          minimum_quantity: Number(rule.minimum_quantity || 1),
          price: Number(rule.price),
        })),
      };
      const response = await catalogFetch(
        productId ? `/api/commerce/catalog/products/${encodeURIComponent(productId)}` : '/api/commerce/catalog/products',
        { method: productId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      ) as { product: { id: string } };
      const savedId = response.product.id;

      if (imageFile) {
        const imageForm = new FormData();
        imageForm.set('file', imageFile);
        await catalogFetch(`/api/commerce/catalog/products/${encodeURIComponent(savedId)}/image`, { method: 'POST', body: imageForm });
      } else if (removeImage && imageUrl) {
        await catalogFetch(`/api/commerce/catalog/products/${encodeURIComponent(savedId)}/image`, { method: 'DELETE' });
      }

      onSaved(productId ? 'บันทึกการแก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าในแคตตาล็อกแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกสินค้าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: EditorSection; label: string; icon: typeof Package }> = [
    { id: 'general', label: 'ข้อมูลสินค้า', icon: Package },
    { id: 'pricing', label: 'ราคาและหน่วย', icon: ReceiptText },
    { id: 'sales', label: 'การขาย', icon: Boxes },
    { id: 'content', label: 'รูปและรายละเอียด', icon: ImageIcon },
  ];

  return <motion.div
    className="fixed inset-0 z-[70] bg-slate-950/35"
    initial={reduceMotion ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={reduceMotion ? undefined : { opacity: 0 }}
    onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
  >
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-editor-title"
      className="ml-auto flex h-full w-full max-w-[980px] flex-col bg-white shadow-2xl"
      initial={reduceMotion ? false : { x: 44, opacity: 0.8 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduceMotion ? undefined : { x: 44, opacity: 0.8 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 px-5 sm:px-7">
        <div>
          <p className="text-xs font-medium text-primary-800">ข้อมูลแม่สินค้า</p>
          <h2 id="product-editor-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{productId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
        </div>
        <button type="button" aria-label="ปิด" disabled={saving} onClick={onClose} className="grid size-10 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"><X className="size-5" /></button>
      </div>

      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-2 sm:px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return <button key={tab.id} type="button" onClick={() => setSection(tab.id)} className={`relative flex min-h-14 items-center justify-center gap-2 px-2 text-xs font-medium transition sm:text-sm ${active ? 'text-primary-900' : 'text-slate-500 hover:text-slate-900'}`}>
            <Icon className="size-4 shrink-0" /><span className="hidden sm:inline">{tab.label}</span>
            {active ? <motion.span layoutId="product-editor-tab" className="absolute inset-x-2 bottom-0 h-0.5 bg-primary-800" /> : null}
          </button>;
        })}
      </div>

      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {loading ? <EditorLoading /> : null}

          {!loading && section === 'general' ? <div className="mx-auto max-w-4xl">
            <SectionHeading title="ข้อมูลพื้นฐาน" description="รหัส ชื่อ และหมวดหมู่ที่ใช้ร่วมกันทุกสาขา" />
            <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="SKU" value={form.sku} onChange={(value) => update('sku', value)} required placeholder="เช่น 10054" icon={Barcode} />
              <Field label="บาร์โค้ด" value={form.barcode} onChange={(value) => update('barcode', value)} placeholder="ยิงสแกนเนอร์หรือกรอกเลขบาร์โค้ด" icon={Barcode} />
              <div className="sm:col-span-2"><Field label="ชื่อสินค้า / บริการ" value={form.name} onChange={(value) => update('name', value)} required placeholder="ชื่อที่จะแสดงใน POS และเอกสาร" /></div>
              <Field label="ยี่ห้อ" value={form.brand} onChange={(value) => update('brand', value)} placeholder="ไม่บังคับ" />
              <label className="block text-sm font-medium text-slate-700">หมวดสินค้า
                <Select value={form.category_id} onChange={(event) => update('category_id', event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm" placeholder="ไม่ระบุหมวด">
                  <option value="">ไม่ระบุหมวด</option>
                  {categories.filter((category) => category.is_active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              </label>
            </div>
            <div className="mt-5 flex flex-col gap-2 border-l-2 border-primary-700 bg-primary-50/60 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">เพิ่มหมวดใหม่</p><p className="mt-0.5 text-xs text-slate-500">หมวดที่สร้างจะพร้อมใช้กับสินค้าทุกสาขา</p></div>
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="h-10 min-w-0 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 sm:w-64" placeholder="ชื่อหมวดสินค้า" />
              <button type="button" onClick={() => void createCategory()} disabled={creatingCategory || !categoryName.trim()} className="inline-flex h-10 items-center justify-center gap-2 border border-primary-700 px-3 text-sm font-medium text-primary-800 transition hover:bg-white disabled:border-slate-300 disabled:text-slate-400"><Plus className="size-4" />เพิ่มหมวด</button>
            </div>
          </div> : null}

          {!loading && section === 'pricing' ? <div className="mx-auto max-w-4xl">
            <SectionHeading title="หน่วยและราคา" description="ตั้งค่าหน่วยขาย ราคากลาง ราคาตามประเภทลูกค้า และราคาที่แตกต่างกันของแต่ละสาขาไว้ในที่เดียว" />
            <div className="mt-5 border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center bg-primary-50 text-primary-800"><Boxes className="size-4" /></span>
                <div><p className="text-sm font-semibold text-slate-900">วิธีนับสต๊อกของสินค้า</p><p className="mt-1 text-xs leading-5 text-slate-500">เลือกแบบที่ตรงกับการเก็บสินค้าจริงของร้าน สินค้าข้าวสารควรใช้แบบแยกหน่วย</p></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => update('unit_inventory_mode', 'shared_base')} className={`flex items-start gap-3 border p-3 text-left transition ${form.unit_inventory_mode === 'shared_base' ? 'border-primary-700 bg-white ring-1 ring-primary-700' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                  <span className={`mt-0.5 grid size-5 place-items-center rounded-full border ${form.unit_inventory_mode === 'shared_base' ? 'border-primary-700 bg-primary-700 text-white' : 'border-slate-300'}`}>{form.unit_inventory_mode === 'shared_base' ? <Check className="size-3.5" /> : null}</span>
                  <span><span className="block text-sm font-semibold text-slate-900">ใช้สต๊อกรวม</span><span className="mt-1 block text-xs leading-5 text-slate-500">ทุกหน่วยใช้ยอดคงเหลือก้อนเดียว เหมาะกับสินค้าที่หน่วยเป็นเพียงรูปแบบการขาย</span></span>
                </button>
                <button type="button" onClick={() => update('unit_inventory_mode', 'separate_unit')} className={`flex items-start gap-3 border p-3 text-left transition ${form.unit_inventory_mode === 'separate_unit' ? 'border-primary-700 bg-white ring-1 ring-primary-700' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                  <span className={`mt-0.5 grid size-5 place-items-center rounded-full border ${form.unit_inventory_mode === 'separate_unit' ? 'border-primary-700 bg-primary-700 text-white' : 'border-slate-300'}`}>{form.unit_inventory_mode === 'separate_unit' ? <Check className="size-3.5" /> : null}</span>
                  <span><span className="block text-sm font-semibold text-slate-900">แยกสต๊อกตามหน่วยจริง</span><span className="mt-1 block text-xs leading-5 text-slate-500">กระสอบ ถุง และกิโลมีจำนวนของตัวเอง พร้อมปุ่มแตก/รวมหน่วยในหน้าสต๊อก</span></span>
                </button>
              </div>
              {form.unit_inventory_mode === 'separate_unit' ? <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-primary-900"><CircleHelp className="mt-0.5 size-4 shrink-0" />เมื่อเปิดใช้ ระบบจะย้ายยอดสต๊อกเดิมไปไว้ที่หน่วยหลักก่อน และการเปลี่ยนเป็นสต๊อกรวมภายหลังจะไม่ลบประวัติการแปลงหน่วย</p> : null}
            </div>
            <div className="mt-5 space-y-3">
              <AccordionSection title="หน่วยหลักและราคากลาง" description="หน่วยที่ใช้เป็นฐานคำนวณ ต้นทุน และราคาขายหลักของสินค้า" icon={Scale} open={pricingPanels.base} onToggle={() => togglePricingPanel('base')}>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="ชื่อหน่วยหลัก" value={form.unit_name} onChange={(value) => update('unit_name', value)} required placeholder="เช่น กระสอบ" />
                  <Field label="รหัสหน่วย" value={form.unit_code} onChange={(value) => update('unit_code', value)} required placeholder="เช่น sack" />
                  <Field label="ราคาขายกลาง" value={form.sale_price} onChange={(value) => update('sale_price', value)} required type="number" suffix="บาท" />
                  <Field label="ต้นทุนมาตรฐาน" value={form.cost_price} onChange={(value) => update('cost_price', value)} type="number" suffix="บาท" />
                  <Field label="จุดสั่งซื้อเริ่มต้น" value={form.reorder_point} onChange={(value) => update('reorder_point', value)} type="number" suffix={form.unit_name || 'หน่วย'} />
                </div>
              </AccordionSection>

              <AccordionSection title="หน่วยขายเพิ่มเติม" description="เพิ่มหน่วย เช่น ลัง แพ็ก หรือชิ้น พร้อมอัตราเทียบเป็นหน่วยหลัก" icon={Package} open={pricingPanels.units} onToggle={() => togglePricingPanel('units')}>
                {!productId ? <div className="flex items-start gap-3 border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600"><CircleHelp className="mt-0.5 size-4 shrink-0 text-slate-400" /><span>บันทึกสินค้าให้เรียบร้อยก่อน แล้วจึงเพิ่มหน่วยขายเพิ่มเติมได้</span></div> : <>
                  <div className="overflow-visible border border-slate-200">
                    <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_3rem] bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500 sm:grid"><span>หน่วยขาย</span><span>รหัส</span><span>เทียบหน่วยหลัก</span><span>บาร์โค้ด</span><span className="sr-only">จัดการ</span></div>
                    {detail?.units.map((unit) => <div key={unit.id} className="grid gap-2 border-t border-slate-200 px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_3rem] sm:items-center sm:gap-3">
                      <div><p className="text-sm font-medium text-slate-800">{unit.name}{unit.is_default ? <span className="ml-2 inline-flex bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">หน่วยหลัก</span> : null}</p><p className="mt-1 text-xs text-slate-500 sm:hidden">{unit.code} · {unit.conversion_to_base} หน่วยหลัก · {unit.barcode || 'ไม่มีบาร์โค้ด'}</p><p className="mt-1 text-[11px] text-slate-400">{unit.can_sell !== false ? 'ขายได้' : 'ไม่ขาย'} · {unit.can_receive !== false ? 'รับเข้าได้' : 'ไม่รับเข้า'}</p></div>
                      <span className="hidden text-sm text-slate-600 sm:block">{unit.code}</span>
                      <span className="hidden text-sm text-slate-600 sm:block">{unit.conversion_to_base} หน่วย</span>
                      <span className="hidden truncate text-xs text-slate-500 sm:block">{unit.barcode || 'ไม่มี'}</span>
                      <div className="relative flex justify-end">
                        {!unit.is_default ? <>
                          <button type="button" aria-label={`เมนูหน่วย ${unit.name}`} aria-expanded={unitMenuId === unit.id} onClick={() => setUnitMenuId((current) => current === unit.id ? null : unit.id)} className="grid size-9 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><MoreHorizontal className="size-5" /></button>
                          {unitMenuId === unit.id ? <div role="menu" className="absolute right-0 top-10 z-20 w-36 border border-slate-200 bg-white p-1 shadow-lg">
                            <button type="button" role="menuitem" onClick={() => startEditUnit(unit)} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"><Pencil className="size-3.5" />แก้ไขหน่วย</button>
                            <button type="button" role="menuitem" onClick={() => void removeUnit(unit)} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" />ลบหน่วย</button>
                          </div> : null}
                        </> : <span className="hidden text-right text-[11px] text-slate-400 sm:block">ตั้งค่าด้านบน</span>}
                      </div>
                    </div>)}
                  </div>
                  {!unitFormOpen ? <button type="button" onClick={startAddUnit} className="mt-4 inline-flex h-10 items-center justify-center gap-2 border border-primary-700 px-4 text-sm font-semibold text-primary-800 transition hover:bg-primary-50"><Plus className="size-4" />เพิ่มหน่วยขาย</button> : <div className="mt-4 border border-primary-100 bg-primary-50/40 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{editingUnitId ? 'แก้ไขหน่วยขาย' : 'เพิ่มหน่วยขาย'}</p><button type="button" onClick={cancelUnitForm} className="grid size-8 place-items-center text-slate-500 hover:bg-white hover:text-slate-900" aria-label="ยกเลิกการแก้ไขหน่วย"><X className="size-4" /></button></div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_7rem_8rem_minmax(0,1fr)]">
                      <label className="block text-xs font-medium text-slate-700">ชื่อหน่วย<input value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} placeholder="เช่น ลัง" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                      <label className="block text-xs font-medium text-slate-700">รหัส<input value={unitForm.code} onChange={(event) => setUnitForm((current) => ({ ...current, code: event.target.value }))} placeholder="เช่น case" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                      <label className="block text-xs font-medium text-slate-700">เทียบหน่วยหลัก<input type="number" min="0.001" step="0.001" value={unitForm.conversion_to_base} onChange={(event) => setUnitForm((current) => ({ ...current, conversion_to_base: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                      <label className="block text-xs font-medium text-slate-700">บาร์โค้ด (ถ้ามี)<input value={unitForm.barcode} onChange={(event) => setUnitForm((current) => ({ ...current, barcode: event.target.value }))} placeholder="บาร์โค้ดของหน่วยนี้" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-4"><label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={unitForm.allow_decimal} onChange={(event) => setUnitForm((current) => ({ ...current, allow_decimal: event.target.checked }))} className="size-4 accent-primary-700" />อนุญาตขายเป็นทศนิยม</label><label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={unitForm.can_sell} onChange={(event) => setUnitForm((current) => ({ ...current, can_sell: event.target.checked }))} className="size-4 accent-primary-700" />ใช้เป็นหน่วยขาย</label><label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={unitForm.can_receive} onChange={(event) => setUnitForm((current) => ({ ...current, can_receive: event.target.checked }))} className="size-4 accent-primary-700" />ใช้รับเข้า</label></div><div className="flex gap-2"><button type="button" onClick={cancelUnitForm} className="h-10 px-3 text-sm font-medium text-slate-600 hover:bg-white">ยกเลิก</button><button type="button" onClick={() => void saveUnit()} disabled={unitWorking} className="inline-flex h-10 items-center justify-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:bg-slate-300"><Check className="size-4" />{unitWorking ? 'กำลังบันทึก…' : editingUnitId ? 'บันทึกการแก้ไข' : 'เพิ่มหน่วย'}</button></div></div>
                  </div>}
                </>}
              </AccordionSection>

              <AccordionSection title="ราคาตามประเภทลูกค้า" description="กำหนดราคากลางสำหรับสมาชิก ค้าส่ง และตัวแทนจำหน่าย" icon={ReceiptText} open={pricingPanels.customer} onToggle={() => togglePricingPanel('customer')}>
                <div className="overflow-hidden border border-slate-200">
                  <div className="hidden grid-cols-[minmax(0,1fr)_9rem_11rem] bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500 sm:grid"><span>ประเภทลูกค้า</span><span>จำนวนขั้นต่ำ</span><span>ราคาขาย</span></div>
                  {form.price_rules.map((rule) => <div key={rule.customer_type} className="grid gap-4 border-t border-slate-200 p-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_9rem_11rem] sm:items-center">
                    <div className="flex items-start gap-3"><Toggle checked={rule.enabled} onChange={(checked) => updateRule(rule.customer_type, { enabled: checked })} label={`ใช้ราคา${PRICE_LABELS[rule.customer_type].label}`} /><div><p className="text-sm font-medium text-slate-800">{PRICE_LABELS[rule.customer_type].label}</p><p className="mt-0.5 text-xs text-slate-500">{PRICE_LABELS[rule.customer_type].description}</p></div></div>
                    <Field label="จำนวนขั้นต่ำ" hideLabel value={rule.minimum_quantity} onChange={(value) => updateRule(rule.customer_type, { minimum_quantity: value })} type="number" disabled={!rule.enabled} />
                    <Field label="ราคาขาย" hideLabel value={rule.price} onChange={(value) => updateRule(rule.customer_type, { price: value })} type="number" suffix="บาท" disabled={!rule.enabled} required={rule.enabled} />
                  </div>)}
                </div>
              </AccordionSection>

              <AccordionSection title="ราคาเพิ่มเติมตามหน่วยและสาขา" description="กำหนดราคากลางหรือราคาที่ใช้เฉพาะสาขา โดยราคาสาขาจะถูกใช้ก่อนราคากลางอัตโนมัติ" icon={MapPin} open={pricingPanels.branch} onToggle={() => togglePricingPanel('branch')}>
                {!productId ? <div className="flex items-start gap-3 border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600"><CircleHelp className="mt-0.5 size-4 shrink-0 text-slate-400" /><span>บันทึกสินค้าให้เรียบร้อยก่อน แล้วจึงตั้งราคาสาขาได้</span></div> : <>
                  <div className="border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="block text-xs font-medium text-slate-700">ขอบเขตราคา<select value={branchPriceForm.branch_id} onChange={(event) => setBranchPriceForm((current) => ({ ...current, branch_id: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100"><option value="">ทุกสาขา (ราคากลาง)</option>{detail?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                      <label className="block text-xs font-medium text-slate-700">หน่วยขาย<select value={branchPriceForm.unit_id} onChange={(event) => setBranchPriceForm((current) => ({ ...current, unit_id: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100"><option value="">เลือกหน่วย</option>{detail?.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</select></label>
                      <label className="block text-xs font-medium text-slate-700">ประเภทลูกค้า<select value={branchPriceForm.customer_type} onChange={(event) => setBranchPriceForm((current) => ({ ...current, customer_type: event.target.value as PriceCustomerType }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100">{Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label className="block text-xs font-medium text-slate-700">จำนวนขั้นต่ำ<input type="number" min="0" step="0.001" value={branchPriceForm.minimum_quantity} onChange={(event) => setBranchPriceForm((current) => ({ ...current, minimum_quantity: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                      <label className="block text-xs font-medium text-slate-700">ราคาขาย<input type="number" min="0" step="0.01" value={branchPriceForm.price} onChange={(event) => setBranchPriceForm((current) => ({ ...current, price: event.target.value }))} placeholder="เช่น 125" className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label>
                      <div className="flex items-end"><button type="button" onClick={() => void addBranchPrice()} disabled={priceWorking} className="inline-flex h-10 w-full items-center justify-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:bg-slate-300">{priceWorking ? 'กำลังบันทึก…' : branchPriceForm.branch_id ? 'บันทึกราคาสาขา' : 'บันทึกราคากลาง'}</button></div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-700">เริ่มมีผล (ถ้ามี)<input type="datetime-local" value={branchPriceForm.starts_at} onChange={(event) => setBranchPriceForm((current) => ({ ...current, starts_at: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-xs outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label><label className="block text-xs font-medium text-slate-700">สิ้นสุด (ถ้ามี)<input type="datetime-local" value={branchPriceForm.ends_at} onChange={(event) => setBranchPriceForm((current) => ({ ...current, ends_at: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-xs outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100" /></label></div>
                  </div>
                  <div className="mt-4 overflow-x-auto border border-slate-200"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr><th className="px-4 py-3">ขอบเขต</th><th className="px-4 py-3">หน่วย</th><th className="px-4 py-3">ประเภทลูกค้า</th><th className="px-4 py-3 text-right">ขั้นต่ำ</th><th className="px-4 py-3 text-right">ราคา</th><th className="px-4 py-3">ช่วงเวลา</th></tr></thead><tbody>{detail?.prices.filter((price) => price.branch_id || price.product_unit_id !== detail.units.find((unit) => unit.is_default)?.id).map((price) => <tr key={price.id} className="border-t border-slate-100"><td className="px-4 py-3"><span>{price.branch_id ? detail.branches.find((branch) => branch.id === price.branch_id)?.name || 'ไม่พบสาขา' : 'ทุกสาขา (ราคากลาง)'}</span>{price.is_inventory_default ? <span className="ml-2 inline-flex bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">ราคาหลักสาขา</span> : null}</td><td className="px-4 py-3">{detail.units.find((unit) => unit.id === price.product_unit_id)?.name || '-'}</td><td className="px-4 py-3">{PRICE_TYPE_LABELS[price.customer_type]}</td><td className="px-4 py-3 text-right tabular-nums">{Number(price.minimum_quantity).toLocaleString('th-TH')}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEditorBaht(price.price)}</td><td className="px-4 py-3 text-xs text-slate-500">{formatPriceWindow(price.starts_at, price.ends_at)}</td></tr>)}{!detail?.prices.some((price) => price.branch_id || price.product_unit_id !== detail.units.find((unit) => unit.is_default)?.id) ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">ยังไม่มีราคาของหน่วยเสริมหรือราคาที่กำหนดเฉพาะสาขา</td></tr> : null}</tbody></table></div>
                </>}
              </AccordionSection>
            </div>
          </div> : null}

          {!loading && section === 'sales' ? <div className="mx-auto max-w-4xl">
            <SectionHeading title="การขายและสต๊อก" description="ตั้งค่าพฤติกรรมของสินค้าใน POS และระบบคลัง" />
            <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
              <SettingRow title="เปิดขายสินค้า" description="แสดงสินค้าในแคตตาล็อกและพร้อมนำไปเปิดขายตามสาขา" checked={form.is_active} onChange={(value) => update('is_active', value)} />
              <SettingRow title="นับสต๊อก" description="การขาย รับเข้า และโอนสินค้าจะบันทึกความเคลื่อนไหวของสต๊อก" checked={form.track_inventory} onChange={(value) => update('track_inventory', value)} />
              <SettingRow title="สินค้าชั่งน้ำหนัก" description="รองรับจำนวนทศนิยม เช่น 0.50 กิโลกรัม" checked={form.is_weighted} onChange={(value) => update('is_weighted', value)} />
              <SettingRow title="อนุญาตราคาขายแยกสาขา" description="ผู้จัดการสาขาที่มีสิทธิ์สามารถกำหนดราคาขายต่างจากราคากลาง" checked={form.allow_branch_price} onChange={(value) => update('allow_branch_price', value)} />
            </div>

            <div className="mt-8 grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">ภาษีสินค้า
                <Select value={form.tax_rate} onChange={(event) => update('tax_rate', event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm">
                  <option value="0">ยกเว้นภาษี / 0%</option>
                  <option value="7">ภาษีมูลค่าเพิ่ม 7%</option>
                </Select>
              </label>
              <Field label="น้ำหนักต่อหน่วย" value={form.weight_kg} onChange={(value) => update('weight_kg', value)} type="number" suffix="กก." icon={Scale} />
              <Field label="พื้นที่ต่อหน่วย" value={form.area_sqm} onChange={(value) => update('area_sqm', value)} type="number" suffix="ตร.ม." />
            </div>
          </div> : null}

          {!loading && section === 'content' ? <div className="mx-auto max-w-4xl">
            <SectionHeading title="รูปและรายละเอียด" description="ตั้งรูปสินค้าแม่ และกำหนดรูปเฉพาะของแต่ละหน่วยขายสำหรับ POS" />
            <div className="mt-5 grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) { setMessage('รูปต้นฉบับต้องมีขนาดไม่เกิน 10 MB'); return; }
                  setImageFile(file); setRemoveImage(false); setMessage('');
                }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative grid aspect-square w-full place-items-center overflow-hidden border border-dashed border-slate-300 bg-slate-50 transition hover:border-primary-700 hover:bg-primary-50/40">
                  {previewUrl || (imageUrl && !removeImage) ? <img src={previewUrl || imageUrl || ''} alt="ตัวอย่างรูปสินค้า" className="h-full w-full object-contain p-5" /> : <span className="flex flex-col items-center text-slate-500"><ImageIcon className="size-10" /><span className="mt-3 text-sm font-medium">เลือกรูปสินค้า</span><span className="mt-1 text-xs">JPG, PNG หรือ WebP</span></span>}
                  <span className="absolute inset-x-0 bottom-0 flex h-11 items-center justify-center gap-2 bg-slate-950/75 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100"><Upload className="size-4" />เปลี่ยนรูป</span>
                </button>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 border border-slate-300 text-sm font-medium text-slate-700 transition hover:border-primary-700 hover:text-primary-800"><Upload className="size-4" />เลือกรูป</button>
                  {(previewUrl || (imageUrl && !removeImage)) ? <button type="button" aria-label="ลบรูป" onClick={() => { setImageFile(null); setRemoveImage(true); }} className="grid size-10 place-items-center border border-slate-300 text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button> : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">ระบบจัดเก็บเป็น WebP ขนาดไม่เกิน 1,200 × 1,200 พิกเซล</p>
              </div>
              <label className="block text-sm font-medium text-slate-700">รายละเอียดสินค้า
                <textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows={15} className="mt-1.5 w-full resize-y border border-slate-300 px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary-700 focus:ring-2 focus:ring-primary-100" placeholder="ข้อมูลสินค้า วิธีใช้ ส่วนประกอบ หรือรายละเอียดที่ต้องการให้พนักงานเห็น" />
                <span className="mt-2 block text-xs font-normal text-slate-500">รายละเอียดนี้ใช้เป็นข้อมูลกลาง และสามารถนำไปแสดงในช่องทางขายออนไลน์ได้</span>
              </label>
            </div>
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-950">รูปตามหน่วยขาย</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-500">กำหนดรูปแยกให้แต่ละหน่วย เช่น กระสอบ ถุง หรือกิโลกรัม รูปนี้จะแสดงบนการ์ดหน่วยนั้นใน POS</p>
                </div>
                <span className="text-xs text-slate-500">{detail?.units.length || 0} หน่วย</span>
              </div>
              {productId && detail ? <div className="mt-4 divide-y divide-slate-200 border border-slate-200 bg-white">
                {detail.units.map((unit) => <UnitImageRow key={unit.id} unit={unit} onChanged={async () => { await refreshDetail(); }} onMessage={setMessage} />)}
              </div> : <div className="mt-4 border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500">บันทึกสินค้าแม่ก่อน จึงจะกำหนดรูปแยกของแต่ละหน่วยได้</div>}
              <p className="mt-2 text-xs leading-5 text-slate-500">หากยังไม่ได้กำหนดรูปเฉพาะ ระบบจะใช้รูปสินค้าแม่เป็นรูปสำรองโดยอัตโนมัติ</p>
            </div>
          </div> : null}
        </div>

        <div className="flex min-h-18 flex-col justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:px-7">
          <p role="status" className={`min-h-5 text-sm ${message ? 'text-red-700' : 'text-slate-500'}`}>{message}</p>
          <div className="flex shrink-0 justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">ยกเลิก</button>
            <button type="submit" disabled={saving || loading} className="inline-flex h-10 min-w-36 items-center justify-center gap-2 bg-primary-800 px-5 text-sm font-semibold text-white transition hover:bg-primary-900 active:translate-y-px disabled:bg-slate-300">
              {saving ? 'กำลังบันทึก…' : <><Check className="size-4" />บันทึกสินค้า</>}
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  </motion.div>;
}

function UnitImageRow({
  unit,
  onChanged,
  onMessage,
}: {
  unit: DetailResponse['units'][number];
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onMessage('เลือกไฟล์รูปภาพ JPG, PNG หรือ WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onMessage('รูปต้นฉบับต้องมีขนาดไม่เกิน 10 MB');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setWorking(true);
    onMessage('');
    try {
      const formData = new FormData();
      formData.set('file', file);
      await catalogFetch(`/api/commerce/catalog/units/${encodeURIComponent(unit.id)}/image`, { method: 'POST', body: formData });
      await onChanged();
      setPreviewUrl(null);
      onMessage(`บันทึกรูปหน่วย “${unit.name}” แล้ว`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'อัปโหลดรูปหน่วยไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (!unit.image_url || !window.confirm(`ต้องการลบรูปเฉพาะของหน่วย “${unit.name}” ใช่หรือไม่?`)) return;
    setWorking(true);
    onMessage('');
    try {
      await catalogFetch(`/api/commerce/catalog/units/${encodeURIComponent(unit.id)}/image`, { method: 'DELETE' });
      await onChanged();
      onMessage(`ลบรูปหน่วย “${unit.name}” แล้ว ระบบจะกลับไปใช้รูปสินค้าแม่`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'ลบรูปหน่วยไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  const imageUrl = previewUrl || unit.image_url;
  return <article className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
    <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">
      {imageUrl ? <img src={imageUrl} alt={`รูปหน่วย ${unit.name}`} className="h-full w-full object-contain p-2" /> : <ImageIcon className="size-7 text-slate-300" />}
      {working ? <span className="absolute inset-0 grid place-items-center bg-white/80 text-[11px] font-medium text-primary-800">กำลังบันทึก</span> : null}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-semibold text-slate-900">{unit.name}</h5>
        {unit.is_default ? <span className="bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800">หน่วยหลัก</span> : null}
        <span className="text-xs text-slate-500">รหัส {unit.code} · เทียบหน่วยหลัก {Number(unit.conversion_to_base).toLocaleString('th-TH')} หน่วย</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{unit.image_url ? 'มีรูปเฉพาะหน่วยแล้ว POS จะแสดงรูปนี้' : 'ยังไม่มีรูปเฉพาะหน่วย POS จะใช้รูปสินค้าแม่'}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={working} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
      <button type="button" disabled={working} onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:border-primary-700 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="size-4" />{unit.image_url ? 'เปลี่ยนรูป' : 'เลือกรูป'}</button>
      {unit.image_url ? <button type="button" aria-label={`ลบรูปหน่วย ${unit.name}`} disabled={working} onClick={() => void remove()} className="grid size-9 place-items-center border border-slate-300 text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" /></button> : null}
    </div>
  </article>;
}

function SectionHeading({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return <div><h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-slate-950`}>{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>;
}

function AccordionSection({ title, description, icon: Icon, open, onToggle, children }: { title: string; description: string; icon: typeof Package; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="overflow-visible border border-slate-200 bg-white">
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5">
      <span className={`grid size-9 shrink-0 place-items-center ${open ? 'bg-primary-50 text-primary-800' : 'bg-slate-50 text-slate-500'}`}><Icon className="size-4.5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span>
      <ChevronDown className={`size-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-primary-800' : ''}`} />
    </button>
    {open ? <div className="border-t border-slate-200 p-4 sm:p-5">{children}</div> : null}
  </section>;
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  suffix,
  icon: Icon,
  hideLabel = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'number';
  placeholder?: string;
  suffix?: string;
  icon?: typeof Package;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  return <label className={`block text-sm font-medium text-slate-700 ${hideLabel ? 'sm:pt-0' : ''}`}>
    <span className={hideLabel ? 'sr-only' : ''}>{label}{required ? <span className="ml-1 text-red-600">*</span> : null}</span>
    <span className={`relative flex h-11 border border-slate-300 bg-white transition focus-within:border-primary-700 focus-within:ring-2 focus-within:ring-primary-100 ${hideLabel ? '' : 'mt-1.5'} ${disabled ? 'bg-slate-50' : ''}`}>
      {Icon ? <Icon className="ml-3 mt-3 size-4 shrink-0 text-slate-400" /> : null}
      <input required={required} disabled={disabled} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.001' : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400 disabled:text-slate-400" />
      {suffix ? <span className="grid min-w-14 place-items-center border-l border-slate-200 bg-slate-50 px-2 text-xs font-normal text-slate-500">{suffix}</span> : null}
    </span>
  </label>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 ${checked ? 'bg-primary-700' : 'bg-slate-300'}`}>
    <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>;
}

function SettingRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-5 py-4"><div><p className="text-sm font-medium text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><Toggle checked={checked} onChange={onChange} label={title} /></div>;
}

function EditorLoading() {
  return <div className="mx-auto max-w-4xl animate-pulse"><div className="h-6 w-40 bg-slate-200" /><div className="mt-3 h-4 w-80 max-w-full bg-slate-100" /><div className="mt-8 grid gap-5 sm:grid-cols-2"><div className="h-16 bg-slate-100" /><div className="h-16 bg-slate-100" /><div className="h-16 bg-slate-100 sm:col-span-2" /><div className="h-16 bg-slate-100" /><div className="h-16 bg-slate-100" /></div></div>;
}

function formatEditorBaht(value: number | string) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatPriceWindow(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return 'ใช้ตลอดเวลา';
  const format = (date: string | null) => date ? new Date(date).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ไม่กำหนด';
  return `${format(startsAt)} – ${format(endsAt)}`;
}
