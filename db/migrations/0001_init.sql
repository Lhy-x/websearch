-- ProspectForge — initial schema
-- Plain PostgreSQL 15+ (compatible Supabase). Extensions are created if the role is allowed to.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Immutable unaccent wrapper so it can be used in indexes / generated columns
create or replace function pf_unaccent(text) returns text
  language sql immutable parallel safe strict as $$ select public.unaccent('public.unaccent', $1) $$;

create or replace function pf_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Settings (single row) — non-secret configuration + encrypted secrets
-- ---------------------------------------------------------------------------
create table admin_settings (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  secrets jsonb not null default '{}'::jsonb, -- values encrypted with APP_ENCRYPTION_KEY (AES-256-GCM)
  global_pause boolean not null default false,
  campaigns_emergency_stop boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into admin_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Businesses / prospects
-- ---------------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null default '',
  sector text,                         -- internal sector slug (hair_salon, barber, restaurant…)
  source_category text,                -- raw category from the source
  naf_code text,
  address text,
  postcode text,
  city text,
  region text,
  country char(2),
  lat double precision,
  lon double precision,
  phone text,                          -- E.164 when normalisable
  website_url text,
  domain text,
  email text,                          -- best known professional email (see business_contacts for provenance)
  email_status text not null default 'NONE'
    check (email_status in ('SOURCE_CONFIRMED','UNVERIFIED','INVALID','NONE')),
  siren text,
  siret text,
  operating_status text,
  web_presence_status text not null default 'UNVERIFIED'
    check (web_presence_status in ('NO_WEBSITE_KNOWN','NO_WEBSITE_CONFIRMED','WEBSITE_FOUND','WEBSITE_BROKEN',
                                   'WEBSITE_OUTDATED','WEBSITE_LOW_QUALITY','WEBSITE_GOOD','UNVERIFIED')),
  web_presence_checked_at timestamptz,
  web_presence_evidence jsonb not null default '[]'::jsonb,
  pipeline_status text not null default 'NEW'
    check (pipeline_status in ('NEW','DISCOVERED','ENRICHED','QUALIFIED','WEBSITE_GENERATED','CONTACTED','REPLIED',
                               'INTERESTED','MEETING_BOOKED','NEGOTIATION','WON','LOST','DO_NOT_CONTACT')),
  score integer,
  data_confidence integer,
  priority text check (priority in ('A','B','C','D')),
  tags text[] not null default '{}',
  do_not_contact boolean not null default false,
  next_reminder_at timestamptz,
  enriched_at timestamptz,
  archived_at timestamptz,
  merged_into uuid references businesses(id) on delete set null,
  search_text text generated always as (
    lower(pf_unaccent(coalesce(name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(sector,'') || ' ' ||
                      coalesce(postcode,'') || ' ' || coalesce(email,'') || ' ' || coalesce(domain,'')))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_geo_idx on businesses (lat, lon);
create index businesses_country_city_idx on businesses (country, city);
create index businesses_sector_idx on businesses (sector);
create index businesses_pipeline_idx on businesses (pipeline_status);
create index businesses_presence_idx on businesses (web_presence_status);
create index businesses_score_idx on businesses (score desc nulls last);
create index businesses_phone_idx on businesses (phone) where phone is not null;
create index businesses_domain_idx on businesses (domain) where domain is not null;
create unique index businesses_siret_uq on businesses (siret) where siret is not null and merged_into is null;
create index businesses_name_trgm on businesses using gin (normalized_name gin_trgm_ops);
create index businesses_search_trgm on businesses using gin (search_text gin_trgm_ops);
create index businesses_tags_idx on businesses using gin (tags);
create trigger businesses_touch before update on businesses for each row execute function pf_touch_updated_at();

create table business_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source text not null check (source in ('overture','sirene','recherche_entreprises','osm','google_places','import','manual')),
  source_record_id text not null,
  source_release text,
  confidence real,
  raw jsonb not null default '{}'::jsonb,
  license text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_record_id)
);
create index business_sources_business_idx on business_sources (business_id);

create table business_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('email','phone','website','social')),
  value text not null,
  normalized_value text not null,
  label text,
  source text not null,
  source_url text,
  status text not null default 'UNVERIFIED' check (status in ('SOURCE_CONFIRMED','UNVERIFIED','INVALID')),
  mx_valid boolean,
  is_role_account boolean,
  is_primary boolean not null default false,
  opted_out boolean not null default false,
  confidence real,
  retrieved_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, kind, normalized_value)
);
create index business_contacts_value_idx on business_contacts (kind, normalized_value);

create table business_enrichments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  field text not null,
  value jsonb not null,
  source text not null,
  source_url text,
  confidence real,
  retrieved_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, field, source)
);

create table business_merges (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references businesses(id) on delete cascade,
  candidate_id uuid not null references businesses(id) on delete cascade,
  score real not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null check (status in ('AUTO_MERGED','PENDING','MERGED','REJECTED')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (primary_id, candidate_id)
);

create table website_audits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  url text not null,
  final_url text,
  http_status integer,
  https_ok boolean,
  load_ms integer,
  has_viewport boolean,
  mobile_overflow boolean,
  title text,
  meta_description text,
  h1_count integer,
  forms_count integer,
  has_cta boolean,
  has_contact_info boolean,
  internal_links_checked integer,
  broken_links jsonb not null default '[]'::jsonb,
  console_errors jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  quality_score integer,
  verdict text,
  screenshot_desktop text,
  screenshot_mobile text,
  copyright_year integer,
  error text,
  created_at timestamptz not null default now()
);
create index website_audits_business_idx on website_audits (business_id, created_at desc);

create table prospect_scores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  score integer not null,
  confidence integer not null,
  priority text not null,
  reasons jsonb not null,
  weights jsonb not null,
  ai_analysis jsonb,
  created_at timestamptz not null default now()
);
create index prospect_scores_business_idx on prospect_scores (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  params jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger saved_searches_touch before update on saved_searches for each row execute function pf_touch_updated_at();

create table search_runs (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid references saved_searches(id) on delete set null,
  params jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  source_reports jsonb not null default '[]'::jsonb,
  total_found integer not null default 0,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  merge_pending_count integer not null default 0,
  business_ids uuid[] not null default '{}',
  new_business_ids uuid[] not null default '{}',
  job_id uuid,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index search_runs_saved_idx on search_runs (saved_search_id, created_at desc);

create table geocode_cache (
  query text primary key,
  result jsonb not null,
  provider text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Website generation
-- ---------------------------------------------------------------------------
create table website_templates (
  id text primary key,
  name text not null,
  sector text not null,
  layout text not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table generated_websites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  template_id text not null references website_templates(id),
  style text not null,
  status text not null default 'PENDING' check (status in ('PENDING','GENERATING','READY','ERROR','DISABLED')),
  current_version integer,
  preview_token text not null unique,
  preview_enabled boolean not null default true,
  preview_expires_at timestamptz,
  generator text,          -- 'ai:<provider>' or 'deterministic'
  model text,
  cost_usd numeric(12,6) not null default 0,
  duration_ms integer,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index generated_websites_business_idx on generated_websites (business_id);
create trigger generated_websites_touch before update on generated_websites for each row execute function pf_touch_updated_at();

create table website_versions (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references generated_websites(id) on delete cascade,
  version integer not null,
  config jsonb not null,
  created_by text not null check (created_by in ('ai','deterministic','manual')),
  note text,
  created_at timestamptz not null default now(),
  unique (website_id, version)
);

create table website_assets (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references generated_websites(id) on delete cascade,
  version integer,
  kind text not null check (kind in ('screenshot_desktop','screenshot_mobile','screenshot_full','thumbnail','image','export')),
  path text not null,
  mime text not null,
  size_bytes integer,
  license text,
  source_url text,
  created_at timestamptz not null default now()
);
create index website_assets_site_idx on website_assets (website_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Offers, strategies, proposals
-- ---------------------------------------------------------------------------
create table sales_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'vitrine' check (kind in ('vitrine','refonte','maintenance','seo_local','booking','custom')),
  description text not null default '',
  price_cents integer,
  currency char(3) not null default 'EUR',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table prompt_strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text not null,
  tone text not null default 'professionnel',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  website_id uuid references generated_websites(id) on delete set null,
  offer_id uuid references sales_offers(id) on delete set null,
  strategy_id uuid references prompt_strategies(id) on delete set null,
  content jsonb not null,
  facts jsonb not null,
  generator text not null,
  model text,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index proposals_business_idx on proposals (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Campaigns & email
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','STOPPED','COMPLETED')),
  mode text not null default 'MANUAL' check (mode in ('MANUAL','SEMI_AUTO','AUTO')),
  from_name text,
  from_email text,
  reply_to text,
  offer_id uuid references sales_offers(id) on delete set null,
  strategy_id uuid references prompt_strategies(id) on delete set null,
  timezone text not null default 'Europe/Paris',
  send_days integer[] not null default '{1,2,3,4,5}',   -- ISO weekday 1=Mon
  send_start_minute integer not null default 540 check (send_start_minute between 0 and 1439),
  send_end_minute integer not null default 1080 check (send_end_minute between 1 and 1440),
  daily_limit integer not null default 20 check (daily_limit between 1 and 2000),
  min_interval_seconds integer not null default 120,
  auto_filters jsonb,              -- for AUTO mode: search params + min score
  auto_generate_site boolean not null default false,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaigns_touch before update on campaigns for each row execute function pf_touch_updated_at();

create table campaign_sequences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step integer not null check (step >= 0),
  delay_days integer not null default 0 check (delay_days >= 0),
  content_key text not null default 'initial', -- which proposal variant to use
  subject_template text,
  body_template text,
  unique (campaign_id, step)
);

create table campaign_prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_email text,
  proposal_id uuid references proposals(id) on delete set null,
  website_id uuid references generated_websites(id) on delete set null,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','ACTIVE','REPLIED','UNSUBSCRIBED','BOUNCED','COMPLETED','STOPPED','EXCLUDED')),
  current_step integer not null default 0,
  next_send_at timestamptz,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, business_id)
);
create index campaign_prospects_due_idx on campaign_prospects (status, next_send_at);
create trigger campaign_prospects_touch before update on campaign_prospects for each row execute function pf_touch_updated_at();

create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_prospect_id uuid references campaign_prospects(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  conversation_id uuid,
  step integer not null default 0,
  to_email text not null,
  from_email text not null,
  from_name text,
  reply_to text,
  subject text not null,
  body_text text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','AWAITING_APPROVAL','SCHEDULED','SENDING','SENT','DELIVERED','BOUNCED','COMPLAINED','FAILED','CANCELLED')),
  requires_approval boolean not null default false,
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  provider text,
  provider_message_id text,
  message_id_header text unique,
  unsubscribe_token text unique,
  idempotency_key text not null unique,
  attempts integer not null default 0,
  last_error text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index outbound_one_per_step on outbound_messages (campaign_prospect_id, step)
  where campaign_prospect_id is not null and status <> 'CANCELLED';
create index outbound_due_idx on outbound_messages (status, scheduled_at);
create index outbound_provider_idx on outbound_messages (provider, provider_message_id);
create trigger outbound_touch before update on outbound_messages for each row execute function pf_touch_updated_at();

create table email_events (
  id uuid primary key default gen_random_uuid(),
  outbound_message_id uuid references outbound_messages(id) on delete cascade,
  provider text not null,
  provider_event_id text,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  subject text,
  status text not null default 'OPEN' check (status in ('OPEN','NEEDS_ATTENTION','WAITING','CLOSED')),
  last_classification text,
  last_message_at timestamptz,
  unread boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_business_idx on conversations (business_id);
create trigger conversations_touch before update on conversations for each row execute function pf_touch_updated_at();
alter table outbound_messages add constraint outbound_conversation_fk foreign key (conversation_id) references conversations(id) on delete set null;

create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  outbound_message_id uuid references outbound_messages(id) on delete set null,
  from_email text not null,
  to_email text,
  subject text,
  body_text text,
  message_id_header text unique,
  in_reply_to text,
  references_header text,
  headers jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  source text not null default 'webhook',
  classification text check (classification in ('INTERESTED','NOT_INTERESTED','QUESTION','OBJECTION','MEETING_REQUEST',
                                               'UNSUBSCRIBE','OUT_OF_OFFICE','BOUNCE','UNKNOWN')),
  classification_confidence real,
  classification_source text,
  summary text,
  suggested_reply text,
  suggested_reply_requires_approval boolean not null default true,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index inbound_conversation_idx on inbound_messages (conversation_id, received_at);

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create table crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  offer_id uuid references sales_offers(id) on delete set null,
  title text not null,
  amount_cents integer,
  currency char(3) not null default 'EUR',
  status text not null default 'OPEN' check (status in ('OPEN','WON','LOST')),
  signed_at timestamptz,
  paid_cents integer,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger crm_opportunities_touch before update on crm_opportunities for each row execute function pf_touch_updated_at();

create table crm_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index crm_tasks_due_idx on crm_tasks (done_at, due_at);

create table crm_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Automation / jobs (persistent queue, SELECT … FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
create table automation_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','RETRYING','CANCELLED')),
  priority integer not null default 100,     -- lower = sooner
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  idempotency_key text unique,
  schedule_id uuid,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  progress real not null default 0,
  progress_message text,
  result jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_jobs_claim_idx on automation_jobs (priority, run_at) where status in ('PENDING','RETRYING');
create index automation_jobs_status_idx on automation_jobs (status, created_at desc);
create trigger automation_jobs_touch before update on automation_jobs for each row execute function pf_touch_updated_at();

create table job_logs (
  id bigserial primary key,
  job_id uuid references automation_jobs(id) on delete cascade,
  level text not null check (level in ('debug','info','warn','error')),
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index job_logs_job_idx on job_logs (job_id, id);
create index job_logs_level_idx on job_logs (level, created_at desc);

create table automation_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  cron text not null,
  timezone text not null default 'Europe/Paris',
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automation_schedules_touch before update on automation_schedules for each row execute function pf_touch_updated_at();
alter table automation_jobs add constraint automation_jobs_schedule_fk foreign key (schedule_id) references automation_schedules(id) on delete set null;

create table worker_heartbeats (
  worker_id text primary key,
  hostname text,
  pid integer,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Compliance, costs, audit
-- ---------------------------------------------------------------------------
create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  business_id uuid references businesses(id) on delete set null,
  reason text not null check (reason in ('UNSUBSCRIBE','BOUNCE','COMPLAINT','MANUAL','OPPOSITION')),
  source text,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null)
);
create unique index suppression_email_uq on suppression_list (lower(email)) where email is not null;
create unique index suppression_domain_uq on suppression_list (lower(domain)) where domain is not null;

create table api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  units integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  success boolean not null default true,
  error text,
  job_id uuid references automation_jobs(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index api_usage_created_idx on api_usage (created_at desc);

create table audit_logs (
  id bigserial primary key,
  actor text not null default 'system',
  action text not null,
  entity_type text,
  entity_id uuid,
  level text not null default 'info',
  data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on audit_logs (created_at desc);

create table preview_views (
  id bigserial primary key,
  website_id uuid not null references generated_websites(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  device text
);

create table login_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ip_idx on login_attempts (ip, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere with NO policy → anon/authenticated
-- Supabase roles get nothing; the server connects with the owner role.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
