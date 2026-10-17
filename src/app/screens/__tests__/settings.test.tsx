// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_TODAY, StoreProvider } from '../../../core';
import type { Repository } from '../../../core';
import { localRepository } from '../../../core/repository';
import { MODULES } from '../../../modules';
import Settings from '../Settings';

/**
 * Settings' "Your data" card on a repository that refuses a whole-state
 * replace (decision 0008, 3C): Export stays, Import and Reset are left out.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The seed, loaded fresh, on a repository that saves nothing and takes no replace. */
const refusing: Repository = {
  acceptsReplace: false,
  load: (slice, today) => Promise.resolve(slice.seed(today)),
  apply: () => Promise.resolve(),
};

const SLICES = MODULES.map(m => m.slice);

let root: Root;
let host: HTMLDivElement;

async function render(repository: Repository) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/settings']}>
        {/* Gwen is the Admin, who has the data card (decision 0001). */}
        <StoreProvider
          slices={SLICES}
          today={SEED_TODAY}
          demo
          repository={repository}
          userId="s-gwen"
        >
          <Settings />
        </StoreProvider>
      </MemoryRouter>,
    ),
  );
}

const buttons = () => [...host.querySelectorAll('button')].map(b => b.textContent?.trim());

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe('the data card', () => {
  it('offers Export but not Import or Reset when the repository refuses a replace', async () => {
    await render(refusing);
    expect(buttons()).toContain('Export JSON');
    expect(buttons()).not.toContain('Import JSON');
    expect(buttons()).not.toContain('Reset demo data');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('offers all three on localStorage, as before', async () => {
    await render(localRepository);
    expect(buttons()).toEqual(
      expect.arrayContaining(['Export JSON', 'Import JSON', 'Reset demo data']),
    );
  });
});
