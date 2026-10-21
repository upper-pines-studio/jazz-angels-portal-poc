import { describe, expect, it } from 'vitest';
import { diffSlice } from '../diff';
import type { RowDiff } from '../diff';
import { StaleWriteError } from '../persistence';
import type { SliceChange } from '../persistence';
import { localRepository } from '../repository';
import type { PortalSlice } from '../repository';
import { dayFrom, instantFrom, minuteFrom, timeOfDayFrom } from '../rows';
import type { Row } from '../rows';
import { makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice } from '../store';
import {
  NOT_SIGNED_IN,
  PAGE_SIZE,
  portalRepository,
  supabaseRepository,
} from '../supabaseRepository';
import type { SupabaseLike } from '../supabaseRepository';
import { coreTables } from '../tables';
import type { CoreState } from '../types';

/**
 * The Supabase repository (#159) against a stubbed client: what it selects,
 * what it sends to `apply`, and how it reads each refusal. db/repository.test.ts
 * runs it against the local Supabase.
 */

interface Refusal {
  message: string;
  code: string;
  details: string | null;
}

/** A client holding `rows` by table, answering `apply` with `refusal` when there is one. */
function stub(rows: Record<string, Row[]>, opts: { refusal?: Refusal; session?: boolean } = {}) {
  const calls = {
    selects: [] as { table: string; order: string[]; from: number; to: number }[],
    rpcs: [] as { fn: string; args: { slice_id: string; diff: RowDiff } }[],
  };
  const client = {
    from(table: string) {
      const order: string[] = [];
      const query = {
        select: () => query,
        order(column: string) {
          order.push(column);
          return query;
        },
        range(from: number, to: number) {
          calls.selects.push({ table, order, from, to });
          return Promise.resolve({ data: (rows[table] ?? []).slice(from, to + 1), error: null });
        },
      };
      return query;
    },
    rpc(fn: string, args: { slice_id: string; diff: RowDiff }) {
      calls.rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: opts.refusal ?? null });
    },
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: opts.session === false ? null : { user: {} } } }),
    },
  };
  return { client: client as unknown as SupabaseLike, calls };
}

const core = coreSlice as PortalSlice;

function change(sliceId: string, rows: RowDiff): SliceChange {
  return { sliceId, action: { type: `${sliceId}/test` }, rows, next: undefined };
}

describe('supabaseRepository.load', () => {
  it('selects each of the slice’s tables in key order and reads the rows back into the slice', async () => {
    const seed = makeCoreSeed();
    const { client, calls } = stub(coreTables.toRows(seed) as unknown as Record<string, Row[]>);
    const loaded = await supabaseRepository(client).load(core, '2026-09-20', false);
    expect(loaded).toEqual(coreSlice.normalise!(coreTables.fromRows(coreTables.toRows(seed))));
    expect(calls.selects.map(s => s.table)).toEqual(Object.keys(coreTables.keys));
    expect(calls.selects.find(s => s.table === 'program_budgets')?.order).toEqual([
      'program_id',
      'fiscal_year',
    ]);
  });

  it('gives the slice’s empty() when the database holds none of its rows (decision 0004)', async () => {
    const { client } = stub({});
    expect(await supabaseRepository(client).load(core, '2026-09-20', false)).toEqual(
      makeCoreEmpty(),
    );
  });

  it('reads a table longer than a page, page by page', async () => {
    const seed = makeCoreSeed();
    const base = coreTables.toRows(seed);
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      ...base.organizations[0],
      id: `org-${String(i).padStart(5, '0')}`,
    }));
    const { client, calls } = stub({
      ...(base as unknown as Record<string, Row[]>),
      organizations: many,
    });
    const loaded = (await supabaseRepository(client).load(core, '2026-09-20', false)) as CoreState;
    expect(loaded.organizations).toHaveLength(PAGE_SIZE + 5);
    expect(calls.selects.filter(s => s.table === 'organizations').map(s => s.from)).toEqual([
      0,
      PAGE_SIZE,
    ]);
  });

  it('refuses to load when nobody is signed in, rather than show an empty office', async () => {
    const { client, calls } = stub({}, { session: false });
    await expect(supabaseRepository(client).load(core, '2026-09-20', false)).rejects.toThrow(
      NOT_SIGNED_IN,
    );
    expect(calls.selects).toEqual([]);
  });

  it('rejects with the database’s sentence when a select is refused', async () => {
    const { client } = stub({});
    const refused = {
      ...client,
      from: () => {
        const query = {
          select: () => query,
          order: () => query,
          range: () =>
            Promise.resolve({
              data: null,
              error: { message: 'permission denied for table staff' },
            }),
        };
        return query;
      },
    } as unknown as SupabaseLike;
    await expect(supabaseRepository(refused).load(core, '2026-09-20', false)).rejects.toThrow(
      'permission denied for table staff',
    );
  });
});

describe('supabaseRepository.apply', () => {
  const seed = makeCoreSeed();
  const renamed: CoreState = {
    ...seed,
    programs: seed.programs.map((p, i) => (i === 0 ? { ...p, name: 'Jazz in the Schools' } : p)),
  };
  const rows = diffSlice(coreTables, seed, renamed);

  it('sends the row diff to the apply function, as it is', async () => {
    const { client, calls } = stub({});
    await supabaseRepository(client).apply(change('core', rows));
    expect(calls.rpcs).toEqual([{ fn: 'apply', args: { slice_id: 'core', diff: rows } }]);
  });

  it('sends nothing for a change that touched no stored row', async () => {
    const { client, calls } = stub({});
    await supabaseRepository(client).apply(change('core', []));
    expect(calls.rpcs).toEqual([]);
  });

  it('rejects a stale refusal (PT409) with a StaleWriteError, from its detail', async () => {
    const key = { id: seed.programs[0].id };
    const { client } = stub(
      {},
      {
        refusal: {
          code: 'PT409',
          message: `The programs row ${JSON.stringify(key)} changed since it was read (changed).`,
          details: JSON.stringify({ table: 'programs', key, reason: 'changed' }),
        },
      },
    );
    const error = await supabaseRepository(client)
      .apply(change('core', rows))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaleWriteError);
    expect(error).toMatchObject({ table: 'programs', key, reason: 'changed' });
    expect((error as Error).message).toBe(
      new StaleWriteError({ table: 'programs', key, reason: 'changed' }).message,
    );
  });

  it('rejects a policy or trigger refusal with an Error holding the database’s sentence', async () => {
    for (const refusal of [
      { code: '42501', message: 'You may not change the programs row {"id":"in-school"}.' },
      { code: 'P0001', message: 'Operations cannot be archived.' },
    ]) {
      const { client } = stub({}, { refusal: { ...refusal, details: null } });
      const error = await supabaseRepository(client)
        .apply(change('core', rows))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(StaleWriteError);
      expect((error as Error).message).toBe(refusal.message);
    }
  });

  it('takes no whole-portal replace, so Import and Reset stay hidden (decision 0008, 3C)', () => {
    expect(supabaseRepository(stub({}).client).acceptsReplace).toBe(false);
  });
});

describe('portalRepository', () => {
  it('is localRepository when the build has no Supabase project, or the demo is on', () => {
    // The tests run as `npm run dev` does: the demo on, so never on Supabase.
    expect(portalRepository()).toBe(localRepository);
  });
});

describe('reading a time column back', () => {
  it('gives an instant back as the state keeps it', () => {
    expect(instantFrom('2026-02-10T09:00:00+00:00')).toBe('2026-02-10T09:00:00.000Z');
    expect(instantFrom('2026-02-10T05:00:00-04:00')).toBe('2026-02-10T09:00:00.000Z');
    expect(instantFrom('2026-02-10T09:00:00.000Z')).toBe('2026-02-10T09:00:00.000Z');
  });

  it('gives a day back as a day', () => {
    expect(dayFrom('2026-03-01T00:00:00+00:00')).toBe('2026-03-01');
    expect(dayFrom('2026-03-01')).toBe('2026-03-01');
  });

  it('gives a zone-less day and time back without seconds or zone', () => {
    expect(minuteFrom('2026-09-13T08:40:00+00:00')).toBe('2026-09-13T08:40');
    expect(minuteFrom('2026-09-13T08:40')).toBe('2026-09-13T08:40');
  });

  it('gives a time of day back as hours and minutes', () => {
    expect(timeOfDayFrom('15:00:00')).toBe('15:00');
    expect(timeOfDayFrom('15:00')).toBe('15:00');
  });

  it('leaves a value it cannot read as it is', () => {
    expect(instantFrom('soon')).toBe('soon');
    expect(dayFrom('')).toBe('');
  });
});
