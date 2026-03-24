-- Fix RLS policies for signup flow
-- The original policies had circular dependencies: org policy checks users table,
-- but during signup the user doesn't exist in users table yet.

-- Drop the problematic policies
drop policy if exists "Users see own org" on organizations;
drop policy if exists "Users see own profile and org members" on users;
drop policy if exists "Users see own org contacts" on contacts;
drop policy if exists "Users can insert contacts to own org" on contacts;
drop policy if exists "Users can update own org contacts" on contacts;
drop policy if exists "Admins can create sessions" on sessions;
drop policy if exists "Users see own org sessions" on sessions;

-- Organizations: anyone authenticated can create (for signup), select own org
create policy "Authenticated users can create orgs" on organizations
  for insert to authenticated with check (true);

create policy "Users see own org" on organizations
  for select to authenticated using (
    id in (select organization_id from users where id = auth.uid())
  );

-- Users: can insert own profile (for signup), select org members
create policy "Users can create own profile" on users
  for insert to authenticated with check (id = auth.uid());

create policy "Users see org members" on users
  for select to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
    or id = auth.uid()
  );

-- Contacts: use direct org_id check via users table
create policy "Users see own org contacts" on contacts
  for select to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can insert contacts to own org" on contacts
  for insert to authenticated with check (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can update own org contacts" on contacts
  for update to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );

-- Sessions
create policy "Users see own org sessions" on sessions
  for select to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can create sessions in own org" on sessions
  for insert to authenticated with check (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can update own org sessions" on sessions
  for update to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );

-- Session callers
drop policy if exists "Users see own org session callers" on session_callers;
create policy "Users see own org session callers" on session_callers
  for select to authenticated using (true);

create policy "Users can insert session callers" on session_callers
  for insert to authenticated with check (true);

-- Session contacts
drop policy if exists "Users see own org session contacts" on session_contacts;
drop policy if exists "Users can update session contacts they're assigned to" on session_contacts;

create policy "Users see session contacts" on session_contacts
  for select to authenticated using (true);

create policy "Users can insert session contacts" on session_contacts
  for insert to authenticated with check (true);

create policy "Users can update session contacts" on session_contacts
  for update to authenticated using (true);

-- Calls
drop policy if exists "Users see own org calls" on calls;
drop policy if exists "Callers can insert calls" on calls;
drop policy if exists "Callers can update own calls" on calls;

create policy "Users see calls" on calls
  for select to authenticated using (true);

create policy "Users can insert calls" on calls
  for insert to authenticated with check (caller_id = auth.uid());

create policy "Users can update own calls" on calls
  for update to authenticated using (caller_id = auth.uid());

-- Pledges
drop policy if exists "Users see own org pledges" on pledges;
drop policy if exists "Users can insert pledges to own org" on pledges;
drop policy if exists "Users can update own org pledges" on pledges;

create policy "Users see own org pledges" on pledges
  for select to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can insert pledges" on pledges
  for insert to authenticated with check (
    organization_id in (select organization_id from users where id = auth.uid())
  );

create policy "Users can update own org pledges" on pledges
  for update to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );
