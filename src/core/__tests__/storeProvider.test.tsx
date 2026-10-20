// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveStore } from '../live';
import type { ModuleSlice } from '../module';
import type { Repository } from '../persistence';
import type { PortalSlice } from '../repository';
import { SEED_TODAY } from '../seed';
import {
  NO_REPLACE,
  StoreProvider,
  coreSlice,
  makeReducer,
  useStore,
  type StoreProviderProps,
  type StoreValue,
} from '../store';
import type { PortalState } from '../types';
import { refusingRepository } from './refusing';

/**
 * StoreProvider rendered for real (#113): the clock moves on with no `today`
 * prop, and a new repository is loaded and saved to.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface CountState {
  count: number;
}

const counter: ModuleSlice<CountState, { bump(): void }> = {
  id: 'counter',
  seed: () => ({ count: 0 }),
  empty: () => ({ count: 0 }),
  reducer: (state, action) => (action.type === 'counter/bump' ? { count: state.count + 1 } : state),
  createActions: dispatch => ({ bump: () => dispatch({ type: 'counter/bump' }) }),
  rules: { bump: 'staff' },
  tables: {
    keys: { counters: ['id'] },
    toRows: s => ({ counters: [{ id: 1, count: s.count }] }),
    fromRows: t => ({ count: Number(t.counters?.[0]?.count ?? 0) }),
  },
};
const SLICES = [counter] as unknown as PortalSlice[];

/** A repository whose counter starts at `count`, holding each apply until the test settles it. */
function fakeRepository(count: number, acceptsReplace = true) {
  const loads: string[] = [];
  const applies: Array<{ sliceId: string; next: unknown; resolve: () => void }> = [];
  const repo: Repository = {
    acceptsReplace,
    load: (slice, today) => {
      loads.push(slice.id);
      return Promise.resolve(slice.id === 'counter' ? { count } : slice.seed(today));
    },
    apply: ({ sliceId, next }) =>
      new Promise<void>(resolve => applies.push({ sliceId, next, resolve })),
  };
  return { repo, loads, applies };
}

let root: Root;
let store: StoreValue | undefined;

function Probe() {
  store = useStore();
  return null;
}

const count = () => (store!.state as unknown as { counter: CountState }).counter.count;
const bump = () => (store!.actions as unknown as { counter: { bump(): void } }).counter.bump();

async function render(
  props: Omit<StoreProviderProps, 'userId' | 'slices' | 'children'>,
  userId = 's-barry',
) {
  const tree: ReactNode = (
    <StoreProvider slices={SLICES} userId={userId} {...props}>
      <Probe />
    </StoreProvider>
  );
  await act(async () => root.render(tree));
}

beforeEach(() => {
  store = undefined;
  localStorage.clear();
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('the clock, with no today prop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 23, 58));
  });

  it('moves today on at midnight, without loading again', async () => {
    const fake = fakeRepository(0);
    await render({ demo: false, repository: fake.repo });
    expect(store!.today).toBe('2026-10-16');

    await act(async () => vi.advanceTimersByTime(2 * 60 * 1000));
    expect(store!.today).toBe('2026-10-17');
    expect(fake.loads).toEqual(['core', 'counter']);
  });

  it('moves today on when the tab is shown again', async () => {
    const fake = fakeRepository(0);
    await render({ demo: false, repository: fake.repo });

    vi.setSystemTime(new Date(2026, 9, 17, 8, 0));
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(store!.today).toBe('2026-10-17');
  });

  it('keeps the live store, and the save it has queued, past midnight', async () => {
    const fake = fakeRepository(0);
    await render({ demo: false, repository: fake.repo });
    act(() => bump());

    await act(async () => vi.advanceTimersByTime(2 * 60 * 1000));
    expect(store!.today).toBe('2026-10-17');
    // The live store is the same one: its state and its queued save are kept.
    expect(count()).toBe(1);
    expect(fake.applies).toHaveLength(1);
  });

  it('leaves the demo day where it is', async () => {
    const fake = fakeRepository(0);
    await render({ demo: true, repository: fake.repo });
    expect(store!.today).toBe(SEED_TODAY);

    await act(async () => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(store!.today).toBe(SEED_TODAY);
  });
});

describe('a today prop', () => {
  it('is today, and a new one moves it without loading again', async () => {
    const fake = fakeRepository(0);
    await render({ today: '2026-09-13', demo: false, repository: fake.repo });
    expect(store!.today).toBe('2026-09-13');

    await render({ today: '2026-09-14', demo: false, repository: fake.repo });
    expect(store!.today).toBe('2026-09-14');
    expect(fake.loads).toEqual(['core', 'counter']);
  });
});

describe('a new repository', () => {
  it('loads its data, and the saves go to it', async () => {
    const first = fakeRepository(1);
    const second = fakeRepository(5);
    await render({ today: SEED_TODAY, demo: false, repository: first.repo });
    expect(count()).toBe(1);

    await render({ today: SEED_TODAY, demo: false, repository: second.repo });
    expect(count()).toBe(5);

    act(() => bump());
    expect(count()).toBe(6);
    expect(first.applies).toHaveLength(0);
    expect(second.applies.map(a => [a.sliceId, a.next])).toEqual([['counter', { count: 6 }]]);
  });

  it('waits for a save still in flight before it loads, so the save is not dropped', async () => {
    const first = fakeRepository(1);
    const second = fakeRepository(5);
    await render({ today: SEED_TODAY, demo: false, repository: first.repo });
    act(() => bump());

    store = undefined;
    await render({ today: SEED_TODAY, demo: false, repository: second.repo });
    // Nothing shows, and nothing loads, while the old repository still has the save.
    expect(store).toBeUndefined();
    expect(second.loads).toEqual([]);

    await act(async () => first.applies[0].resolve());
    expect(first.applies.map(a => a.next)).toEqual([{ count: 2 }]);
    expect(second.loads).toEqual(['core', 'counter']);
    expect(count()).toBe(5);
  });
});

describe('a repository that refuses a replace (decision 0008, 3C)', () => {
  // Import, export and reset are the Admin's (decision 0001).
  const ADMIN = 's-gwen';
  const core = () =>
    store!.actions.core as unknown as {
      importJson(text: string): void;
      exportJson(): string;
      resetDemo(): void;
    };

  it('says so, and import and reset change nothing', async () => {
    const fake = fakeRepository(3, false);
    const refusals: string[] = [];
    await render(
      {
        today: SEED_TODAY,
        demo: true,
        repository: fake.repo,
        onRefused: m => refusals.push(m),
      },
      ADMIN,
    );
    expect(store!.acceptsReplace).toBe(false);
    const file = core().exportJson();

    act(() => expect(() => core().importJson(file)).toThrow(NO_REPLACE));
    act(() => core().resetDemo());
    expect(refusals).toEqual([NO_REPLACE]);
    expect(count()).toBe(3);
    expect(fake.applies).toHaveLength(0);
  });

  it('still exports', async () => {
    const fake = fakeRepository(3, false);
    await render({ today: SEED_TODAY, demo: false, repository: fake.repo }, ADMIN);
    const file = JSON.parse(core().exportJson()) as { slices: { counter: CountState } };
    expect(file.slices.counter).toEqual({ count: 3 });
  });

  it('takes an import on a repository that accepts one, as before', async () => {
    const fake = fakeRepository(3);
    await render({ today: SEED_TODAY, demo: false, repository: fake.repo }, ADMIN);
    expect(store!.acceptsReplace).toBe(true);
    const file = core().exportJson().replace('"count": 3', '"count": 8');
    act(() => core().importJson(file));
    expect(count()).toBe(8);
    expect(fake.applies.map(a => a.sliceId)).toContain('counter');
  });
});

describe('a stale write refused by the repository (decision 0008, #124)', () => {
  type Staff = { id: string; title: string }[];
  const staff = (state: unknown) => (state as { core: { staff: Staff } }).core.staff;
  const title = (id: string) => staff(store!.state).find(s => s.id === id)?.title;

  it('rolls back, says so, shows the colleague’s change, and Try again saves on top of it', async () => {
    const server = refusingRepository([coreSlice as PortalSlice, ...SLICES], SEED_TODAY);
    const failures: string[] = [];
    await render({
      today: SEED_TODAY,
      demo: true,
      repository: server.repo,
      onSaveFailed: m => failures.push(m),
    });
    expect(title('s-devon')).toBe('Teaching Artist');

    // A colleague, on the same repository, retitles Devon first.
    const colleague = createLiveStore({
      initial: {
        core: await server.repo.load(coreSlice as never, SEED_TODAY, true),
      } as unknown as PortalState,
      reducer: makeReducer([coreSlice as PortalSlice]),
      slices: [coreSlice as PortalSlice],
      repository: server.repo,
    });
    colleague.dispatch({
      type: 'core/update-staff',
      id: 's-devon',
      patch: { title: 'Lead Teaching Artist' },
    });
    expect(await colleague.whenSaved()).toBe(true);

    const actions = store!.actions.core as unknown as {
      updateStaff(id: string, patch: { title: string }): void;
    };
    await act(async () => actions.updateStaff('s-devon', { title: 'Senior Teaching Artist' }));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(failures).toEqual(["Couldn't save the person: someone else changed it first"]);
    expect(store!.saving.status).toBe('error');
    expect(title('s-devon')).toBe('Lead Teaching Artist');
    const staffRow = () => server.rows('core').staff.find(r => r.id === 's-devon');
    expect(staffRow()?.title).toBe('Lead Teaching Artist');

    await act(async () => store!.saving.retry!());
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(store!.saving.status).toBe('idle');
    expect(title('s-devon')).toBe('Senior Teaching Artist');
    expect(staffRow()?.title).toBe('Senior Teaching Artist');
  });
});
