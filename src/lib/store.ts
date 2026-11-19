/**
 * Store logic.
 *
 * Deliberately pure: every operation takes a state and returns a new state plus
 * the movement it recorded. No React, no storage, no clock reads except as an
 * injected parameter — which is what makes every rule below unit-testable.
 */
import type { Item, Movement, MovementKind, Result, StoreState } from './types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Test helper: reset the id counter so ids are stable across runs. */
export function resetIdCounter(): void {
  counter = 0;
}

export function findItem(state: StoreState, itemId: string): Item | undefined {
  return state.items.find((i) => i.id === itemId);
}

export function isLowStock(item: Item): boolean {
  return item.quantity <= item.reorderLevel;
}

export function lowStockItems(state: StoreState): Item[] {
  return state.items
    .filter(isLowStock)
    .sort((a, b) => a.quantity - a.reorderLevel - (b.quantity - b.reorderLevel));
}

export function totalUnits(state: StoreState): number {
  return state.items.reduce((sum, i) => sum + i.quantity, 0);
}

export function stockValue(state: StoreState): number {
  return state.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

interface MovementInput {
  itemId: string;
  departmentId: string | null;
  quantity: number;
  note?: string;
  at?: string;
}

function applyMovement(
  state: StoreState,
  kind: MovementKind,
  input: MovementInput,
  delta: number,
): Result<StoreState> {
  const item = findItem(state, input.itemId);
  if (!item) return { ok: false, error: 'Item not found.' };

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: 'Quantity must be a whole number greater than zero.' };
  }

  if (kind === 'issue' && input.quantity > item.quantity) {
    return {
      ok: false,
      error: `Only ${item.quantity} ${item.unit} of ${item.name} in stock.`,
    };
  }

  if (kind === 'issue' && !input.departmentId) {
    return { ok: false, error: 'Choose the department or laboratory receiving the stock.' };
  }

  const balanceAfter = item.quantity + delta;

  const movement: Movement = {
    id: nextId('mv'),
    itemId: item.id,
    departmentId: input.departmentId,
    kind,
    quantity: input.quantity,
    note: input.note?.trim() ?? '',
    at: input.at ?? new Date().toISOString(),
    balanceAfter,
  };

  return {
    ok: true,
    value: {
      ...state,
      items: state.items.map((i) => (i.id === item.id ? { ...i, quantity: balanceAfter } : i)),
      movements: [movement, ...state.movements],
    },
  };
}

/** Issue stock from the central store to a department or laboratory. */
export function issueStock(state: StoreState, input: MovementInput): Result<StoreState> {
  return applyMovement(state, 'issue', input, -Math.abs(input.quantity));
}

/** A department returns unused stock to the central store. */
export function returnStock(state: StoreState, input: MovementInput): Result<StoreState> {
  return applyMovement(state, 'return', input, Math.abs(input.quantity));
}

/** New stock arrives at the central store from a supplier. */
export function receiveStock(state: StoreState, input: MovementInput): Result<StoreState> {
  return applyMovement(state, 'receive', input, Math.abs(input.quantity));
}

/** Total quantity currently out with a given department (issued, not yet returned). */
export function issuedTo(state: StoreState, departmentId: string): number {
  return state.movements
    .filter((m) => m.departmentId === departmentId && (m.kind === 'issue' || m.kind === 'return'))
    .reduce((sum, m) => sum + (m.kind === 'issue' ? m.quantity : -m.quantity), 0);
}

export function recentMovements(state: StoreState, limit = 12): Movement[] {
  return state.movements.slice(0, limit);
}

export function itemName(state: StoreState, itemId: string): string {
  return findItem(state, itemId)?.name ?? 'Unknown item';
}

export function departmentName(state: StoreState, departmentId: string | null): string {
  if (!departmentId) return 'Central store';
  return state.departments.find((d) => d.id === departmentId)?.name ?? 'Unknown';
}
