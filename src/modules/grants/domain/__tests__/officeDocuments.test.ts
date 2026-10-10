import { describe, expect, it } from 'vitest';
import type { AnyAction } from '../../../../core/module';
import { makeCoreEmpty, makeCoreSeed } from '../../../../core/seed';
import { coreSlice, guardActions } from '../../../../core/store';
import type {
  CoreState,
  OfficeDocument,
  OfficeDocumentVersion,
  PortalState,
  Role,
  SignedInUser,
} from '../../../../core/types';
import {
  linkedOfficeDocument,
  newRegisterLinks,
  officeDocumentsFor,
  officeLinkProblem,
  versionShown,
} from '../officeDocuments';
import { makeEmpty, makeSeed } from '../seed';
import { grantsSlice } from '../slice';
import type { GrantDocument, GrantsState, NewGrantInput } from '../types';

const TODAY = '2026-09-13';
const HA = 'g-herb-alpert-2026'; // submitted Apr 28, 2026
const LAC = 'g-la-county-2026'; // submitted Mar 10, 2025
const WF = 'g-wells-fargo-2025'; // submitted Nov 12, 2024
const PORT = 'g-port-of-long-beach-2026'; // applying, not submitted

const as = (role: Role, id = 's-keisha'): SignedInUser => ({ id, name: 'Someone', role });

const version = (id: string, addedAt: string, expires?: string): OfficeDocumentVersion => ({
  id,
  name: `${id}.pdf`,
  format: 'pdf',
  sizeKb: 100,
  addedAt,
  addedById: 's-denise',
  ...(expires ? { expires } : {}),
});

/** A board list with last year's version (Jul 10, 2025) and this year's (Jul 15, 2026). */
const boardList = (): OfficeDocument => ({
  id: 'doc-board',
  kind: 'board-list',
  name: 'Board of directors',
  versions: [version('old', '2025-07-10', '2026-06-30'), version('new', '2026-07-15')],
});

const submittedOn = (submitted?: string) => ({ dates: submitted ? { submitted } : {} });

function stateOf(core: CoreState = makeCoreSeed(), grants: GrantsState = makeSeed()) {
  return { core, grants } as unknown as PortalState;
}

/** Core and grants behind their real rules, as the store wires them. */
function portal(user: SignedInUser = as('office-manager'), core: CoreState = makeCoreSeed()) {
  let state = stateOf(core);
  let n = 0;
  const refused: string[] = [];
  const getState = () => state;
  const ctx = { today: TODAY, newId: (p: string) => `${p}-t${(n += 1)}`, user };
  const grants = guardActions(
    grantsSlice.createActions(
      (a: AnyAction) => {
        state = { ...state, grants: grantsSlice.reducer(state.grants, a) };
      },
      getState,
      ctx,
    ),
    grantsSlice.rules,
    getState,
    user,
    m => refused.push(m),
  );
  const coreActions = guardActions(
    coreSlice.createActions(
      (a: AnyAction) => {
        state = { ...state, core: coreSlice.reducer(state.core, a) };
      },
      getState,
      ctx,
    ),
    coreSlice.rules,
    getState,
    user,
    m => refused.push(m),
  );
  const row = (id: string) => state.grants.documents.find(d => d.id === id)!;
  const grant = (id: string) => state.grants.grants.find(g => g.id === id)!;
  const shown = (rowId: string) => {
    const r = row(rowId);
    return linkedOfficeDocument(state, r, grant(r.grantId), TODAY);
  };
  return { grants, core: coreActions, refused, state: () => state, row, shown };
}

/** The seeded register row of this kind on this grant. */
const rowOf = (state: PortalState, grantId: string, kind: GrantDocument['kind']) =>
  state.grants.documents.find(d => d.grantId === grantId && d.kind === kind)!;

describe('the version a linked row shows', () => {
  it('is the current version when the grant has no submitted date', () => {
    expect(versionShown(boardList(), submittedOn())?.id).toBe('new');
  });

  it('is the version current on the submitted date: before a newer one was added', () => {
    expect(versionShown(boardList(), submittedOn('2026-04-28'))?.id).toBe('old');
  });

  it('counts a version added on the submitted day itself', () => {
    expect(versionShown(boardList(), submittedOn('2026-07-15'))?.id).toBe('new');
  });

  it('is the newest version when the grant was submitted after it was added', () => {
    expect(versionShown(boardList(), submittedOn('2026-08-20'))?.id).toBe('new');
  });

  it('is missing when no version had been added by the submitted date', () => {
    expect(versionShown(boardList(), submittedOn('2025-03-10'))).toBeUndefined();
  });
});

describe('what a linked row shows', () => {
  const core = (doc: OfficeDocument) => ({ ...makeCoreSeed(), officeDocuments: [doc] });
  const linked = { officeDocumentId: 'doc-board' };

  it('is nothing for a row of its own, or for a document no longer in the portal', () => {
    const state = stateOf(core(boardList()));
    expect(linkedOfficeDocument(state, {}, submittedOn(), TODAY)).toBeUndefined();
    expect(
      linkedOfficeDocument(state, { officeDocumentId: 'doc-gone' }, submittedOn(), TODAY),
    ).toBeUndefined();
  });

  it('shows the current version, with no warning when it does not expire', () => {
    const shown = linkedOfficeDocument(stateOf(core(boardList())), linked, submittedOn(), TODAY)!;
    expect(shown).toMatchObject({ isCurrent: true, archived: false });
    expect(shown.version?.id).toBe('new');
    expect(shown.warning).toBeUndefined();
    expect(shown.submittedOn).toBeUndefined();
  });

  it('warns before submission against today: expires soon, then out of date', () => {
    const doc = { ...boardList(), versions: [version('v', '2026-01-01', '2026-10-01')] };
    const state = stateOf(core(doc));
    expect(linkedOfficeDocument(state, linked, submittedOn(), TODAY)?.warning).toBe('expires-soon');
    expect(linkedOfficeDocument(state, linked, submittedOn(), '2026-10-01')?.warning).toBe(
      'out-of-date',
    );
  });

  it('after submission, shows the older version with no warning for its later expiry', () => {
    const shown = linkedOfficeDocument(
      stateOf(core(boardList())),
      linked,
      submittedOn('2026-04-28'),
      TODAY,
    )!;
    expect(shown.version?.id).toBe('old');
    expect(shown.isCurrent).toBe(false);
    expect(shown.submittedOn).toBe('2026-04-28');
    // It expired Jun 30, 2026, after it went in: nothing to warn about.
    expect(shown.warning).toBeUndefined();
  });

  it('after submission, warns only when the version was already out of date that day', () => {
    const doc = { ...boardList(), versions: [version('v', '2025-01-01', '2026-03-01')] };
    const state = stateOf(core(doc));
    expect(linkedOfficeDocument(state, linked, submittedOn('2026-04-28'), TODAY)?.warning).toBe(
      'out-of-date',
    );
    // Expiring a week after it went in was fine then.
    expect(
      linkedOfficeDocument(state, linked, submittedOn('2026-02-22'), TODAY)?.warning,
    ).toBeUndefined();
  });

  it('still shows a document archived since, marked archived', () => {
    const doc = { ...boardList(), archivedAt: '2026-09-01', archivedById: 's-gwen' };
    const shown = linkedOfficeDocument(stateOf(core(doc)), linked, submittedOn(), TODAY)!;
    expect(shown.archived).toBe(true);
    expect(shown.document.name).toBe('Board of directors');
    expect(shown.version?.id).toBe('new');
  });

  it('says when no version had been added by the submitted date', () => {
    const shown = linkedOfficeDocument(
      stateOf(core(boardList())),
      linked,
      submittedOn('2025-03-10'),
      TODAY,
    )!;
    expect(shown.version).toBeUndefined();
    expect(shown.isCurrent).toBe(false);
    expect(shown.warning).toBeUndefined();
  });
});

describe('which office documents a row may use', () => {
  it('offers the documents of the row’s kind, and every one on Other', () => {
    const state = stateOf();
    expect(officeDocumentsFor(state, 'board-list').map(d => d.id)).toEqual(['doc-board-list']);
    expect(officeDocumentsFor(state, 'w9').map(d => d.id)).toEqual(['doc-w9']);
    expect(officeDocumentsFor(state, 'organization-budget').map(d => d.id)).toEqual(['doc-budget']);
    expect(officeDocumentsFor(state, 'other')).toHaveLength(6);
  });

  it('offers nothing for the grant’s own narrative or project budget, or in a new office', () => {
    expect(officeDocumentsFor(stateOf(), 'narrative')).toEqual([]);
    expect(officeDocumentsFor(stateOf(), 'budget')).toEqual([]);
    expect(officeDocumentsFor(stateOf(makeCoreEmpty(), makeEmpty()), 'board-list')).toEqual([]);
    expect(officeDocumentsFor(stateOf(makeCoreEmpty(), makeEmpty()), 'other')).toEqual([]);
  });

  it('leaves archived documents out', () => {
    const core = makeCoreSeed();
    core.officeDocuments = core.officeDocuments.map(d =>
      d.id === 'doc-w9' ? { ...d, archivedAt: '2026-09-01', archivedById: 's-gwen' } : d,
    );
    expect(officeDocumentsFor(stateOf(core), 'w9')).toEqual([]);
  });

  it('refuses a document of another kind, an archived one, or one no longer there', () => {
    const core = makeCoreSeed();
    core.officeDocuments = core.officeDocuments.map(d =>
      d.id === 'doc-w9' ? { ...d, archivedAt: '2026-09-01', archivedById: 's-gwen' } : d,
    );
    const state = stateOf(core);
    expect(officeLinkProblem(state, 'irs-letter', 'doc-board-list')).toBe(
      'Board of directors is not this kind of document. Choose one that is, or set the row to Other.',
    );
    expect(officeLinkProblem(state, 'w9', 'doc-w9')).toBe(
      'W-9 is archived. Restore it on Office › Documents to use it here.',
    );
    expect(officeLinkProblem(state, 'w9', 'doc-w9', 'doc-w9')).toBeUndefined();
    expect(officeLinkProblem(state, 'other', 'doc-gone')).toBe(
      'That office document is no longer in the portal.',
    );
    expect(officeLinkProblem(state, 'other', 'doc-board-list')).toBeUndefined();
    expect(officeLinkProblem(state, 'narrative', undefined)).toBeUndefined();
  });
});

describe('linking and unlinking a row', () => {
  it('links a row to an office document and unlinks it, its own link kept', () => {
    const p = portal();
    const id = p.grants.addDocument({
      grantId: PORT,
      name: 'W-9',
      kind: 'w9',
      status: 'needed',
      url: 'https://drive.example/w9',
    });
    expect(p.shown(id)).toBeUndefined();

    p.grants.linkDocument(id, 'doc-w9');
    expect(p.row(id).officeDocumentId).toBe('doc-w9');
    expect(p.shown(id)?.document.name).toBe('W-9');
    expect(p.row(id).url).toBe('https://drive.example/w9');

    p.grants.unlinkDocument(id);
    expect(p.row(id).officeDocumentId).toBeUndefined();
    expect(p.shown(id)).toBeUndefined();
    expect(p.row(id).url).toBe('https://drive.example/w9');
    expect(p.refused).toEqual([]);
  });

  it('keeps the row’s own status: needed to submitted', () => {
    const p = portal();
    const id = rowOf(p.state(), PORT, 'insurance-certificate').id;
    p.grants.updateDocument(id, { status: 'submitted' });
    expect(p.row(id)).toMatchObject({ status: 'submitted', officeDocumentId: 'doc-insurance' });
  });

  it('adds a row already linked, and saves a link from the edit dialog', () => {
    const p = portal();
    const id = p.grants.addDocument({
      grantId: PORT,
      name: 'Organization budget',
      kind: 'organization-budget',
      status: 'final',
      officeDocumentId: 'doc-budget',
    });
    expect(p.shown(id)?.version?.id).toBe('docv-budget-fy27');
    p.grants.updateDocument(id, { kind: 'other', officeDocumentId: 'doc-w9' });
    expect(p.row(id).officeDocumentId).toBe('doc-w9');
    expect(p.refused).toEqual([]);
  });

  it('refuses a link the row may not have, with why', () => {
    const p = portal();
    const id = rowOf(p.state(), PORT, 'irs-letter').id;
    p.grants.linkDocument(id, 'doc-w9');
    p.grants.updateDocument(id, { kind: 'narrative' });
    expect(p.row(id)).toMatchObject({ kind: 'irs-letter', officeDocumentId: 'doc-irs-letter' });
    expect(p.refused).toEqual([
      'W-9 is not this kind of document. Choose one that is, or set the row to Other.',
      'IRS determination letter is not this kind of document. Choose one that is, or set the row to Other.',
    ]);
  });

  it('keeps a link to a document archived since while the row changes', () => {
    const p = portal(as('admin', 's-gwen'));
    const id = rowOf(p.state(), PORT, 'insurance-certificate').id;
    p.core.archiveOfficeDocument('doc-insurance');
    p.grants.updateDocument(id, { status: 'submitted', name: 'Insurance certificate' });
    expect(p.row(id)).toMatchObject({ status: 'submitted', officeDocumentId: 'doc-insurance' });
    expect(p.shown(id)?.archived).toBe(true);
    expect(p.refused).toEqual([]);
  });

  it('is refused to a role that may not edit the pipeline', () => {
    const p = portal(as('read-only'));
    const id = rowOf(p.state(), PORT, 'w9')?.id ?? rowOf(p.state(), PORT, 'irs-letter').id;
    p.grants.unlinkDocument(id);
    expect(p.row(id).officeDocumentId).toBe('doc-irs-letter');
    expect(p.refused).toHaveLength(1);
  });
});

describe('a new version on Office › Documents', () => {
  it('shows on an unsubmitted grant, and not on a grant submitted before it', () => {
    const p = portal(as('admin', 's-gwen'));
    const port = rowOf(p.state(), PORT, 'insurance-certificate').id;
    const ha = rowOf(p.state(), HA, 'board-list').id;
    const haBefore = p.shown(ha)!.version!.id;
    expect(p.shown(port)).toMatchObject({ isCurrent: true, warning: 'expires-soon' });

    p.core.addOfficeDocumentVersion('doc-insurance', {
      file: { name: 'Certificate of liability insurance 2026-27.pdf', format: 'pdf', sizeKb: 190 },
      expires: '2027-10-01',
    });
    p.core.addOfficeDocumentVersion('doc-board-list', {
      file: { name: 'Board of directors 2026-27 amended.pdf', format: 'pdf', sizeKb: 98 },
    });

    const portShown = p.shown(port)!;
    expect(portShown.version?.name).toBe('Certificate of liability insurance 2026-27.pdf');
    expect(portShown.version?.addedAt).toBe(TODAY);
    expect(portShown.warning).toBeUndefined();
    // The Herb Alpert grant went in on Apr 28, 2026 and keeps what it sent.
    expect(p.shown(ha)!.version!.id).toBe(haBefore);
    expect(p.refused).toEqual([]);
  });
});

describe('a new grant’s register', () => {
  const input: NewGrantInput = {
    funderId: 'f-herb-alpert',
    title: 'New grant',
    programs: ['in-school'],
    restriction: 'restricted',
    ownerId: 's-barry',
    loiRequired: false,
    amountRequested: 10000,
    templateId: null,
  };

  it('links the IRS letter, board list and financials to the office’s documents', () => {
    const p = portal();
    const id = p.grants.addGrant(input);
    const rows = p.state().grants.documents.filter(d => d.grantId === id);
    expect(Object.fromEntries(rows.map(r => [r.kind, r.officeDocumentId]))).toEqual({
      narrative: undefined,
      budget: undefined,
      'irs-letter': 'doc-irs-letter',
      'board-list': 'doc-board-list',
      financials: 'doc-financials',
    });
    expect(rows.every(r => r.status === 'needed')).toBe(true);
  });

  it('leaves a row unlinked when the office has no current document of its kind', () => {
    const core = makeCoreSeed();
    core.officeDocuments = core.officeDocuments
      .filter(d => d.kind !== 'financials')
      .map(d =>
        d.kind === 'board-list' ? { ...d, archivedAt: '2026-09-01', archivedById: 's-gwen' } : d,
      );
    const p = portal(as('office-manager'), core);
    const id = p.grants.addGrant(input);
    const rows = p.state().grants.documents.filter(d => d.grantId === id && d.officeDocumentId);
    expect(rows.map(r => r.kind)).toEqual(['irs-letter']);
  });

  it('links a renewal’s register the same way', () => {
    const p = portal();
    const id = p.grants.renewGrant({
      grantId: HA,
      title: 'General operating support 2027',
      dates: {},
      ownerId: 's-barry',
      programs: ['general-operating'],
    });
    const rows = p.state().grants.documents.filter(d => d.grantId === id && d.officeDocumentId);
    expect(rows.map(r => r.officeDocumentId).sort()).toEqual([
      'doc-board-list',
      'doc-financials',
      'doc-irs-letter',
    ]);
    expect(p.refused).toEqual([]);
  });

  it('links a grant brought in under way only where a version was on file when it went in', () => {
    const p = portal();
    const id = p.grants.addGrant({
      ...input,
      phase: 'active',
      dates: { submitted: '2025-03-10', decided: '2025-06-01' },
      inFlight: { amountAwarded: 8000 },
    });
    expect(p.refused).toEqual([]);
    const rows = p.state().grants.documents.filter(d => d.grantId === id);
    expect(rows.every(r => r.status === 'submitted')).toBe(true);
    // Only last year's financials were on file on Mar 10, 2025; the IRS letter and the board
    // list came later, so those rows stay rows of their own.
    expect(rows.filter(r => r.officeDocumentId).map(r => r.kind)).toEqual(['financials']);
    const financials = rows.find(r => r.kind === 'financials')!;
    expect(p.shown(financials.id)?.version?.id).toBe('docv-financials-fy24');
  });

  it('links nothing for a grant brought in that went in before any document was added', () => {
    const p = portal();
    const id = p.grants.addGrant({
      ...input,
      phase: 'awarded',
      dates: { submitted: '2024-06-01' },
      inFlight: { amountAwarded: 8000 },
    });
    const rows = p.state().grants.documents.filter(d => d.grantId === id);
    expect(rows).toHaveLength(5);
    expect(rows.some(r => r.officeDocumentId)).toBe(false);
  });

  it('links nothing in a new office with no documents', () => {
    expect(newRegisterLinks(stateOf(makeCoreEmpty(), makeEmpty()))).toEqual({});
  });
});

describe('the demo', () => {
  const state = stateOf();
  const shown = (grantId: string, kind: GrantDocument['kind']) =>
    linkedOfficeDocument(
      state,
      rowOf(state, grantId, kind),
      state.grants.grants.find(g => g.id === grantId)!,
      TODAY,
    );

  it('shows a grant submitted last year the financials it sent, older than the current', () => {
    const lac = shown(LAC, 'financials')!;
    expect(lac.version?.id).toBe('docv-financials-fy24');
    expect(lac.isCurrent).toBe(false);
    expect(shown(HA, 'board-list')?.version?.id).toBe('docv-board-list-2025');
  });

  it('links only where the version that went in is on file', () => {
    expect(shown(LAC, 'irs-letter')).toBeUndefined();
    expect(shown(WF, 'financials')).toBeUndefined();
    expect(shown(HA, 'irs-letter')?.isCurrent).toBe(true);
  });

  it('shows the Port’s insurance certificate expiring soon', () => {
    expect(shown(PORT, 'insurance-certificate')).toMatchObject({
      isCurrent: true,
      warning: 'expires-soon',
    });
  });
});

describe('saved data', () => {
  it('loads a register saved before links unchanged: its rows stay unlinked', () => {
    const saved = makeSeed();
    saved.documents = saved.documents.map(({ officeDocumentId: _id, ...row }) => row);
    const loaded = grantsSlice.normalise!(JSON.parse(JSON.stringify(saved)))!;
    expect(loaded.documents).toEqual(saved.documents);
    expect(loaded.documents.some(d => d.officeDocumentId)).toBe(false);
  });

  it('keeps a saved link', () => {
    const loaded = grantsSlice.normalise!(JSON.parse(JSON.stringify(makeSeed())))!;
    expect(rowOf(stateOf(makeCoreSeed(), loaded), LAC, 'financials').officeDocumentId).toBe(
      'doc-financials',
    );
  });
});
