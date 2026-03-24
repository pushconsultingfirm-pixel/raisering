-- Fix circular RLS policy on the users table.
--
-- The old policy "Users see org members" does a subquery on the users table
-- while that same table has RLS enabled, creating a circular dependency.
-- Replace it with a simple policy: a user can always read their own row
-- (id = auth.uid()), and can also read rows that share the same
-- organization_id. To break the circularity, we use two separate policies:
-- one for "own row" (no subquery needed) and one for "same org" that uses
-- a security-definer function to bypass RLS on the inner lookup.

-- Step 1: Create a security-definer function that bypasses RLS
-- to get the current user's organization_id.
create or replace function public.get_my_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid();
$$;

-- Step 2: Drop the old policies on the users table
drop policy if exists "Users see org members" on users;
drop policy if exists "Users see own profile and org members" on users;

-- Step 3: Create non-circular policies
-- Policy 1: Users can always read their own row
create policy "Users can read own row" on users
  for select to authenticated using (id = auth.uid());

-- Policy 2: Users can read org members via the security-definer function
create policy "Users can read org members" on users
  for select to authenticated using (
    organization_id = public.get_my_organization_id()
  );

-- Step 4: Also fix the organizations select policy (same circular issue)
drop policy if exists "Users see own org" on organizations;
create policy "Users see own org" on organizations
  for select to authenticated using (
    id = public.get_my_organization_id()
  );

-- Step 5: Fix contacts policies that also use the circular subquery
drop policy if exists "Users see own org contacts" on contacts;
create policy "Users see own org contacts" on contacts
  for select to authenticated using (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can insert contacts to own org" on contacts;
create policy "Users can insert contacts to own org" on contacts
  for insert to authenticated with check (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can update own org contacts" on contacts;
create policy "Users can update own org contacts" on contacts
  for update to authenticated using (
    organization_id = public.get_my_organization_id()
  );

-- Step 6: Fix sessions policies
drop policy if exists "Users see own org sessions" on sessions;
create policy "Users see own org sessions" on sessions
  for select to authenticated using (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can create sessions in own org" on sessions;
create policy "Users can create sessions in own org" on sessions
  for insert to authenticated with check (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can update own org sessions" on sessions;
create policy "Users can update own org sessions" on sessions
  for update to authenticated using (
    organization_id = public.get_my_organization_id()
  );

-- Step 7: Fix pledges policies
drop policy if exists "Users see own org pledges" on pledges;
create policy "Users see own org pledges" on pledges
  for select to authenticated using (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can insert pledges" on pledges;
create policy "Users can insert pledges" on pledges
  for insert to authenticated with check (
    organization_id = public.get_my_organization_id()
  );

drop policy if exists "Users can update own org pledges" on pledges;
create policy "Users can update own org pledges" on pledges
  for update to authenticated using (
    organization_id = public.get_my_organization_id()
  );
