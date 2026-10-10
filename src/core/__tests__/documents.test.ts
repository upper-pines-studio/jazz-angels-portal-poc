import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../module';
import {
  EXPIRES_SOON_DAYS,
  OFFICE_DOCUMENT_KINDS,
  currentVersion,
  normaliseOfficeDocument,
  officeDocumentStatus,
  officeDocumentsList,
  officeDocumentsNeedingAttention,
  versionStatus,
  versionsNewestFirst,
} from '../documents';
import { can } from '../permissions';
import { SEED_TODAY, makeCoreEmpty, makeCoreSeed } from '../seed';
import { coreSlice, describeCoreChange, guardActions } from '../store';
import type {
  CoreState,
  FileFacts,
  OfficeDocument,
  OfficeDocumentVersion,
  PortalState,
  Role,
  SignedInUser,
} from '../types';

const TODAY = '2026-10-07';
const as = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });
const stateOf = (core: CoreState) => ({ core }) as unknown as PortalState;

/** The core slice behind its real rules, for one signed-in person. */
function core(user: SignedInUser = as('office-manager', 's-keisha'), start = makeCoreSeed()) {
  let state = stateOf(start);
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const getState = () => state;
  const actions = guardActions(
    coreSlice.createActions(
      a => {
        sent.push(a);
        state = { ...state, core: coreSlice.reducer(state.core, a) };
      },
      getState,
      { today: TODAY, newId: p => `${p}-${(n += 1)}`, user },
    ),
    coreSlice.rules,
    getState,
    user,
    m => refused.push(m),
  );
  return { actions, refused, sent, state: () => state };
}

const PDF: FileFacts = { name: 'Certificate 2026-27.pdf', format: 'pdf', sizeKb: 190, pages: 1 };

function version(id: string, addedAt: string, expires?: string): OfficeDocumentVersion {
  return {
    id,
    name: `${id}.pdf`,
    format: 'pdf',
    sizeKb: 10,
    addedAt,
    addedById: 's-denise',
    expires,
  };
}

function doc(
  versions: OfficeDocumentVersion[],
  extra: Partial<OfficeDocument> = {},
): OfficeDocument {
  return { id: 'd', kind: 'insurance-certificate', name: 'Insurance', versions, ...extra };
}

describe('the current version', () => {
  it('is the newest added, wherever it sits in the list', () => {
    const d = doc([version('b', '2026-05-01'), version('a', '2025-05-01')]);
    expect(currentVersion(d)?.id).toBe('b');
    expect(versionsNewestFirst(d).map(v => v.id)).toEqual(['b', 'a']);
  });

  it('goes to the later one added the same day', () => {
    const d = doc([version('a', '2026-05-01'), version('b', '2026-05-01')]);
    expect(currentVersion(d)?.id).toBe('b');
    expect(versionsNewestFirst(d).map(v => v.id)).toEqual(['b', 'a']);
  });

  it('can be asked for a past day: the newest added on or before it', () => {
    const d = doc([version('old', '2025-01-10'), version('new', '2026-03-01')]);
    expect(currentVersion(d, '2026-02-28')?.id).toBe('old');
    expect(currentVersion(d, '2026-03-01')?.id).toBe('new');
    expect(currentVersion(d, '2024-12-31')).toBeUndefined();
  });

  it('is missing when there are no versions', () => {
    expect(currentVersion(doc([]))).toBeUndefined();
  });
});

describe('status', () => {
  it('is current with no expiry, however old', () => {
    expect(versionStatus(version('a', '2001-01-01'), TODAY)).toBe('current');
  });

  it(`is Expires soon within ${EXPIRES_SOON_DAYS} days, and current a day further out`, () => {
    expect(versionStatus(version('a', '2026-01-01', '2026-11-06'), TODAY)).toBe('expires-soon');
    expect(versionStatus(version('a', '2026-01-01', '2026-10-08'), TODAY)).toBe('expires-soon');
    expect(versionStatus(version('a', '2026-01-01', '2026-11-07'), TODAY)).toBe('current');
  });

  it('is Out of date from the expiry day on, and with no version at all', () => {
    expect(versionStatus(version('a', '2026-01-01', TODAY), TODAY)).toBe('out-of-date');
    expect(versionStatus(version('a', '2026-01-01', '2026-09-30'), TODAY)).toBe('out-of-date');
    expect(versionStatus(undefined, TODAY)).toBe('out-of-date');
  });

  it("follows the current version, not an older one's expiry", () => {
    const d = doc([version('old', '2025-01-01', '2025-12-31'), version('new', '2026-01-01')]);
    expect(officeDocumentStatus(d, TODAY)).toBe('current');
  });
});

describe('the demo and a new office', () => {
  it('seeds the six documents, one expiring soon and two with an older version', () => {
    const state = stateOf(makeCoreSeed());
    const docs = officeDocumentsList(state);
    expect(docs.map(d => d.kind)).toEqual([
      'irs-letter',
      'financials',
      'board-list',
      'insurance-certificate',
      'w9',
      'organization-budget',
    ]);
    expect(docs.map(d => officeDocumentStatus(d, SEED_TODAY))).toEqual([
      'current',
      'current',
      'current',
      'expires-soon',
      'current',
      'current',
    ]);
    expect(docs.filter(d => d.versions.length > 1).map(d => d.kind)).toEqual([
      'financials',
      'board-list',
    ]);
    // Every seeded version names someone on the staff.
    const staff = new Set(state.core.staff.map(s => s.id));
    for (const d of docs) for (const v of d.versions) expect(staff.has(v.addedById)).toBe(true);
  });

  it('starts a new office with none', () => {
    expect(makeCoreEmpty().officeDocuments).toEqual([]);
  });

  it('offers seven kinds, Other last', () => {
    expect(OFFICE_DOCUMENT_KINDS).toHaveLength(7);
    expect(OFFICE_DOCUMENT_KINDS.at(-1)?.value).toBe('other');
  });
});

describe('what needs attention', () => {
  it('lists out of date first, then expiring soon, leaving out current and archived ones', () => {
    const start = makeCoreSeed();
    start.officeDocuments.push(
      doc([version('x', '2025-01-01', '2026-09-01')], { id: 'expired', name: 'Old W-9' }),
      doc([version('y', '2025-01-01', '2026-09-02')], {
        id: 'gone',
        name: 'Archived',
        archivedAt: '2026-09-05',
        archivedById: 's-keisha',
      }),
    );
    const rows = officeDocumentsNeedingAttention(stateOf(start), SEED_TODAY);
    expect(rows.map(r => [r.document.id, r.status])).toEqual([
      ['expired', 'out-of-date'],
      ['doc-insurance', 'expires-soon'],
    ]);
  });

  it('follows the day it is given, so a later demo date finds more', () => {
    const rows = officeDocumentsNeedingAttention(stateOf(makeCoreSeed()), '2026-12-15');
    expect(rows.map(r => [r.document.id, r.status])).toEqual([
      ['doc-insurance', 'out-of-date'],
      ['doc-financials', 'expires-soon'],
    ]);
  });
});

describe('the actions', () => {
  it('adds a document with its first version, today, credited to whoever added it', () => {
    const c = core();
    const id = c.actions.addOfficeDocument({
      kind: 'insurance-certificate',
      name: '  Auto insurance ',
      file: PDF,
      expires: '2027-10-01',
    });
    expect(id).toBe('doc-1');
    const added = c.state().core.officeDocuments.find(d => d.id === id)!;
    expect(added).toEqual({
      id: 'doc-1',
      kind: 'insurance-certificate',
      name: 'Auto insurance',
      versions: [
        {
          id: 'docv-2',
          name: PDF.name,
          format: 'pdf',
          sizeKb: 190,
          pages: 1,
          addedAt: TODAY,
          addedById: 's-keisha',
          expires: '2027-10-01',
        },
      ],
    });
    expect(describeCoreChange(c.sent[0])).toBe('the document');
  });

  it('adds a version, which becomes current; the older one stays', () => {
    const c = core();
    const vid = c.actions.addOfficeDocumentVersion('doc-insurance', {
      file: PDF,
      expires: '2027-10-01',
    });
    const d = c.state().core.officeDocuments.find(x => x.id === 'doc-insurance')!;
    expect(d.versions.map(v => v.id)).toEqual(['docv-insurance-1', vid]);
    expect(currentVersion(d)).toMatchObject({ id: vid, addedAt: TODAY, expires: '2027-10-01' });
    expect(officeDocumentStatus(d, TODAY)).toBe('current');
    expect(describeCoreChange(c.sent[0])).toBe('the new version');
  });

  it('leaves the expiry off a version that has none', () => {
    const c = core();
    const vid = c.actions.addOfficeDocumentVersion('doc-w9', { file: PDF, expires: '' });
    const d = c.state().core.officeDocuments.find(x => x.id === 'doc-w9')!;
    expect(d.versions.find(v => v.id === vid)).not.toHaveProperty('expires');
  });

  it('renames a document and changes its kind, its versions untouched', () => {
    const c = core();
    c.actions.updateOfficeDocument('doc-w9', { name: ' W-9 (2026) ', kind: 'other' });
    const d = c.state().core.officeDocuments.find(x => x.id === 'doc-w9')!;
    expect(d).toMatchObject({ name: 'W-9 (2026)', kind: 'other' });
    expect(d.versions).toEqual(
      makeCoreSeed().officeDocuments.find(x => x.id === 'doc-w9')!.versions,
    );
  });

  it('archives and restores, never deletes', () => {
    const c = core();
    c.actions.archiveOfficeDocument('doc-w9');
    let d = c.state().core.officeDocuments.find(x => x.id === 'doc-w9')!;
    expect(d).toMatchObject({ archivedAt: TODAY, archivedById: 's-keisha' });
    expect(officeDocumentsList(c.state()).map(x => x.id)).not.toContain('doc-w9');
    expect(officeDocumentsList(c.state(), true).at(-1)?.id).toBe('doc-w9');
    expect(describeCoreChange(c.sent[0])).toBe('the archive change');

    c.actions.restoreOfficeDocument('doc-w9');
    d = c.state().core.officeDocuments.find(x => x.id === 'doc-w9')!;
    expect(d.archivedAt).toBeUndefined();
    expect(c.state().core.officeDocuments).toHaveLength(6);
  });
});

describe('the rules', () => {
  it('lets Admin, Director, Office manager and Bookkeeper change them', () => {
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const c = core(as(role));
      expect(c.actions.addOfficeDocumentVersion('doc-w9', { file: PDF })).toBeTruthy();
      expect(c.refused).toEqual([]);
    }
  });

  it('lets an Office assistant and Read-only see them but not add a version', () => {
    for (const role of ['assistant', 'read-only'] as Role[]) {
      expect(can(role, 'office-documents', 'view')).toBe(true);
      const c = core(as(role));
      expect(c.actions.addOfficeDocumentVersion('doc-w9', { file: PDF })).toBeUndefined();
      c.actions.addOfficeDocument({ kind: 'w9', name: 'W-9', file: PDF });
      c.actions.archiveOfficeDocument('doc-w9');
      expect(c.sent).toEqual([]);
      expect(c.refused).toHaveLength(3);
    }
  });

  it('keeps them from a Teacher altogether', () => {
    expect(can('teacher', 'office-documents', 'open')).toBe(false);
    const c = core(as('teacher'));
    c.actions.restoreOfficeDocument('doc-w9');
    expect(c.refused).toEqual(["You can't do that as a Teacher."]);
  });

  it('refuses a document with no name or no file, saying why', () => {
    const c = core();
    c.actions.addOfficeDocument({ kind: 'w9', name: '  ', file: PDF });
    c.actions.addOfficeDocument({
      kind: 'w9',
      name: 'W-9',
      file: { name: '', format: 'pdf', sizeKb: 0 },
    });
    c.actions.addOfficeDocument({ kind: 'nope' as never, name: 'W-9', file: PDF });
    c.actions.updateOfficeDocument('doc-w9', { name: '' });
    expect(c.refused).toEqual([
      'Give the document a name.',
      'Choose a file to add.',
      'Choose what kind of document it is.',
      'Give the document a name.',
    ]);
    expect(c.sent).toEqual([]);
  });

  it('refuses renaming or re-kinding an archived document until it is restored', () => {
    const c = core();
    c.actions.archiveOfficeDocument('doc-w9');
    c.actions.updateOfficeDocument('doc-w9', { name: 'W-9 (2026)' });
    c.actions.updateOfficeDocument('doc-w9', { kind: 'other' });
    expect(c.refused).toEqual([
      'Restore the document before editing it.',
      'Restore the document before editing it.',
    ]);
    c.actions.restoreOfficeDocument('doc-w9');
    c.actions.updateOfficeDocument('doc-w9', { name: 'W-9 (2026)' });
    const d = c.state().core.officeDocuments.find(x => x.id === 'doc-w9')!;
    expect(d).toMatchObject({ name: 'W-9 (2026)', kind: 'w9' });
  });

  it('refuses a version on an archived document, or one that is gone, or a bad expiry', () => {
    const c = core();
    c.actions.archiveOfficeDocument('doc-w9');
    c.actions.addOfficeDocumentVersion('doc-w9', { file: PDF });
    c.actions.addOfficeDocumentVersion('doc-nope', { file: PDF });
    c.actions.addOfficeDocumentVersion('doc-board-list', { file: PDF, expires: 'next June' });
    expect(c.refused).toEqual([
      'Restore the document before adding a version.',
      'That document is no longer in the portal.',
      'Give the expiry as a date, or leave it blank.',
    ]);
  });
});

describe('loading a saved office', () => {
  it('loads a save from before office documents with none, demo or not', () => {
    const { officeDocuments: _drop, ...older } = makeCoreSeed();
    expect(coreSlice.normalise!(older, true)?.officeDocuments).toEqual([]);
    expect(coreSlice.normalise!(older, false)?.officeDocuments).toEqual([]);
  });

  it('loads saved documents unchanged', () => {
    const saved = JSON.parse(JSON.stringify(makeCoreSeed()));
    expect(coreSlice.normalise!(saved, true)?.officeDocuments).toEqual(
      makeCoreSeed().officeDocuments,
    );
  });

  it('drops a version it cannot read and checks the archive fields', () => {
    const d = normaliseOfficeDocument({
      id: 'd1',
      kind: 'mystery' as never,
      name: 'Something',
      archivedAt: null as never,
      versions: [
        version('ok', '2026-01-01', '2027-01-01'),
        { id: 'bad', name: 'x.doc', format: 'doc' } as never,
      ],
    });
    expect(d).toEqual({
      id: 'd1',
      kind: 'other',
      name: 'Something',
      versions: [version('ok', '2026-01-01', '2027-01-01')],
    });
  });
});
