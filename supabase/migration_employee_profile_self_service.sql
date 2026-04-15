-- ==========================================
-- WorkFlow Pro - Employee Profile Self Service
-- Personal profile fields, secure document storage,
-- and employee-managed account data.
-- Run this in the Supabase SQL Editor.
-- ==========================================

alter table public.users
  add column if not exists address text,
  add column if not exists citizen_id text,
  add column if not exists citizen_id_card_path text,
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_book_path text;

create unique index if not exists users_citizen_id_key
  on public.users(citizen_id)
  where citizen_id is not null;
