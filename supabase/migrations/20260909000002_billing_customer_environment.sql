-- A Stripe Customer ID is valid only in the Stripe account mode that created
-- it. Historical application mappings predate live billing and are sandbox.
alter table public.billing_customers add column if not exists billing_environment text;
update public.billing_customers set billing_environment = 'sandbox' where billing_environment is null;
alter table public.billing_customers alter column billing_environment set default 'sandbox';
alter table public.billing_customers alter column billing_environment set not null;
alter table public.billing_customers drop constraint if exists billing_customers_billing_environment_check;
alter table public.billing_customers add constraint billing_customers_billing_environment_check check (billing_environment in ('sandbox', 'live'));

comment on column public.billing_customers.billing_environment is 'Stripe mode that owns this Customer mapping. A mapping is reused only when this value matches the configured Stripe secret-key mode.';
