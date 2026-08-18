'use client';

import Select, { type SelectOption } from '@/components/ui/Select';
import type { CommerceProduct, CommerceUnit } from '@/lib/commerce';

type CommerceProductPickerProps = {
  products: CommerceProduct[];
  value?: string;
  onValueChange: (productId: string, product: CommerceProduct | undefined) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
};

function productSearchText(product: CommerceProduct) {
  return [
    product.name,
    product.sku,
    product.barcode,
    ...(product.barcodes || []),
    product.brand,
    product.categoryName,
  ].filter(Boolean).join(' ');
}

function productDescription(product: CommerceProduct) {
  return [product.brand, product.categoryName, product.units.length ? `${product.units.length} หน่วย` : null]
    .filter(Boolean)
    .join(' · ');
}

export function buildCommerceProductOptions(products: CommerceProduct[]): SelectOption[] {
  return products.map((product) => ({
    value: product.id,
    label: product.sku ? `${product.sku} — ${product.name}` : product.name,
    description: productDescription(product),
    searchText: productSearchText(product),
    avatarUrl: product.imageUrl,
    visualShape: 'square',
  }));
}

export function commerceUnitImage(unit: CommerceUnit, product?: CommerceProduct) {
  return unit.imageUrl || product?.imageUrl || null;
}

export default function CommerceProductPicker({
  products,
  value = '',
  onValueChange,
  placeholder = 'เลือกสินค้า',
  emptyText = 'ไม่พบสินค้า ลองค้นด้วยชื่อ, SKU หรือบาร์โค้ด',
  ...props
}: CommerceProductPickerProps) {
  const options = buildCommerceProductOptions(products);
  return (
    <Select
      {...props}
      value={value}
      placeholder={placeholder}
      options={options}
      searchable
      shape="square"
      emptyText={emptyText}
      onValueChange={(nextValue) => {
        onValueChange(nextValue, products.find((product) => product.id === nextValue));
      }}
    />
  );
}
