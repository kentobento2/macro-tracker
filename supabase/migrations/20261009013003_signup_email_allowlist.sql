-- Only invited emails can create an account. The list lives in a private schema that the
-- Data API doesn't expose; add/remove rows from the Supabase SQL editor. (Emails are not
-- checked into this public repo.)
--
--   insert into private.allowed_emails (email) values ('someone@example.com');
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_emails (
  email text primary key check (email = lower(email))
);
revoke all on private.allowed_emails from public, anon, authenticated;

create function private.enforce_email_allowlist() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from private.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Sign-up is limited to invited accounts' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_email_allowlist() from public, anon, authenticated;

create trigger enforce_email_allowlist
  before insert or update of email on auth.users
  for each row execute function private.enforce_email_allowlist();
