/**
 * Reads the tables out of `docs/SCHEMA.md`'s Mermaid diagrams, for the checks
 * that hold the code and the database to the document: the slices' row
 * mappings (`tables.test.ts`, #121) and the local Supabase database
 * (`db/schema.test.ts`, `npm run test:db`, #153).
 */

/** What the diagrams draw. */
export interface SchemaDiagrams {
  /** Each table with its columns, in the order drawn. */
  tables: Map<string, string[]>;
  /** The columns marked nullable (`table.column`): a note that starts with "null", as Conventions says. */
  nullable: Set<string>;
  /** Each column's type as drawn (`table.column` to `text`, `int[]`, `timestamptz`). */
  types: Map<string, string>;
}

/** The tables in SCHEMA.md's diagrams, read from the document's text. */
export function schemaTables(text: string): SchemaDiagrams {
  const tables = new Map<string, string[]>();
  const nullable = new Set<string>();
  const types = new Map<string, string>();
  let table: string | undefined;
  for (const line of text.split('\n')) {
    const open = /^ {2}(\w+) \{$/.exec(line);
    if (open) {
      table = open[1];
      tables.set(table, []);
    } else if (/^ {2}\}$/.test(line)) {
      table = undefined;
    } else if (table) {
      const column = /^ {4}(\S+) (\w+)[^"]*(?:"([^"]*)")?/.exec(line);
      if (column) {
        const [, type, name, note] = column;
        tables.get(table)?.push(name);
        types.set(`${table}.${name}`, type);
        if (/^null\b/.test(note ?? '')) nullable.add(`${table}.${name}`);
      }
    }
  }
  return { tables, nullable, types };
}
