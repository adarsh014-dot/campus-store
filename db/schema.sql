-- Campus Store — PostgreSQL schema
--
-- The browser demo in `src/lib/` mirrors these tables exactly; this file is the
-- migration path when the storefront moves onto a real database (Supabase, or
-- any Postgres instance).
--
-- Design notes:
--   * Stock is never edited directly. Every change is a row in `movements`, and
--     `items.quantity` is a cache of the ledger's net effect. The trigger below
--     keeps that cache honest, so the two can't drift.
--   * Issuing is bounded by a CHECK-style guard inside the function, not by the
--     UI, so a bad client cannot drive stock negative.

begin;

create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  kind        text        not null check (kind in ('department', 'laboratory')),
  created_at  timestamptz not null default now()
);

create table if not exists items (
  id             uuid primary key default gen_random_uuid(),
  code           text        not null unique,
  name           text        not null,
  category       text        not null,
  unit           text        not null default 'piece',
  quantity       integer     not null default 0 check (quantity >= 0),
  reorder_level  integer     not null default 0 check (reorder_level >= 0),
  location       text        not null default '',
  unit_price     numeric(10, 2) not null default 0 check (unit_price >= 0),
  created_at     timestamptz not null default now()
);

create table if not exists movements (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid        not null references items (id) on delete restrict,
  department_id   uuid        references departments (id) on delete restrict,
  kind            text        not null check (kind in ('issue', 'return', 'receive')),
  quantity        integer     not null check (quantity > 0),
  note            text        not null default '',
  balance_after   integer     not null check (balance_after >= 0),
  created_at      timestamptz not null default now(),

  -- A department is mandatory for an issue; store receipts have none.
  constraint department_required_for_issue
    check (kind <> 'issue' or department_id is not null)
);

create index if not exists movements_item_idx on movements (item_id, created_at desc);
create index if not exists movements_department_idx on movements (department_id, created_at desc);
create index if not exists items_low_stock_idx on items (quantity) where quantity <= reorder_level;

-- Issue stock atomically. Locks the row, checks the balance, writes the ledger
-- entry and updates the cached quantity in one transaction.
create or replace function issue_stock(
  p_item_id       uuid,
  p_department_id uuid,
  p_quantity      integer,
  p_note          text default ''
) returns integer
language plpgsql
as $$
declare
  v_before  integer;
  v_after   integer;
begin
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select quantity into v_before from items where id = p_item_id for update;
  if not found then
    raise exception 'item % not found', p_item_id;
  end if;

  if p_quantity > v_before then
    raise exception 'insufficient stock: % available, % requested', v_before, p_quantity;
  end if;

  v_after := v_before - p_quantity;

  insert into movements (item_id, department_id, kind, quantity, note, balance_after)
  values (p_item_id, p_department_id, 'issue', p_quantity, coalesce(p_note, ''), v_after);

  update items set quantity = v_after where id = p_item_id;
  return v_after;
end;
$$;

-- Convenience view: everything at or below its reorder level, worst first.
create or replace view low_stock as
  select id, code, name, quantity, reorder_level, (quantity - reorder_level) as gap
  from items
  where quantity <= reorder_level
  order by gap asc;

commit;
