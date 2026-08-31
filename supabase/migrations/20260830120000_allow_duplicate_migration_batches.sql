-- Temporarily allow the same source file to be uploaded as multiple migration
-- batches while the POSVis migration flow is being debugged.
alter table public.migration_batches
  drop constraint if exists migration_batches_source_system_checksum_data_type_key;
