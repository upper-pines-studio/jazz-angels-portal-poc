import { describe, expect, it } from 'vitest';
import schemaText from '../../../docs/SCHEMA.md?raw';
import { coreSlice } from '../../core';
import type { PortalSlice } from '../../core/repository';
import { MODULES } from '../../modules';

/**
 * The slices' row mappings against `docs/SCHEMA.md` (#121): every table the
 * schema draws is written by a slice or named below with why not, and every
 * column a slice writes is one the schema draws. Read from the document itself,
 * so a table or column added to one and not the other fails here.
 */

/**
 * The tables in SCHEMA.md's diagrams, each with its columns, and the columns
 * marked nullable (`table.column`): a note that starts with "null", as
 * Conventions says.
 */
function schemaTables(text: string): {
  tables: Map<string, string[]>;
  nullable: Set<string>;
} {
  const tables = new Map<string, string[]>();
  const nullable = new Set<string>();
  let table: string | undefined;
  for (const line of text.split('\n')) {
    const open = /^ {2}(\w+) \{$/.exec(line);
    if (open) {
      table = open[1];
      tables.set(table, []);
    } else if (/^ {2}\}$/.test(line)) {
      table = undefined;
    } else if (table) {
      const column = /^ {4}\S+ (\w+)[^"]*(?:"([^"]*)")?/.exec(line);
      if (column) {
        tables.get(table)?.push(column[1]);
        if (/^null\b/.test(column[2] ?? '')) nullable.add(`${table}.${column[1]}`);
      }
    }
  }
  return { tables, nullable };
}

/**
 * The columns SCHEMA.md says the database sets, from its "Who did it" and
 * "When" notes: a bare name (`added_by`) is that column on every table, a
 * dotted one (`activity.who_id`) the one column.
 */
function databaseSet(text: string): string[] {
  const names: string[] = [];
  let reading = false;
  for (const line of text.split('\n')) {
    if (/^- \*\*(Who did it|When)\.\*\*/.test(line)) reading = true;
    else if (!/^ {2}\S/.test(line)) reading = false;
    if (!reading) continue;
    for (const [, name] of line.matchAll(/`([^`]+)`/g)) {
      if (/^\w+(\.\w+)?$/.test(name)) names.push(name);
    }
  }
  return names;
}

const { tables: SCHEMA, nullable: NULLABLE } = schemaTables(schemaText);
const DATABASE_SET = databaseSet(schemaText);

/** Whether `table.column` is one SCHEMA.md says the database sets. */
const setByDatabase = (column: string) =>
  DATABASE_SET.some(name => name === column || column.endsWith(`.${name}`));

const SLICES = [coreSlice, ...MODULES.map(m => m.slice)] as PortalSlice[];

/** The tables no slice writes, and why. */
const NOT_WRITTEN: Record<string, string> = {
  logins: 'sign-ins live in core/auth.ts, outside the store',
  grant_targets: 'deliverables, decision 0005: not in the browser build yet',
  time_charges: 'staff pay charged to grants, decision 0005: not in the browser build yet',
};

/** The columns no slice writes, because the type has no field for them yet. */
const COLUMNS_NOT_WRITTEN = [
  'staff.email',
  'payments.deposit_id',
  'budget_versions.approved_on',
  'budget_versions.note',
  'budget_versions.added_by',
  'budget_versions.added_at',
];

const both = (slice: PortalSlice) => [
  ['demo seed', slice.tables.toRows(slice.seed('2026-09-13'))] as const,
  ['empty', slice.tables.toRows(slice.empty())] as const,
];

describe('the slices against SCHEMA.md (#121)', () => {
  it('reads the schema', () => {
    expect(SCHEMA.size).toBeGreaterThan(40);
    expect(SCHEMA.get('grants')).toContain('amount_awarded');
    expect(NULLABLE).toContain('grants.amount_awarded');
    expect(NULLABLE).not.toContain('grants.funder_id');
    expect(DATABASE_SET).toContain('archived_by');
    expect(DATABASE_SET).toContain('activity.who_id');
  });

  it('names only columns the schema has as set by the database', () => {
    const columns = [...SCHEMA].flatMap(([table, cs]) => cs.map(c => `${table}.${c}`));
    for (const name of DATABASE_SET) {
      expect(
        columns.some(c => c === name || c.endsWith(`.${name}`)),
        name,
      ).toBe(true);
    }
  });

  it('writes every table in the schema, bar the ones named with why', () => {
    const written = new Set(SLICES.flatMap(s => Object.keys(s.tables.keys)));
    const missing = [...SCHEMA.keys()].filter(t => !written.has(t));
    expect(missing.sort()).toEqual(Object.keys(NOT_WRITTEN).sort());
  });

  it.each(SLICES.map(s => [s.id, s] as const))(
    'writes only tables and columns the schema has: %s',
    (_, slice) => {
      for (const table of Object.keys(slice.tables.keys)) {
        expect(SCHEMA.has(table), table).toBe(true);
      }
      for (const [, rows] of both(slice)) {
        expect(Object.keys(rows)).toEqual(Object.keys(slice.tables.keys));
        for (const [table, list] of Object.entries(rows)) {
          const columns = SCHEMA.get(table) ?? [];
          for (const key of slice.tables.keys[table]) expect(columns, table).toContain(key);
          for (const row of list) {
            for (const column of Object.keys(row)) expect(columns, table).toContain(column);
          }
        }
      }
    },
  );

  it.each(SLICES.map(s => [s.id, s] as const))(
    'gives every row of a table the same columns, none undefined: %s',
    (_, slice) => {
      for (const [, rows] of both(slice)) {
        for (const [table, list] of Object.entries(rows)) {
          const columns = list[0] ? Object.keys(list[0]).sort() : [];
          for (const row of list) {
            expect(Object.keys(row).sort(), table).toEqual(columns);
            expect(
              Object.values(row).some(v => v === undefined),
              table,
            ).toBe(false);
          }
        }
      }
    },
  );

  it('leaves out only the columns the types do not have yet', () => {
    const written = new Set<string>();
    for (const slice of SLICES) {
      for (const [, rows] of both(slice)) {
        for (const [table, list] of Object.entries(rows)) {
          for (const row of list) for (const c of Object.keys(row)) written.add(`${table}.${c}`);
        }
      }
    }
    const owned = new Set(SLICES.flatMap(s => Object.keys(s.tables.keys)));
    const unwritten = [...SCHEMA]
      .filter(([table]) => owned.has(table))
      .flatMap(([table, columns]) => columns.map(c => `${table}.${c}`))
      .filter(c => !written.has(c));
    expect(unwritten.sort()).toEqual([...COLUMNS_NOT_WRITTEN].sort());
  });

  // A not-null column that nobody sends makes the backend refuse the insert
  // (#137), so the database fills it and SCHEMA.md says so.
  it('leaves out a not-null column only when the database sets it', () => {
    const unfilled = COLUMNS_NOT_WRITTEN.filter(c => !NULLABLE.has(c) && !setByDatabase(c));
    expect(unfilled).toEqual([]);
  });

  it.each(SLICES.map(s => [s.id, s] as const))(
    'round-trips the demo seed and an empty office: %s',
    (_, slice) => {
      for (const state of [slice.seed('2026-09-13'), slice.empty()]) {
        const back = slice.tables.fromRows(slice.tables.toRows(state));
        // Grants' `incoming` is not stored (SCHEMA.md, "What is not stored").
        const expected =
          slice.id === 'grants' ? { ...(state as object), incoming: [] } : (state as object);
        expect(back).toEqual(expected);
      }
    },
  );
});
