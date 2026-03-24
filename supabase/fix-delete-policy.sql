-- Add missing delete policy for contacts
create policy "Users can delete own org contacts" on contacts
  for delete to authenticated using (
    organization_id in (select organization_id from users where id = auth.uid())
  );
