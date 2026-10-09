import { describe, expect, it } from 'vitest';
import { fundingSummary, targetBudget } from '../../../../core/derive';
import type { AnyAction } from '../../../../core/module';
import { makeCoreSeed } from '../../../../core/seed';
import { coreSlice, guardActions } from '../../../../core/store';
import type { FundingTarget, PortalState, Role, SignedInUser } from '../../../../core/types';
import { makeEmpty, makeSeed } from '../seed';
import {
  defaultShareYear,
  fundingFor,
  giveWarnings,
  givingGrants,
  grantGiving,
  grantsPayingFor,
  grantStanding,
  targetWarnings,
} from '../shares';
import { grantsSlice } from '../slice';

const TODAY = '2026-09-13';
const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const PORT = 'g-port-of-long-beach-2026';
const ACLB = 'g-arts-council-lb-2026';

type ProgramYear = Extract<FundingTarget, { kind: 'program' }>;

const fy27 = (programId: string): ProgramYear => ({
  kind: 'program',
  programId,
  fiscalYear: 'FY27',
});
const project = (projectId: string): FundingTarget => ({ kind: 'project', projectId });

const seeded = () => ({ core: makeCoreSeed(), grants: makeSeed() }) as unknown as PortalState;
const as = (role: Role, id = 's-keisha'): SignedInUser => ({ id, name: 'Someone', role });

/** Core and grants behind their real rules, for one signed-in person. */
function portal(user: SignedInUser = as('office-manager')) {
  let state = seeded();
  let n = 0;
  const refused: string[] = [];
  const sent: AnyAction[] = [];
  const getState = () => state;
  const ctx = { today: TODAY, newId: (p: string) => `${p}-t${(n += 1)}`, user };
  const grants = guardActions(
    grantsSlice.createActions(
      a => {
        sent.push(a);
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
  const core = guardActions(
    coreSlice.createActions(
      a => {
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
  return { grants, core, refused, sent, state: () => state };
}

/** A program's or project's sheet: its budget and what pays toward it. */
const sheet = (state: PortalState, target: FundingTarget) =>
  fundingSummary(targetBudget(state, target), fundingFor(state, target));

describe('the demo seed (the prototype the director saw)', () => {
  const state = seeded();

  it('has the Port of Long Beach grant restricted to In-School and Homeschool, giving to both', () => {
    const port = grantGiving(state, PORT)!;
    expect(port.grant.restriction).toBe('restricted');
    expect(port.grant.programs).toEqual(['in-school', 'homeschool']);
    expect(port.shares.map(s => [s.name, s.share.amount, s.warnings])).toEqual([
      ['In-School Program, FY27', 9000, []],
      ['Homeschool Program, FY27', 4000, []],
    ]);
  });

  it('reproduces each grant’s given and not yet given', () => {
    const giving = (id: string) => {
      const g = grantGiving(state, id)!;
      return [g.standing, g.total, g.given, g.notYetGiven];
    };
    expect(giving(HA)).toEqual(['awarded', 50000, 48000, 2000]);
    expect(giving(LBCF)).toEqual(['awarded', 8500, 8500, 0]);
    expect(giving(PORT)).toEqual(['if-awarded', 15000, 13000, 2000]);
    expect(giving('g-parsons-2026')).toEqual(['if-awarded', 30000, 10000, 20000]);
    expect(giving(ACLB)).toEqual(['if-awarded', 7500, 4000, 3500]);
  });

  it('reproduces each program’s FY27 sheet: budget, awarded, if awarded, still to find', () => {
    const figures = (programId: string) => {
      const s = sheet(state, fy27(programId));
      return [s.budget, s.awarded, s.ifAwarded, s.stillToFind];
    };
    expect(figures('general-operating')).toEqual([20000, 15000, 0, 5000]);
    expect(figures('studio-sessions')).toEqual([18000, 15300, 0, 2700]);
    expect(figures('in-school')).toEqual([15000, 6000, 9000, 0]);
    expect(figures('homeschool')).toEqual([6000, 0, 4000, 2000]);
    expect(figures('jazz-legacy')).toEqual([10000, 0, 10000, 0]);
    expect(figures('advanced-workshop')).toEqual([8000, 0, 0, 8000]);
  });

  it('reproduces each project’s sheet, whatever fiscal years it runs in', () => {
    const figures = (id: string) => {
      const s = sheet(state, project(id));
      return [s.budget, s.awarded, s.ifAwarded, s.stillToFind];
    };
    expect(figures('prj-instruments')).toEqual([6500, 5000, 0, 1500]);
    expect(figures('prj-showcase')).toEqual([9000, 7200, 0, 1800]);
    expect(figures('prj-intensive')).toEqual([14000, 8000, 4000, 2000]);
  });

  it('counts a program share toward its own fiscal year only', () => {
    expect(fundingFor(state, { ...fy27('studio-sessions'), fiscalYear: 'FY28' })).toEqual([]);
  });

  it('lists who pays, awarded first, with what each has not yet given', () => {
    expect(
      fundingFor(state, fy27('in-school')).map(s => [
        s.label,
        s.amount,
        s.ifAwarded,
        s.notYetGiven,
        s.href,
      ]),
    ).toEqual([
      ['Herb Alpert', 6000, false, 2000, `/grants/${HA}?tab=award`],
      ['Port of Long Beach', 9000, true, 2000, `/grants/${PORT}?tab=award`],
    ]);
    expect(grantsPayingFor(state, project('prj-intensive')).map(g => g.id)).toEqual([HA, ACLB]);
  });

  it('offers the grants with money to give, awarded first, largest first', () => {
    expect(givingGrants(state).map(g => g.grant.id)).toEqual([
      HA,
      'g-la-county-2026',
      'g-wells-fargo-2025',
      LBCF,
      'g-parsons-2026',
      PORT,
      ACLB,
      'g-signal-hill-2026',
    ]);
  });
});

describe('warnings, never refusals', () => {
  const state = seeded();
  const grant = (id: string) => state.grants.grants.find(g => g.id === id)!;

  it('warns when a restricted grant’s money goes outside its programs', () => {
    expect(targetWarnings(state, grant(PORT), fy27('studio-sessions'))).toEqual([
      {
        kind: 'outside-restriction',
        message: 'Restricted to In-School Program and Homeschool Program',
      },
    ]);
    // Through a project, by the project's program.
    expect(targetWarnings(state, grant(PORT), project('prj-showcase')).map(w => w.kind)).toEqual([
      'outside-restriction',
    ]);
    // An unrestricted grant's money goes anywhere.
    expect(targetWarnings(state, grant(HA), fy27('jazz-legacy'))).toEqual([]);
  });

  it('warns when a project falls outside the grant period', () => {
    expect(targetWarnings(state, grant(HA), project('prj-intensive'))).toEqual([
      {
        kind: 'project-outside-period',
        message: 'Runs past the grant period, which ends Jun 30, 2027',
      },
    ]);
    expect(targetWarnings(state, grant(LBCF), project('prj-showcase'))).toEqual([
      {
        kind: 'project-outside-period',
        message: 'The grant period ends Feb 28, 2027, before this project starts',
      },
    ]);
    expect(targetWarnings(state, grant(LBCF), project('prj-instruments'))).toEqual([]);
    // A pending grant with no period yet has nothing to fall outside.
    expect(targetWarnings(state, grant(ACLB), project('prj-intensive'))).toEqual([]);
  });

  it('warns when a program’s year starts after the grant period ends', () => {
    expect(
      targetWarnings(state, grant(HA), { ...fy27('studio-sessions'), fiscalYear: 'FY28' }),
    ).toEqual([
      {
        kind: 'year-after-period',
        message: 'FY28 starts after the grant period ends, Jun 30, 2027',
      },
    ]);
    expect(targetWarnings(state, grant(HA), fy27('studio-sessions'))).toEqual([]);
  });

  it('warns when more is given out than the grant has, before and after giving', () => {
    expect(giveWarnings(state, { grantId: HA, target: fy27('homeschool'), amount: 2000 })).toEqual(
      [],
    );
    expect(giveWarnings(state, { grantId: HA, target: fy27('homeschool'), amount: 2500 })).toEqual([
      { kind: 'over-given', message: '$500 more than the grant has' },
    ]);

    const p = portal();
    p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 2500 });
    expect(p.refused).toEqual([]);
    const ha = grantGiving(p.state(), HA)!;
    expect(ha.notYetGiven).toBe(-500);
    expect(ha.warnings.map(w => w.kind)).toEqual(['over-given']);
    expect(fundingFor(p.state(), fy27('homeschool'))[0].warnings).toEqual([
      '$500 more than the grant has',
    ]);
  });

  it('does not count a share it is replacing twice', () => {
    const share = state.grants.grantShares.find(
      s => s.grantId === LBCF && s.target.kind === 'program',
    )!;
    expect(
      giveWarnings(state, { grantId: LBCF, target: share.target, amount: 5300 }, share),
    ).toEqual([]);
  });
});

describe('giving, changing and taking back a share', () => {
  it('gives to a program year and logs it on the grant, in one change', () => {
    const p = portal();
    const id = p.grants.giveShare({
      grantId: HA,
      target: { kind: 'program', programId: 'homeschool', fiscalYear: 'FY27' },
      amount: 1500,
    });
    expect(p.state().grants.grantShares.find(s => s.id === id)).toEqual({
      id,
      grantId: HA,
      target: fy27('homeschool'),
      amount: 1500,
    });
    expect(p.sent).toHaveLength(1);
    expect(grantsSlice.describe!(p.sent[0])).toBe('the share');
    expect(p.state().grants.activity.at(-1)).toMatchObject({
      grantId: HA,
      whoId: 's-keisha',
      text: 'Gave $1,500 to Homeschool Program, FY27',
    });
  });

  it('defaults a program share to the fiscal year the grant period starts in', () => {
    const p = portal();
    const state = p.state();
    const grant = (id: string) => state.grants.grants.find(g => g.id === id)!;
    expect(defaultShareYear(state, grant(HA), TODAY)).toBe('FY27');
    expect(defaultShareYear(state, grant(LBCF), TODAY)).toBe('FY26');
    // No grant period yet: the year it is given in.
    expect(defaultShareYear(state, grant(PORT), TODAY)).toBe('FY27');

    const id = p.grants.giveShare({
      grantId: LBCF,
      target: { kind: 'program', programId: 'studio-sessions' },
      amount: 100,
    });
    expect(p.state().grants.grantShares.find(s => s.id === id)?.target).toEqual({
      ...fy27('studio-sessions'),
      fiscalYear: 'FY26',
    });
  });

  it('gives to a project with no fiscal year', () => {
    const p = portal();
    const id = p.grants.giveShare({
      grantId: PORT,
      target: { kind: 'project', projectId: 'prj-instruments' },
      amount: 500,
    });
    expect(p.state().grants.grantShares.find(s => s.id === id)?.target).toEqual(
      project('prj-instruments'),
    );
    // A restricted grant outside its programs: a warning, and the share is given.
    expect(
      grantGiving(p.state(), PORT)!
        .shares.at(-1)
        ?.warnings.map(w => w.kind),
    ).toEqual(['outside-restriction']);
  });

  it('adds to the share a grant already gives to the same program year or project', () => {
    const p = portal();
    const before = p.state().grants.grantShares.length;
    const id = p.grants.giveShare({ grantId: HA, target: fy27('in-school'), amount: 1000 });
    expect(p.state().grants.grantShares).toHaveLength(before);
    expect(p.state().grants.grantShares.find(s => s.id === id)?.amount).toBe(7000);
    // Another year is another share.
    p.grants.giveShare({
      grantId: HA,
      target: { ...fy27('in-school'), fiscalYear: 'FY28' },
      amount: 1000,
    });
    expect(p.state().grants.grantShares).toHaveLength(before + 1);
  });

  it('changes a share’s amount and a program share’s year, and logs both', () => {
    const p = portal();
    const share = p.state().grants.grantShares.find(s => s.grantId === LBCF)!;
    p.grants.changeShare(share.id, { amount: 5000, fiscalYear: 'FY26' });
    expect(p.state().grants.grantShares.find(s => s.id === share.id)).toMatchObject({
      amount: 5000,
      target: { kind: 'program', programId: 'studio-sessions', fiscalYear: 'FY26' },
    });
    expect(p.state().grants.activity.at(-1)?.text).toBe(
      'Changed the share to Studio Semester Sessions from $5,300 to $5,000 and from FY27 to FY26',
    );
    const before = p.sent.length;
    p.grants.changeShare(share.id, { amount: 5000 });
    expect(p.sent).toHaveLength(before);
  });

  it('takes a share back: the money is not yet given again', () => {
    const p = portal();
    const share = p.state().grants.grantShares.find(s => s.grantId === PORT)!;
    p.grants.takeBackShare(share.id);
    expect(p.state().grants.grantShares.some(s => s.id === share.id)).toBe(false);
    expect(grantGiving(p.state(), PORT)!.notYetGiven).toBe(11000);
    expect(p.state().grants.activity.at(-1)).toMatchObject({
      grantId: PORT,
      text: 'Took back $9,000 from In-School Program, FY27',
    });
  });

  it('refuses only what cannot be saved, saying why', () => {
    const p = portal();
    const projectShare = p.state().grants.grantShares.find(s => s.target.kind === 'project')!;
    const lbcf = p.state().grants.grantShares.find(s => s.grantId === LBCF)!;
    p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 0 });
    p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 10.5 });
    p.grants.giveShare({
      grantId: 'g-california-arts-council-2026',
      target: fy27('in-school'),
      amount: 1,
    });
    p.grants.giveShare({ grantId: 'g-boeing-2026', target: fy27('studio-sessions'), amount: 1 });
    p.grants.giveShare({ grantId: HA, target: fy27('p-gone'), amount: 1 });
    p.grants.giveShare({
      grantId: HA,
      target: { kind: 'program', programId: 'homeschool', fiscalYear: '2027' },
      amount: 1,
    });
    p.grants.giveShare({ grantId: HA, target: project('prj-gone'), amount: 1 });
    p.grants.changeShare(projectShare.id, { fiscalYear: 'FY28' });
    p.grants.changeShare(lbcf.id, { amount: -5 });
    p.grants.changeShare('gs-gone', { amount: 5 });
    expect(p.refused).toEqual([
      'Enter an amount in whole dollars, more than $0.',
      'Enter an amount in whole dollars, more than $0.',
      'A grant has money to give once it reaches LOI or later.',
      'This grant was declined, so it has no money to give.',
      'That program is no longer in the portal.',
      'Pick the fiscal year the money counts toward.',
      'That project is no longer in the portal.',
      'A share to a project has no fiscal year: it counts in every year the project runs.',
      'Enter an amount in whole dollars, more than $0.',
      'That share is no longer on the grant.',
    ]);
    expect(p.sent).toEqual([]);
  });

  it('refuses moving a share onto a year the grant already gives to', () => {
    const p = portal();
    p.grants.giveShare({
      grantId: HA,
      target: { ...fy27('in-school'), fiscalYear: 'FY28' },
      amount: 1000,
    });
    const fy27Share = p
      .state()
      .grants.grantShares.find(
        s =>
          s.grantId === HA &&
          s.target.kind === 'program' &&
          s.target.programId === 'in-school' &&
          s.target.fiscalYear === 'FY27',
      )!;
    p.grants.changeShare(fy27Share.id, { fiscalYear: 'FY28' });
    expect(p.refused).toEqual([
      'This grant already gives to In-School Program, FY28. Change that share instead.',
    ]);
  });

  it('refuses an archived grant', () => {
    const p = portal();
    p.grants.archiveGrant(HA);
    p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 1 });
    expect(p.refused).toEqual(['This grant is archived. Restore it first.']);
    // Its shares stop counting anywhere.
    expect(grantStanding(p.state().grants.grants.find(g => g.id === HA)!)).toBe('none');
    expect(fundingFor(p.state(), fy27('studio-sessions')).map(s => s.id)).toEqual([LBCF]);
  });

  it('follows "Grant shares": the bookkeeper gives, the assistant and the read-only may not', () => {
    for (const role of ['admin', 'director', 'office-manager', 'bookkeeper'] as Role[]) {
      const p = portal(as(role));
      p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 100 });
      expect(p.refused).toEqual([]);
    }
    for (const role of ['assistant', 'teacher', 'read-only'] as Role[]) {
      const p = portal(as(role));
      const share = p.state().grants.grantShares[0];
      p.grants.giveShare({ grantId: HA, target: fy27('homeschool'), amount: 100 });
      p.grants.changeShare(share.id, { amount: 1 });
      p.grants.takeBackShare(share.id);
      expect(p.sent).toEqual([]);
      expect(p.refused).toHaveLength(3);
    }
  });
});

describe('a declined grant and an archived project', () => {
  it('stops counting a declined grant’s shares, and keeps them', () => {
    const p = portal();
    p.grants.transition(PORT, 'declined', { date: TODAY });
    expect(fundingFor(p.state(), fy27('in-school')).map(s => s.id)).toEqual([HA]);
    expect(p.state().grants.grantShares.filter(s => s.grantId === PORT)).toHaveLength(2);
    expect(grantGiving(p.state(), PORT)!.total).toBe(0);
  });

  it('keeps an archived project’s shares in history, freeing the money they held', () => {
    const p = portal();
    p.core.archiveProject('prj-showcase');
    expect(p.refused).toEqual([]);
    const ha = grantGiving(p.state(), HA)!;
    expect(ha.given).toBe(42000);
    expect(ha.notYetGiven).toBe(8000);
    const showcase = ha.shares.find(s => s.name === 'Spring Showcase 2027')!;
    expect(showcase).toMatchObject({ archived: true, counts: false });
    // The project's own sheet still shows who paid.
    expect(fundingFor(p.state(), project('prj-showcase')).map(s => s.id)).toEqual([HA, LBCF]);
    // No new money goes to it.
    p.grants.giveShare({ grantId: ACLB, target: project('prj-showcase'), amount: 1 });
    expect(p.refused).toEqual(['This project is archived. Restore it first.']);
    // Restored, it counts again.
    p.core.restoreProject('prj-showcase');
    expect(grantGiving(p.state(), HA)!.given).toBe(48000);
  });
});

describe('loading and starting', () => {
  it('loads a save from before shares with none, demo or not', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    delete saved.grantShares;
    for (const demo of [false, true]) {
      const loaded = grantsSlice.normalise!(saved, demo)!;
      expect(loaded.grantShares).toEqual([]);
      expect(loaded.grants).toEqual(makeSeed().grants);
    }
  });

  it('loads saved shares as they are, dropping one it cannot read', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    saved.grantShares.push({ id: 'gs-broken', grantId: HA, target: { kind: 'program' } });
    expect(grantsSlice.normalise!(saved)!.grantShares).toEqual(makeSeed().grantShares);
  });

  it('starts a new office with no shares', () => {
    expect(makeEmpty().grantShares).toEqual([]);
  });
});
