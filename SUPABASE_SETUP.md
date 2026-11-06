-- Run this once in Supabase SQL Editor.
create table if not exists public.attendance_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.attendance_profiles enable row level security;

drop policy if exists "Users can read their own attendance profile" on public.attendance_profiles;
create policy "Users can read their own attendance profile"
  on public.attendance_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own attendance profile" on public.attendance_profiles;
create policy "Users can insert their own attendance profile"
  on public.attendance_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own attendance profile" on public.attendance_profiles;
create policy "Users can update their own attendance profile"
  on public.attendance_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.attendance_profiles to authenticated;
