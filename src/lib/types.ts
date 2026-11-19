/**
 * Domain types.
 *
 * The shape mirrors the Postgres tables in `db/schema.sql` on purpose, so the
 * in-browser demo and a real deployment speak the same language.
 */

export type MovementKind = 'issue' | 'return' | 'receive';

export interface Item {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  /** Quantity held by the central store right now. */
  quantity: number;
  /** At or below this number, the item is flagged for reorder. */
  reorderLevel: number;
  location: string;
  unitPrice: number;
}

export interface Department {
  id: string;
  name: string;
  kind: 'department' | 'laboratory';
}

export interface Movement {
  id: string;
  itemId: string;
  departmentId: string | null;
  kind: MovementKind;
  quantity: number;
  note: string;
  /** ISO 8601 timestamp. */
  at: string;
  balanceAfter: number;
}

export interface StoreState {
  items: Item[];
  departments: Department[];
  movements: Movement[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
