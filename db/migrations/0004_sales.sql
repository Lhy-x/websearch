alter table generated_websites add column deleted_at timestamptz;
create table website_orders (
 id uuid primary key default gen_random_uuid(),
 website_id uuid references generated_websites(id) on delete set null,
 business_id uuid references businesses(id) on delete set null,
 business_name text not null,
 version integer not null,
 snapshot jsonb not null,
 amount_cents integer not null check(amount_cents>=50),
 currency text not null,
 livemode boolean not null,
 status text not null default 'CREATING' check(status in ('CREATING','OPEN','PENDING','PAID','FAILED','EXPIRED')),
 access_token text not null unique,
 stripe_session_id text unique,
 checkout_url text,
 checkout_params jsonb,
 stripe_invoice_id text,
 invoice_url text,
 invoice_pdf text,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index website_orders_active on website_orders(website_id,livemode) where status in ('CREATING','OPEN','PENDING');
create unique index website_orders_paid on website_orders(website_id,livemode) where status='PAID';
create table stripe_events(id text primary key, type text not null, created_at timestamptz not null default now());
alter table website_orders enable row level security;
alter table stripe_events enable row level security;
