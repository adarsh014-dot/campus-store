import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';

/**
 * Smoke test: the storefront mounts and paints seed data.
 *
 * `localStorage` does not exist under renderToString; `loadState()` handles
 * that by falling back to the seed catalogue, which this test also proves.
 */
describe('App', () => {
  const html = renderToString(<App />);

  it('renders the inventory from seed data', () => {
    expect(html).toContain('Campus Store');
    expect(html).toContain('Inventory');
    expect(html).toContain('Arduino Uno R3');
    expect(html).toContain('Computer Lab 3');
  });

  it('renders the summary, issue form and low-stock panel', () => {
    expect(html).toContain('Below reorder level');
    expect(html).toContain('Issue stock');
    expect(html).toContain('Items tracked');
    expect(html).toContain('Recent movements');
  });

  it('falls back to seed data when storage is unavailable', () => {
    expect(html).toContain('ESP32 DevKit v1');
  });
});
