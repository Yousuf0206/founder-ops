-- Founder Ops — Phase 0 foundation
-- Tasks: T0.3 (tables), T0.4 (RLS policies), T0.10 (invitations / join path)
--
-- Constitution VI: workspace_id from the first migration.
-- Plan rule: RLS policies ship in the SAME migration as the table they protect,
-- so no table exists unprotected, even briefly.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'editor', 'viewer');

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 120),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- FR-Q-002: 50 runs/day, counted as runs, reset at UTC midnight, owner-editable.
  daily_run_cap integer not null default 50 check (daily_run_cap >= 0),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created by trigger on signup
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         public.membership_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create index memberships_workspace_id_idx on public.memberships (workspace_id);
create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- SECURITY DEFINER so that policies on `memberships` can consult membership
-- without recursing into their own RLS check.
-- ---------------------------------------------------------------------------

create function public.is_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace
      and m.user_id = auth.uid()
  );
$$;

create function public.has_role(target_workspace uuid, allowed public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace
      and m.user_id = auth.uid()
      and m.role = any(allowed)
  );
$$;

-- Writers = owner or editor. Viewers read only. (US1 scenario 5, T1.7)
create function public.can_write(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(target_workspace, array['owner', 'editor']::public.membership_role[]);
$$;

create function public.is_owner(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(target_workspace, array['owner']::public.membership_role[]);
$$;

-- ---------------------------------------------------------------------------
-- invitations — FR-Q-007: owner invites by email
-- ---------------------------------------------------------------------------

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         public.membership_role not null default 'viewer',
  token        text not null unique,
  invited_by   uuid not null references public.profiles (id) on delete restrict,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index invitations_workspace_id_idx on public.invitations (workspace_id);
create unique index invitations_pending_email_key
  on public.invitations (workspace_id, lower(email))
  where accepted_at is null;

-- Accepting an invitation is the ONLY way a membership is created outside the
-- seed script. SECURITY DEFINER so the invitee — who is not yet a member and so
-- cannot see the workspace — can still redeem a token addressed to their email.
create function public.accept_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select email into caller_email from public.profiles where id = auth.uid();

  select * into invite
  from public.invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if invite.id is null then
    raise exception 'invitation not found, already accepted, or expired';
  end if;

  -- The invite is addressed to an email; only that person may redeem it.
  if lower(invite.email) <> lower(caller_email) then
    raise exception 'invitation is addressed to a different account';
  end if;

  insert into public.memberships (user_id, workspace_id, role)
  values (auth.uid(), invite.workspace_id, invite.role)
  on conflict (user_id, workspace_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invite.id;

  return invite.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The rule, everywhere: a user reaches a row only when a membership row links
-- them to that row's workspace_id. (Constitution V, FR-S-001, SC-003)
-- ---------------------------------------------------------------------------

alter table public.workspaces  enable row level security;
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

-- Force RLS so even a table owner connecting directly is subject to it.
alter table public.workspaces  force row level security;
alter table public.profiles    force row level security;
alter table public.memberships force row level security;
alter table public.invitations force row level security;

-- workspaces ----------------------------------------------------------------
-- FR-Q-006: creation is seed/admin only, so there is no INSERT policy for
-- authenticated users. The seed script uses the service-role key, which
-- bypasses RLS by design.

create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_member(id));

create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using (public.is_owner(id))
  with check (public.is_owner(id));

-- profiles ------------------------------------------------------------------
-- A user sees their own profile, plus the profiles of people they share a
-- workspace with (so member lists can render names).

create policy profiles_select_self_or_covisible on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid()
        and theirs.user_id = public.profiles.id
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- memberships ---------------------------------------------------------------

create policy memberships_select_member on public.memberships
  for select to authenticated
  using (public.is_member(workspace_id));

create policy memberships_insert_owner on public.memberships
  for insert to authenticated
  with check (public.is_owner(workspace_id));

create policy memberships_update_owner on public.memberships
  for update to authenticated
  using (public.is_owner(workspace_id))
  with check (public.is_owner(workspace_id));

create policy memberships_delete_owner on public.memberships
  for delete to authenticated
  using (public.is_owner(workspace_id));

-- invitations ---------------------------------------------------------------
-- Members see their workspace's invitations; only owners create or revoke them.
-- Redemption goes through accept_invitation(), not through a SELECT policy.

create policy invitations_select_member on public.invitations
  for select to authenticated
  using (public.is_member(workspace_id));

create policy invitations_insert_owner on public.invitations
  for insert to authenticated
  with check (public.is_owner(workspace_id) and invited_by = auth.uid());

create policy invitations_delete_owner on public.invitations
  for delete to authenticated
  using (public.is_owner(workspace_id));

-- ---------------------------------------------------------------------------
-- Grants — RLS decides row visibility; these decide table reachability.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, update on public.workspaces to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, delete on public.invitations to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.can_write(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
