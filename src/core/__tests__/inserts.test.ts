import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import { insertRow } from '../module';
import { makeCoreSeed } from '../seed';
import { coreSlice } from '../store';
import type { CoreState, FileFacts, PortalState, SignedInUser } from '../types';

const TODAY = '2026-10-07';
const DENISE: SignedInUser = { id: 's-denise', name: 'Denise Coleman', role: 'admin' };
const PDF: FileFacts = { name: 'Certificate.pdf', format: 'pdf', sizeKb: 120 };

/**
 * The core slice's raw actions, with an id source the test controls. Every
 * action sent is kept, so `resend` can send them all again, as Try again does.
 */
function core(newId: (prefix: string) => string = p => `${p}-test`) {
  let state = { core: makeCoreSeed() } as unknown as PortalState;
  let sent: AnyAction[] = [];
  const dispatch = (a: AnyAction) => {
    sent.push(a);
    state = { ...state, core: coreSlice.reducer(state.core, a) };
  };
  const actions = coreSlice.createActions(dispatch, () => state, {
    today: TODAY,
    newId,
    user: DENISE,
  });
  return {
    actions,
    state: () => state.core,
    resend() {
      const again = sent;
      sent = [];
      again.forEach(dispatch);
    },
  };
}

describe('insertRow', () => {
  const state = { rows: [{ id: 'a' }], other: 1 };

  it('adds a row whose id is new', () => {
    expect(insertRow(state, 'rows', { id: 'b' }).rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('gives the state back untouched when the id is already there', () => {
    expect(insertRow(state, 'rows', { id: 'a' })).toBe(state);
  });
});

describe('core inserts sent twice', () => {
  const paths: Array<[string, (c: ReturnType<typeof core>) => void]> = [
    [
      'addStaff',
      c =>
        c.actions.addStaff({
          name: 'Ray Ortiz',
          title: 'Teaching Artist',
          role: 'teacher',
          teaches: true,
        }),
    ],
    ['addProgram', c => c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' })],
    [
      'addProject',
      c =>
        c.actions.addProject({
          name: 'Fall Recital',
          programId: 'studio-sessions',
          start: '2026-11-01',
          end: '2026-11-30',
          budget: 2500,
        }),
    ],
    [
      'addOrganization',
      c => c.actions.addOrganization({ name: 'Lakewood USD', kind: 'school-district' }),
    ],
    ['addVenue', c => c.actions.addVenue({ name: 'Lakewood High', kind: 'school' })],
    ['addOfficeDocument', c => c.actions.addOfficeDocument({ kind: 'w9', name: 'W-9', file: PDF })],
    [
      'addOfficeDocumentVersion',
      c => c.actions.addOfficeDocumentVersion(c.state().officeDocuments[0].id, { file: PDF }),
    ],
  ];

  it.each(paths)('%s leaves one row', (_name, run) => {
    const c = core();
    run(c);
    const once = c.state();
    c.resend();
    expect(c.state()).toBe(once);
  });

  it('adds the second version of a document once', () => {
    const c = core();
    const doc = c.state().officeDocuments[0];
    c.actions.addOfficeDocumentVersion(doc.id, { file: PDF });
    c.resend();
    const versions = c.state().officeDocuments.find(d => d.id === doc.id)!.versions;
    expect(versions).toHaveLength(doc.versions.length + 1);
  });
});

describe('ids from the store', () => {
  it('names every new row with the id `newId` gives, nothing made up beside it', () => {
    let n = 0;
    const c = core(p => `${p}-fixed-${(n += 1)}`);
    const staff = c.actions.addStaff({
      name: 'Ray Ortiz',
      title: 'Teaching Artist',
      role: 'teacher',
      teaches: true,
    });
    const program = c.actions.addProgram({ name: 'Summer Jazz Camp', short: 'Camp' });
    const project = c.actions.addProject({
      name: 'Fall Recital',
      programId: 'studio-sessions',
      start: '2026-11-01',
      end: '2026-11-30',
      budget: 2500,
    });
    const organization = c.actions.addOrganization({
      name: 'Lakewood USD',
      kind: 'school-district',
    });
    const venue = c.actions.addVenue({ name: 'Lakewood High', kind: 'school' });
    const document = c.actions.addOfficeDocument({ kind: 'w9', name: 'W-9', file: PDF });
    const version = c.actions.addOfficeDocumentVersion(document, { file: PDF });

    expect([staff, program, project, organization, venue, document, version]).toEqual([
      's-fixed-1',
      'p-fixed-2',
      'prj-fixed-3',
      'org-fixed-4',
      'v-fixed-5',
      'doc-fixed-6',
      'docv-fixed-8',
    ]);
    const s: CoreState = c.state();
    expect(s.staff.at(-1)?.id).toBe('s-fixed-1');
    expect(s.programs.at(-1)?.id).toBe('p-fixed-2');
    expect(s.projects.at(-1)?.id).toBe('prj-fixed-3');
    expect(s.organizations.at(-1)?.id).toBe('org-fixed-4');
    expect(s.venues.at(-1)?.id).toBe('v-fixed-5');
    expect(s.officeDocuments.at(-1)?.versions.map(v => v.id)).toEqual([
      'docv-fixed-7',
      'docv-fixed-8',
    ]);
  });
});
