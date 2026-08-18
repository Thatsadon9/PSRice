-- Keep every document type used by Commerce after the online-order migration.
-- That migration recreated this check without goods_receipt, which caused both
-- PO receiving and direct goods receiving to roll back before stock was updated.
alter table public.commerce_document_counters
  drop constraint if exists commerce_document_counters_document_type_check;

alter table public.commerce_document_counters
  add constraint commerce_document_counters_document_type_check
  check (document_type in ('sale', 'return', 'purchase', 'goods_receipt', 'transfer', 'online_order'));
