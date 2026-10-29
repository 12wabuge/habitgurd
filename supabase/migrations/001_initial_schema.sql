create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid generated always as (id) stored unique,
  display_name text not null default '',
  timezone text not null default 'UTC',
  theme text not null default 'light' check (theme in ('light', 'dark')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  habit_type text not null default 'positive' check (habit_type = 'positive'),
  category text not null default 'Personal',
  icon text not null default '',
  color text not null default '#39775c',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays', 'weekly', 'monthly', 'custom')),
  selected_weekdays smallint[] not null default '{}',
  target_value numeric check (target_value is null or target_value > 0),
  target_unit text not null default '',
  reminder_time time,
  start_date date not null default current_date,
  end_date date,
  priority text not null default 'steady',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (end_date is null or end_date >= start_date),
  check (selected_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);
create index habits_user_status_idx on public.habits(user_id, status);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  scheduled_date date not null,
  status text not null check (status in ('pending', 'in-progress', 'completed', 'skipped')),
  actual_value numeric check (actual_value is null or actual_value >= 0),
  note text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, scheduled_date),
  foreign key (user_id, habit_id) references public.habits(user_id, id) on delete cascade,
  check (status <> 'completed' or completed_at is not null)
);
create index habit_logs_user_date_idx on public.habit_logs(user_id, scheduled_date desc);

create table public.unwanted_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  category text not null default 'Personal',
  start_date date not null default current_date,
  personal_reason text not null default '',
  triggers text[] not null default '{}',
  prevention_plan jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index unwanted_habits_user_status_idx on public.unwanted_habits(user_id, status);

create table public.urge_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unwanted_habit_id uuid not null,
  occurred_at timestamptz not null default now(),
  intensity smallint not null check (intensity between 1 and 10),
  triggers text[] not null default '{}',
  mood text not null default '',
  resisted boolean not null default false,
  coping_strategy text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (user_id, unwanted_habit_id) references public.unwanted_habits(user_id, id) on delete cascade
);
create index urge_logs_user_time_idx on public.urge_logs(user_id, occurred_at desc);

create table public.unwanted_habit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unwanted_habit_id uuid not null,
  occurred_at timestamptz not null,
  trigger text not null default '',
  context text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (user_id, unwanted_habit_id) references public.unwanted_habits(user_id, id) on delete cascade
);
create index unwanted_events_user_time_idx on public.unwanted_habit_events(user_id, occurred_at desc);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  goal_type text not null default 'custom',
  target_value numeric not null check (target_value > 0),
  current_value numeric not null default 0 check (current_value >= 0),
  start_date date not null default current_date,
  target_date date,
  status text not null default 'active' check (status in ('active', 'complete', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_status_idx on public.goals(user_id, status);

create table public.daily_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_date date not null,
  mood text not null default '',
  reflection text not null default '',
  gratitude text not null default '',
  tomorrow_priority text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, journal_date)
);
create index daily_journals_user_date_idx on public.daily_journals(user_id, journal_date desc);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid,
  reminder_type text not null check (reminder_type in ('habit', 'daily_review', 'evening_reflection')),
  reminder_time time not null,
  timezone text not null default 'UTC',
  enabled boolean not null default false,
  quiet_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, habit_id) references public.habits(user_id, id) on delete cascade
);
create index reminders_user_enabled_idx on public.reminders(user_id, enabled);

-- Every user-owned table is restricted to the authenticated owner.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'habits', 'habit_logs', 'unwanted_habits', 'urge_logs', 'unwanted_habit_events', 'goals', 'daily_journals', 'reminders'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
