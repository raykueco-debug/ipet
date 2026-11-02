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
