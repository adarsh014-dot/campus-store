# Campus Store

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-schema%20included-4169E1?logo=postgresql&logoColor=white)
![tests](https://img.shields.io/badge/tests-17%20passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

Inventory for a college central store: what is held, what has been issued to which department or
laboratory, and what has fallen below its reorder level.

## The design decision that matters

**Stock is a ledger, not a number.** The quantity column is a cached balance; every change is an
entry recording the item, the department, the kind (`issue` / `return` / `receive`), the quantity and
the resulting balance.

That gives you three things a mutable counter cannot:

1. **An audit trail.** "Why is the Arduino count 4?" has an answer.
2. **Net issued-to per department**, because returns subtract from issues.
3. **A schema that survives contact with a real database** — see [`db/schema.sql`](db/schema.sql),
   which locks the row and checks the balance *inside* the transaction so a bad client cannot drive
   stock negative.

Issuing is bounded in the domain layer, not the UI:

```
issueStock(state, { itemId, departmentId, quantity })
  → quantity must be a positive integer
  → item must exist
  → departmentId is required for an issue
  → quantity must not exceed the balance
  ⇒ { ok: true, value: nextState } | { ok: false, error }
```

Every operation is pure: it takes a state and returns a **new** state. No React, no storage, and no
clock read except an injected `at` — which is why the whole thing is unit-testable.

## Features

- Inventory table with search (name, code, location) and category filter
- Issue stock to a department or laboratory, with a note and an atomic balance check
- Restock action for anything at or below its reorder level
- Low-stock panel sorted by severity — worst shortage first, not alphabetically
- Ledger of recent movements with balance-after on each row
- Data persists in `localStorage`, so a refresh keeps your demo intact

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
npm test         # 17 unit tests
```

## Layout

```
src/
  lib/types.ts        domain types (mirrors the Postgres tables)
  lib/store.ts        pure stock logic: issue / return / receive, low-stock, aggregates
  lib/store.test.ts   17 tests: bounds, validation, immutability, low-stock transitions
  lib/seed.ts         demo catalogue — 12 items, 5 departments and labs
  App.tsx             UI: inventory, issue form, low-stock panel, ledger
db/
  schema.sql          PostgreSQL schema, indexes, low_stock view, atomic issue_stock()
```

## Moving to a real database

`db/schema.sql` is deployment-ready for Postgres or Supabase. It includes:

- `departments`, `items`, `movements` with foreign keys and CHECK constraints
- `department_required_for_issue` — a CHECK that enforces the same rule the UI enforces
- a partial index for low-stock lookups
- `issue_stock(item, department, quantity, note)` — a `plpgsql` function that selects
  `FOR UPDATE`, validates the balance, writes the ledger row and updates the cached quantity in one
  transaction

To wire it up, replace the `localStorage` effect in `App.tsx` with calls into your data layer and keep
`src/lib/store.ts` as the single place the rules live.

## Known limits (stated, not hidden)

- **No authentication or roles yet.** Anyone using the page can issue stock. A real deployment needs
  at least *store admin* vs *requester*, which is why the schema has room for an `issued_by` column.
- **Single central store.** Per-lab sub-stores and transfers between them are not modelled — the
  ledger supports it, the UI does not.
- **No approval workflow.** Issues are direct, not requested-then-approved.
- **Demo data is invented** to look realistic; it is not a real DBCE stock register.
- **No pagination.** Fine for 12 items, not for 12,000.

## Licence

MIT — see [LICENSE](LICENSE).
