'use client';

import Select, { type SelectOption } from '@/components/ui/Select';
import type { CommerceProduct, CommerceUnit } from '@/lib/commerce';
import { commerceUnitImage } from '@/components/commerce/CommerceProductPicker';

type CommerceUnitPickerProps = {
  units: CommerceUnit[];
  product?: CommerceProduct;
  value?: string;
  onValueChange: (unitId: string, unit: CommerceUnit | undefined) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
  showStock?: boolean;
};

function conversionLabel(unit: CommerceUnit, units: CommerceUnit[]) {
  if (unit.isDefault || unit.conversionToBase === 1) return 'หน่วยหลัก';
  const baseUnit = units.find((candidate) => candidate.isDefault) || units.find((candidate) => candidate.conversionToBase === 1);
  return baseUnit ? `1 ${unit.name} = ${unit.conversionToBase} ${baseUnit.name}` : `เท่ากับ ${unit.conversionToBase} หน่วยหลัก`;
}

export function buildCommerceUnitOptions(
  units: CommerceUnit[],
  product?: CommerceProduct,
  showStock = false,
): SelectOption[] {
  return units.map((unit) => ({
    value: unit.id,
    label: unit.name,
    description: [
      unit.code,
      conversionLabel(unit, units),
      showStock && typeof unit.onHand === 'number' ? `คงเหลือ ${unit.onHand}` : null,
      unit.canSell === false ? 'ไม่เปิดขาย' : null,
      unit.canReceive === false ? 'ไม่รับเข้า' : null,
    ].filter(Boolean).join(' · '),
    searchText: [unit.name, unit.code, unit.barcode, product?.name, product?.sku].filter(Boolean).join(' '),
    avatarUrl: commerceUnitImage(unit, product),
    visualShape: 'square',
  }));
}

export default function CommerceUnitPicker({
  units,
  product,
  value = '',
  onValueChange,
  placeholder = 'เลือกหน่วย',
  emptyText = 'สินค้านี้ยังไม่มีหน่วยให้เลือก',
  showStock = false,
  ...props
}: CommerceUnitPickerProps) {
  const options = buildCommerceUnitOptions(units, product, showStock);
  return (
    <Select
      {...props}
      value={value}
      placeholder={placeholder}
      options={options}
      searchable={options.length > 8}
      shape="square"
      emptyText={emptyText}
      onValueChange={(nextValue) => {
        onValueChange(nextValue, units.find((unit) => unit.id === nextValue));
      }}
    />
  );
}
