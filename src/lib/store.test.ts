import { beforeEach, describe, expect, it } from 'vitest';
import {
  departmentName,
  findItem,
  isLowStock,
  issueStock,
  issuedTo,
  itemName,
  lowStockItems,
  receiveStock,
  resetIdCounter,
  returnStock,
  stockValue,
  totalUnits,
} from './store';
import { seedState } from './seed';
import type { StoreState } from './types';

const at = '2026-11-19T10:00:00.000Z';

const fresh = (): StoreState => ({ ...seedState(), movements: [] });

const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(`expected success, got: ${r.error}`);
  return r.value;
};

beforeEach(() => resetIdCounter());

describe('issuing stock', () => {
  it('decrements the item and records a movement', () => {
    const state = ok(
      issueStock(fresh(), {
        itemId: 'it-esp32',
        departmentId: 'lab-cs3',
        quantity: 4,
        note: 'IoT practical batch A',
        at,
      }),
    );

    expect(findItem(state, 'it-esp32')!.quantity).toBe(30);
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0]).toMatchObject({
      kind: 'issue',
      quantity: 4,
      departmentId: 'lab-cs3',
      balanceAfter: 30,
      at,
    });
  });

  it('refuses to issue more than the store holds', () => {
    const result = issueStock(fresh(), { itemId: 'it-cat6', departmentId: 'lab-net', quantity: 4, at });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Only 3');
  });

  it('allows issuing exactly the remaining stock', () => {
    const state = ok(issueStock(fresh(), { itemId: 'it-cat6', departmentId: 'lab-net', quantity: 3, at }));
    expect(findItem(state, 'it-cat6')!.quantity).toBe(0);
  });

  it('requires a department for an issue', () => {
    const result = issueStock(fresh(), { itemId: 'it-mouse', departmentId: null, quantity: 1, at });
    expect(result.ok).toBe(false);
  });

  it('rejects zero, negative and fractional quantities', () => {
    for (const quantity of [0, -2, 1.5]) {
      const result = issueStock(fresh(), { itemId: 'it-mouse', departmentId: 'lab-cs3', quantity, at });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects an unknown item', () => {
    const result = issueStock(fresh(), { itemId: 'nope', departmentId: 'lab-cs3', quantity: 1, at });
    expect(result.ok).toBe(false);
  });

  it('does not mutate the original state', () => {
    const before = fresh();
    const beforeQty = findItem(before, 'it-esp32')!.quantity;
    issueStock(before, { itemId: 'it-esp32', departmentId: 'lab-cs3', quantity: 5, at });
    expect(findItem(before, 'it-esp32')!.quantity).toBe(beforeQty);
    expect(before.movements).toHaveLength(0);
  });
});

describe('returning and receiving stock', () => {
  it('returning stock puts units back', () => {
    let state = ok(issueStock(fresh(), { itemId: 'it-arduino', departmentId: 'lab-elex', quantity: 5, at }));
    expect(findItem(state, 'it-arduino')!.quantity).toBe(4);

    state = ok(returnStock(state, { itemId: 'it-arduino', departmentId: 'lab-elex', quantity: 3, at }));
    expect(findItem(state, 'it-arduino')!.quantity).toBe(7);
    expect(state.movements[0].kind).toBe('return');
  });

  it('receiving stock from a supplier increases the balance', () => {
    const state = ok(receiveStock(fresh(), { itemId: 'it-jumper', departmentId: null, quantity: 25, note: 'PO-118', at }));
    expect(findItem(state, 'it-jumper')!.quantity).toBe(32);
  });

  it('rejects a negative receipt instead of silently flipping the sign', () => {
    const result = receiveStock(fresh(), { itemId: 'it-jumper', departmentId: null, quantity: -5, at });
    expect(result.ok).toBe(false);
  });

  it('net issued-to accounts for returns', () => {
    let state = ok(issueStock(fresh(), { itemId: 'it-esp32', departmentId: 'lab-cs3', quantity: 10, at }));
    state = ok(returnStock(state, { itemId: 'it-esp32', departmentId: 'lab-cs3', quantity: 4, at }));
    expect(issuedTo(state, 'lab-cs3')).toBe(6);
  });
});

describe('low stock', () => {
  it('flags items at or below their reorder level', () => {
    const state = fresh();
    expect(isLowStock(findItem(state, 'it-arduino')!)).toBe(true); // 9 <= 12
    expect(isLowStock(findItem(state, 'it-esp32')!)).toBe(false); // 34 > 15
  });

  it('treats equality with the reorder level as low', () => {
    const state = fresh();
    const item = { ...findItem(state, 'it-esp32')!, quantity: 15 };
    expect(isLowStock(item)).toBe(true);
  });

  it('sorts the most severe shortage first', () => {
    const low = lowStockItems(fresh());
    expect(low.length).toBeGreaterThan(2);
    const gaps = low.map((i) => i.quantity - i.reorderLevel);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
  });

  it('an issue can push an item into the low-stock list', () => {
    const before = lowStockItems(fresh()).map((i) => i.id);
    expect(before).not.toContain('it-esp32');

    const state = ok(issueStock(fresh(), { itemId: 'it-esp32', departmentId: 'lab-cs3', quantity: 20, at }));
    expect(lowStockItems(state).map((i) => i.id)).toContain('it-esp32');
  });
});

describe('aggregates and labels', () => {
  it('sums units and stock value across the catalogue', () => {
    const state = fresh();
    const units = state.items.reduce((s, i) => s + i.quantity, 0);
    expect(totalUnits(state)).toBe(units);
    expect(stockValue(state)).toBeGreaterThan(0);
  });

  it('resolves human-readable names, including the central store', () => {
    const state = fresh();
    expect(itemName(state, 'it-arduino')).toBe('Arduino Uno R3');
    expect(itemName(state, 'ghost')).toBe('Unknown item');
    expect(departmentName(state, 'lab-cs3')).toBe('Computer Lab 3');
    expect(departmentName(state, null)).toBe('Central store');
  });
});
