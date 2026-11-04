create table generation_batches (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 requested_count integer not null,
 skipped jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now()
);
create table generation_batch_items (
 batch_id uuid not null references generation_batches(id) on delete cascade,
 business_id uuid references businesses(id) on delete set null,
 business_name text not null,
 position integer not null,
 job_id uuid references automation_jobs(id) on delete set null,
 reused boolean not null default false,
 primary key(batch_id,position)
);
create index generation_batch_items_job on generation_batch_items(job_id);
create index generation_batch_items_business on generation_batch_items(business_id);
alter table generated_websites add column creative_brief jsonb;
alter table generation_batches enable row level security;
alter table generation_batch_items enable row level security;

alter table website_orders add column stripe_customer_id text;
alter table website_orders add column buyer_email text;
create table website_hosting (
 order_id uuid primary key references website_orders(id) on delete cascade,
 checkout_attempt uuid not null default gen_random_uuid(),
 checkout_session_id text unique,
 checkout_url text,
 checkout_params jsonb,
 stripe_customer_id text,
 stripe_subscription_id text unique,
 subscription_status text not null default 'none',
 subscription_checked_at timestamptz,
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 monthly_price_cents integer check(monthly_price_cents>=50),
 currency text,
 publish_requested boolean not null default false,
 provider_type text not null default 'unconfigured',
 provider_site_id text unique,
 provider_site_url text,
 deploy_id text,
 deploy_status text not null default 'DRAFT' check(deploy_status in ('DRAFT','QUEUED','DEPLOYING','READY','ERROR','SUSPENDED')),
 deploy_url text,
 domain text unique,
 domain_challenge text,
 domain_requested_at timestamptz,
 domain_status text not null default 'NONE',
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create trigger website_hosting_touch before update on website_hosting for each row execute function pf_touch_updated_at();
alter table website_hosting enable row level security;
create table workspace_achievements(code text primary key,xp integer not null check(xp>0),earned_at timestamptz not null default now());
alter table workspace_achievements enable row level security;
