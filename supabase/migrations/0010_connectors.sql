-- Lumo-Ops v2 — Phase 2: connected accounts (OAuth)
-- Tasks (specs/002-growth-platform-core/tasks.md): T2.1
-- Spec: US2 AC1–AC3, FR-P-001, FR-P-007, NFR-005; plan D7 (application-level AEAD)
--
-- Token material arrives ALREADY ENCRYPTED (AES-256-GCM, lib/connectors/tokens.ts).
-- The database never sees a plaintext token, and `authenticated` cannot read
-- the token columns at all: it is granted column-level SELECT on everything
-- else. A client `select("*")` on this table therefore fails by design — list
-- columns explicitly. Only the service role (the publish executor) reads tokens.

create table public.connected_accounts (
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,
  id                      uuid primary key default gen_random_uuid(),
  platform                text not null check (platform in ('linkedin', 'facebook', 'instagram')),
  external_account_id     text not null check (length(external_account_id) between 1 and 200),
  display_name            text not null default '',
  scopes                  text[] not null default '{}',
  access_token_encrypted  text,
  refresh_token_encrypted text,
  expires_at              timestamptz,
  refresh_expires_at      timestamptz,
  -- Decisions §4: auto publishing only to accounts explicitly enabled for it.
  auto_enabled            boolean not null default false,
  status                  text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  connected_by            uuid references public.profiles (id) on delete set null,
  revoked_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint connected_accounts_revoked_holds_no_token
    check (revoked_at is null or (access_token_encrypted is null and refresh_token_encrypted is null)),
  constraint connected_accounts_tokens_are_sealed
    check (
      (access_token_encrypted is null or access_token_encrypted like 'v1.%')
      and (refresh_token_encrypted is null or refresh_token_encrypted like 'v1.%')
    )
);

create unique index connected_accounts_active_key
  on public.connected_accounts (workspace_id, platform, external_account_id)
  where revoked_at is null;

create index connected_accounts_workspace_idx on public.connected_accounts (workspace_id);

create trigger connected_accounts_touch_updated_at
  before update on public.connected_accounts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security and column privileges
-- ---------------------------------------------------------------------------

alter table public.connected_accounts enable row level security;
alter table public.connected_accounts force row level security;

create policy connected_accounts_select_member on public.connected_accounts
  for select to authenticated
  using (public.is_member(workspace_id));

-- The only direct write a client may make: an owner toggling auto_enabled
-- (decisions §4, Safety level High). Column grant below limits it to that column.
create policy connected_accounts_update_owner on public.connected_accounts
  for update to authenticated
  using (public.is_owner(workspace_id))
  with check (public.is_owner(workspace_id));

-- Supabase grants new tables to anon/authenticated by default; take that back
-- and grant only the non-secret columns.
revoke all on public.connected_accounts from anon, authenticated;

grant select (
  workspace_id, id, platform, external_account_id, display_name, scopes, expires_at,
  auto_enabled, status, connected_by, revoked_at, created_at, updated_at
) on public.connected_accounts to authenticated;

grant update (auto_enabled) on public.connected_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_connected_account() — the OAuth callback's single write
--
-- Runs as the signed-in owner (not the service role), so the owner check is
-- the database's, not the route's. Reconnecting the same external account
-- refreshes its tokens instead of creating a second row.
-- ---------------------------------------------------------------------------

create function public.upsert_connected_account(
  p_workspace               uuid,
  p_platform                text,
  p_external_account_id     text,
  p_display_name            text,
  p_scopes                  text[],
  p_access_token_encrypted  text,
  p_refresh_token_encrypted text default null,
  p_expires_at              timestamptz default null,
  p_refresh_expires_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid;
begin
  if not public.is_owner(p_workspace) then
    raise exception 'only an owner can connect accounts' using errcode = '42501';
  end if;

  if p_access_token_encrypted is null then
    raise exception 'an access token is required';
  end if;

  select id into account_id
  from public.connected_accounts
  where workspace_id = p_workspace
    and platform = p_platform
    and external_account_id = p_external_account_id
    and revoked_at is null
  for update;

  if account_id is null then
    insert into public.connected_accounts (
      workspace_id, platform, external_account_id, display_name, scopes,
      access_token_encrypted, refresh_token_encrypted, expires_at, refresh_expires_at,
      connected_by
    )
    values (
      p_workspace, p_platform, p_external_account_id, coalesce(p_display_name, ''),
      coalesce(p_scopes, '{}'), p_access_token_encrypted, p_refresh_token_encrypted,
      p_expires_at, p_refresh_expires_at, auth.uid()
    )
    returning id into account_id;
  else
    update public.connected_accounts
    set display_name = coalesce(p_display_name, display_name),
        scopes = coalesce(p_scopes, scopes),
        access_token_encrypted = p_access_token_encrypted,
        refresh_token_encrypted = p_refresh_token_encrypted,
        expires_at = p_expires_at,
        refresh_expires_at = p_refresh_expires_at,
        status = 'active',
        connected_by = auth.uid()
    where id = account_id;
  end if;

  perform public.write_audit(
    p_workspace, 'connector.connected', 'connected_account', account_id,
    jsonb_build_object(
      'platform', p_platform,
      'external_account_id', p_external_account_id,
      'scopes', to_jsonb(coalesce(p_scopes, '{}'))
    )
  );

  return account_id;
end;
$$;

revoke all on function public.upsert_connected_account(
  uuid, text, text, text, text[], text, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.upsert_connected_account(
  uuid, text, text, text, text[], text, text, timestamptz, timestamptz
) to authenticated;
