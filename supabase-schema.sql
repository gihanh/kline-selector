-- Kline Facility Allocation Tool — Supabase Database Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → paste → Run

create table if not exists allocations (
  id              bigserial primary key,
  created_at      timestamptz default now(),
  client_name     text,
  account_mgr     text,
  country         text,
  preferred_facility  text,
  allocated_facility  text,
  volume          text,
  category        text,
  submitted_by    text,
  status          text default 'Pending',
  notes           text,
  case_url        text,
  crm_contact_id  text,
  full_data       text
);

-- Allow the service role key to read and write (used by the API route)
-- No extra RLS needed since we use the service_role key server-side only
