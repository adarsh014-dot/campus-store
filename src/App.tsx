import { useEffect, useMemo, useState } from 'react';
import { seedState } from './lib/seed';
import {
  departmentName,
  isLowStock,
  issueStock,
  itemName,
  lowStockItems,
  receiveStock,
  stockValue,
  totalUnits,
} from './lib/store';
import type { StoreState } from './lib/types';

const STORAGE_KEY = 'campus-store:v1';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: 'short',
});

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState;
      if (parsed?.items?.length && parsed?.departments?.length) return parsed;
    }
  } catch {
    /* corrupt storage should never stop the store opening */
  }
  return seedState();
}

export default function App() {
  const [state, setState] = useState<StoreState>(loadState);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [itemId, setItemId] = useState('it-esp32');
  const [departmentId, setDepartmentId] = useState('lab-cs3');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(id);
  }, [flash]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(state.items.map((i) => i.category))).sort()],
    [state.items],
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesQuery =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [state.items, query, category]);

  const low = lowStockItems(state);
  const selectedItem = state.items.find((i) => i.id === itemId);

  function submitIssue(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = issueStock(state, {
      itemId,
      departmentId,
      quantity: Number(quantity),
      note,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.value);
    setNote('');
    setQuantity('1');
    setFlash(
      `Issued ${quantity} × ${selectedItem?.name ?? 'item'} to ${departmentName(state, departmentId)}.`,
    );
  }

  function receive(itemIdToRestock: string, amount: number) {
    const result = receiveStock(state, { itemId: itemIdToRestock, departmentId: null, quantity: amount, note: 'Restock' });
    if (result.ok) {
      setState(result.value);
      setFlash(`Received ${amount} × ${itemName(state, itemIdToRestock)} into the central store.`);
    }
  }

  function resetDemo() {
    setState(seedState());
    setFlash('Demo data restored.');
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="eyebrow">Central store · DBCE</div>
          <h1>Campus Store</h1>
          <p className="lede">
            Stock held centrally, issued to departments and laboratories. Every change is a ledger
            entry — the quantity column is just a cached balance.
          </p>
        </div>
        <button className="btn-quiet" onClick={resetDemo}>
          Reset demo data
        </button>
      </header>

      <section className="stats" aria-label="Summary">
        <div className="stat">
          <span className="stat-label">Items tracked</span>
          <span className="stat-value">{state.items.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Below reorder level</span>
          <span className={`stat-value ${low.length ? 'is-alert' : ''}`}>{low.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Units on hand</span>
          <span className="stat-value">{totalUnits(state)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Stock value</span>
          <span className="stat-value">₹{inr.format(stockValue(state))}</span>
        </div>
      </section>

      {flash && <div className="flash">{flash}</div>}

      <div className="grid">
        <main className="card table-card">
          <div className="card-head">
            <h2>Inventory</h2>
            <div className="filters">
              <input
                type="search"
                placeholder="Search name, code or location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search inventory"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All categories' : c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Location</th>
                  <th scope="col" className="num">
                    On hand
                  </th>
                  <th scope="col" className="num">
                    Reorder at
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const itemLow = isLowStock(item);
                  return (
                    <tr key={item.id} className={itemLow ? 'row-low' : undefined}>
                      <td>
                        <span className="item-name">{item.name}</span>
                        <span className="item-meta">
                          {item.code} · {item.category}
                        </span>
                      </td>
                      <td className="muted">{item.location}</td>
                      <td className="num">
                        <span className={itemLow ? 'pill pill-low' : 'pill'}>
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="num muted">{item.reorderLevel}</td>
                      <td className="actions">
                        {itemLow && (
                          <button className="link" onClick={() => receive(item.id, item.reorderLevel * 2)}>
                            Restock
                          </button>
                        )}
                        <button
                          className="link"
                          onClick={() => {
                            setItemId(item.id);
                            setError(null);
                          }}
                        >
                          Issue
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No item matches that search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="side">
          <form className="card issue" onSubmit={submitIssue}>
            <h2>Issue stock</h2>
            <p className="card-sub">
              Moves units out of the central store and writes a ledger entry.
            </p>

            <label>
              <span>Item</span>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {state.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} left)
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>To department or lab</span>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Quantity</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>

            <label>
              <span>Note (optional)</span>
              <input
                type="text"
                placeholder="Practical batch, project, event…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            {error && <p className="error" role="alert">{error}</p>}

            <button className="btn" type="submit">
              Issue to {departmentName(state, departmentId)}
            </button>
          </form>

          <div className="card">
            <h2>Below reorder level</h2>
            {low.length === 0 ? (
              <p className="card-sub">Everything is above its reorder level.</p>
            ) : (
              <ul className="low-list">
                {low.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span className="low-name">{item.name}</span>
                      <span className="item-meta">
                        {item.quantity} on hand · reorder at {item.reorderLevel}
                      </span>
                    </div>
                    <span className="gap">{item.quantity - item.reorderLevel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <section className="card ledger">
        <h2>Recent movements</h2>
        {state.movements.length === 0 ? (
          <p className="card-sub">
            No movements yet. Issue something above and it will appear here.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Item</th>
                <th scope="col">Type</th>
                <th scope="col">To</th>
                <th scope="col" className="num">
                  Qty
                </th>
                <th scope="col" className="num">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {state.movements.slice(0, 10).map((m) => (
                <tr key={m.id}>
                  <td className="muted">{timeFormat.format(new Date(m.at))}</td>
                  <td>{itemName(state, m.itemId)}</td>
                  <td>
                    <span className={`kind kind-${m.kind}`}>{m.kind}</span>
                  </td>
                  <td className="muted">{departmentName(state, m.departmentId)}</td>
                  <td className="num">{m.quantity}</td>
                  <td className="num">{m.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="foot">
        <span>Data persists in this browser. The Postgres schema is in <code>db/schema.sql</code>.</span>
        <span>Rules tested in <code>src/lib/store.test.ts</code>.</span>
      </footer>
    </div>
  );
}
