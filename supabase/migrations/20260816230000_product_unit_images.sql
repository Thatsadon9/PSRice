-- Allow each sellable unit to have its own catalog image.
-- POS falls back to the parent product image when a unit image is not set.

alter table public.product_units add column if not exists image_url text;
alter table public.product_units add column if not exists image_is_permanent boolean not null default true;
