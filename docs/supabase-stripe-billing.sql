create table if not exists public.deckpilot_credit_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.deckpilot_users(id) on delete cascade,
  amount integer not null check (amount > 0),
  source text not null,
  reference_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.deckpilot_credit_payments enable row level security;

create or replace function public.deckpilot_add_credits(payload jsonb, app_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  is_authorized boolean;
  action_value text;
  user_id_value uuid;
  amount_value integer;
  source_value text;
  reference_value text;
  inserted_count integer;
  user_json jsonb;
  payments_json jsonb;
begin
  select value = encode(extensions.digest(convert_to(coalesce(app_secret, ''), 'utf8'), 'sha256'::text), 'hex')
    into is_authorized
  from public.deckpilot_app_config
  where key = 'backend_secret_sha256';

  if coalesce(is_authorized, false) = false then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  action_value := coalesce(nullif(payload->>'action', ''), 'add');
  user_id_value := (payload->>'userId')::uuid;

  if action_value = 'list' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount', amount,
          'source', source,
          'referenceId', reference_id,
          'createdAt', created_at
        )
        order by created_at desc
      ),
      '[]'::jsonb
    ) into payments_json
    from (
      select id, amount, source, reference_id, created_at
      from public.deckpilot_credit_payments
      where user_id = user_id_value
      order by created_at desc
      limit 50
    ) payments;

    return jsonb_build_object('ok', true, 'payments', payments_json);
  end if;

  amount_value := greatest(0, coalesce((payload->>'amount')::integer, 0));
  source_value := left(coalesce(nullif(payload->>'source', ''), 'manual'), 80);
  reference_value := left(coalesce(nullif(payload->>'referenceId', ''), encode(extensions.gen_random_bytes(16), 'hex')), 180);

  if amount_value <= 0 then
    raise exception 'invalid credit amount' using errcode = '22023';
  end if;

  if not exists (select 1 from public.deckpilot_users where id = user_id_value) then
    raise exception 'user not found' using errcode = '22023';
  end if;

  insert into public.deckpilot_credit_payments (user_id, amount, source, reference_id, created_at)
  values (user_id_value, amount_value, source_value, reference_value, now())
  on conflict (reference_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.deckpilot_users
    set credits_total = credits_total + amount_value
    where id = user_id_value;
  end if;

  select jsonb_build_object(
    'id', id,
    'email', email,
    'creditsTotal', credits_total,
    'creditsUsed', credits_used,
    'creditsRemaining', greatest(0, credits_total - credits_used)
  ) into user_json
  from public.deckpilot_users
  where id = user_id_value;

  return jsonb_build_object('ok', true, 'credited', inserted_count > 0, 'user', user_json);
end;
$function$;
