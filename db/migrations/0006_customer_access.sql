-- Customers find their private space again from the email they gave Stripe.
-- Requests are counted per IP and per (hashed) email to stop abuse; rows are purged by maintenance.cleanup.
create table customer_access_requests (
  id bigserial primary key,
  ip text not null,
  email_hash text not null,
  created_at timestamptz not null default now()
);
create index customer_access_requests_ip_idx on customer_access_requests (ip, created_at desc);
create index customer_access_requests_email_idx on customer_access_requests (email_hash, created_at desc);
create index website_orders_buyer_email_idx on website_orders (lower(buyer_email)) where status = 'PAID';
alter table customer_access_requests enable row level security;
