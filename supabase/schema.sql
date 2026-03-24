-- CallTime AI Database Schema
-- Run this in the Supabase SQL Editor to set up all tables

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Organizations
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('campaign', 'nonprofit', 'committee')),
  created_at timestamptz not null default now()
);

-- Users (extends Supabase auth.users)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null default 'caller' check (role in ('admin', 'caller', 'director')),
  created_at timestamptz not null default now()
);

-- Contacts
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  name text not null,
  phone text not null,
  email text,
  occupation text,
  employer text,
  notes text,
  estimated_wealth_tier text check (estimated_wealth_tier in ('low', 'mid', 'high', 'very_high')),
  ai_recommended_ask numeric,
  manual_ask_override numeric,
  source text not null default 'manual' check (source in ('google_contacts', 'csv', 'linkedin', 'vcard', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessions (call time blocks)
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references users(id),
  name text not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed')),
  created_at timestamptz not null default now()
);

-- Session callers (who is assigned to call in this session)
create table session_callers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references users(id),
  unique(session_id, user_id)
);

-- Session contacts (the call queue for a session)
create table session_contacts (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  assigned_caller_id uuid references users(id),
  call_order integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'completed', 'skipped')),
  unique(session_id, contact_id)
);

-- Calls (individual call records)
create table calls (
  id uuid primary key default uuid_generate_v4(),
  session_contact_id uuid not null references session_contacts(id) on delete cascade,
  caller_id uuid not null references users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  transcript_raw text,
  ai_summary text,
  ai_outcome text check (ai_outcome in ('pledged', 'declined', 'callback', 'voicemail', 'wrong_number', 'no_answer', 'event_rsvp')),
  ai_pledge_amount numeric,
  ai_personal_details text,
  ai_action_items text,
  ai_ask_made boolean,
  ai_ask_amount numeric,
  follow_up_draft text,
  follow_up_sent boolean not null default false,
  follow_up_sent_at timestamptz,
  confirmed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

-- Pledges
create table pledges (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references calls(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  amount numeric not null,
  status text not null default 'outstanding' check (status in ('outstanding', 'fulfilled', 'overdue')),
  pledged_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  reminder_count integer not null default 0
);

-- Indexes for common queries
create index idx_contacts_org on contacts(organization_id);
create index idx_contacts_uploaded_by on contacts(uploaded_by);
create index idx_sessions_org on sessions(organization_id);
create index idx_sessions_status on sessions(status);
create index idx_session_contacts_session on session_contacts(session_id);
create index idx_session_contacts_status on session_contacts(status);
create index idx_calls_caller on calls(caller_id);
create index idx_calls_session_contact on calls(session_contact_id);
create index idx_pledges_org on pledges(organization_id);
create index idx_pledges_status on pledges(status);
create index idx_pledges_contact on pledges(contact_id);

-- Row Level Security policies
alter table organizations enable row level security;
alter table users enable row level security;
alter table contacts enable row level security;
alter table sessions enable row level security;
alter table session_callers enable row level security;
alter table session_contacts enable row level security;
alter table calls enable row level security;
alter table pledges enable row level security;

-- Users can only see their own org's data
create policy "Users see own org" on organizations
  for select using (id in (select organization_id from users where id = auth.uid()));

create policy "Users see own profile and org members" on users
  for select using (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users see own org contacts" on contacts
  for select using (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users can insert contacts to own org" on contacts
  for insert with check (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users can update own org contacts" on contacts
  for update using (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users see own org sessions" on sessions
  for select using (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Admins can create sessions" on sessions
  for insert with check (organization_id in (
    select organization_id from users where id = auth.uid() and role in ('admin', 'director')
  ));

create policy "Users see own org session callers" on session_callers
  for select using (session_id in (
    select id from sessions where organization_id in (
      select organization_id from users where id = auth.uid()
    )
  ));

create policy "Users see own org session contacts" on session_contacts
  for select using (session_id in (
    select id from sessions where organization_id in (
      select organization_id from users where id = auth.uid()
    )
  ));

create policy "Users can update session contacts they're assigned to" on session_contacts
  for update using (session_id in (
    select id from sessions where organization_id in (
      select organization_id from users where id = auth.uid()
    )
  ));

create policy "Users see own org calls" on calls
  for select using (caller_id in (
    select id from users where organization_id in (
      select organization_id from users where id = auth.uid()
    )
  ));

create policy "Callers can insert calls" on calls
  for insert with check (caller_id = auth.uid());

create policy "Callers can update own calls" on calls
  for update using (caller_id = auth.uid());

create policy "Users see own org pledges" on pledges
  for select using (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users can insert pledges to own org" on pledges
  for insert with check (organization_id in (select organization_id from users where id = auth.uid()));

create policy "Users can update own org pledges" on pledges
  for update using (organization_id in (select organization_id from users where id = auth.uid()));

-- Function to auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();

-- Enable realtime for session monitoring
alter publication supabase_realtime add table session_contacts;
alter publication supabase_realtime add table calls;
alter publication supabase_realtime add table sessions;
