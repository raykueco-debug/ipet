-- iPet 親子連動（Supabase）：在 Supabase 專案的 SQL Editor 貼上整段、按 Run。
-- 父母端送食物 → 存一筆 → 子端每幾秒問一次「這個配對碼有沒有新的」。
-- 表格本身不開放（RLS 開著、沒有任何 policy），只能透過下面兩個函式存取：一定要知道配對碼才讀得到、寫得進。

create table if not exists public.pet_events (
  id bigint generated always as identity primary key,
  family text not null check (char_length(family) between 8 and 32),
  kind text not null default 'gift' check (kind in ('gift')),
  item text not null check (item in ('meat', 'veg', 'water')),
  sender text not null default '' check (char_length(sender) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists pet_events_family_id on public.pet_events (family, id);
alter table public.pet_events enable row level security;

-- 父母端：送一份食物
create or replace function public.send_gift(p_family text, p_item text, p_from text default '')
returns bigint language sql security definer set search_path = public as $$
  insert into pet_events (family, kind, item, sender) values (p_family, 'gift', p_item, left(coalesce(p_from, ''), 20))
  returning id;
$$;

-- 子端：這個配對碼在 p_after 之後的新事件（p_after 為 null：只回最新一筆，用來記下「現在」，不重播舊的）
create or replace function public.pet_inbox(p_family text, p_after bigint default null)
returns table (id bigint, kind text, item text, sender text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  (select e.id, e.kind, e.item, e.sender, e.created_at from pet_events e
    where p_after is not null and e.family = p_family and e.id > p_after order by e.id limit 50)
  union all
  (select e.id, e.kind, e.item, e.sender, e.created_at from pet_events e
    where p_after is null and e.family = p_family order by e.id desc limit 1);
$$;

revoke all on function public.send_gift(text, text, text) from public;
revoke all on function public.pet_inbox(text, bigint) from public;
grant execute on function public.send_gift(text, text, text) to anon, authenticated;
grant execute on function public.pet_inbox(text, bigint) to anon, authenticated;

-- ===== 推播（挑戰一起飛時，對方的手機／平板跳通知）=====
-- 每台裝置開通知時存一筆：哪個配對碼、孩子還是家長、推播地址（家長有幾個孩子就幾筆）。表格一樣不開放，只能透過函式。
-- 真正送推播的是 Edge Function「notify」（supabase/functions/notify/index.ts），它用 service role 讀這張表。
create table if not exists public.push_subs (
  endpoint text not null check (char_length(endpoint) between 10 and 1000),
  family text not null check (char_length(family) between 8 and 32),
  role text not null check (role in ('kid', 'parent')),
  device text not null default '' check (char_length(device) <= 40),
  sub jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (endpoint, family)
);
create index if not exists push_subs_family on public.push_subs (family, role);
alter table public.push_subs enable row level security;

-- 開通知（或每次打開時再存一次）：這台裝置收這個配對碼的推播
create or replace function public.save_push(p_family text, p_role text, p_device text, p_sub jsonb)
returns void language sql security definer set search_path = public as $$
  insert into push_subs (endpoint, family, role, device, sub)
  values (p_sub->>'endpoint', p_family, p_role, left(coalesce(p_device, ''), 40), p_sub)
  on conflict (endpoint, family) do update set role = excluded.role, device = excluded.device, sub = excluded.sub, updated_at = now();
$$;

-- 解除綁定／關通知：這台裝置不再收這個配對碼的推播（p_family 為 null：全部）
create or replace function public.drop_push(p_endpoint text, p_family text default null)
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and (p_family is null or family = p_family);
$$;

revoke all on function public.save_push(text, text, text, jsonb) from public;
revoke all on function public.drop_push(text, text) from public;
grant execute on function public.save_push(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.drop_push(text, text) to anon, authenticated;

-- 推播的金鑰（VAPID）：由 notify 函式第一次被呼叫時自己產生、存在這裡；沒有人經手私鑰。表格不開放，只有函式（service role）讀得到。
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- notify 函式（service role）讀寫推播的兩張表（新專案不會自動給權限）
grant select, insert on public.push_keys to service_role;
grant select, delete on public.push_subs to service_role;
