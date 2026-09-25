create table if not exists public.blog_posts (
  id text primary key,
  slug text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('published', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_created_at_idx
  on public.blog_posts (status, created_at desc);

create table if not exists public.site_settings (
  id text primary key default 'default' check (id = 'default'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_credentials (
  id text primary key default 'default' check (id = 'default'),
  username text,
  password_hash text not null,
  password_salt text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_cms_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
before update on public.blog_posts
for each row execute function public.set_cms_updated_at();

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute function public.set_cms_updated_at();

drop trigger if exists admin_credentials_set_updated_at on public.admin_credentials;
create trigger admin_credentials_set_updated_at
before update on public.admin_credentials
for each row execute function public.set_cms_updated_at();

alter table public.blog_posts enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_credentials enable row level security;

revoke all on public.blog_posts from anon, authenticated;
revoke all on public.site_settings from anon, authenticated;
revoke all on public.admin_credentials from anon, authenticated;

grant all on public.blog_posts to service_role;
grant all on public.site_settings to service_role;
grant all on public.admin_credentials to service_role;
