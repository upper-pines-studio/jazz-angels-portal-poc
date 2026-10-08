import { describe, expect, it } from 'vitest';
import {
  activeOnly,
  archiveFields,
  archivedBy,
  isArchived,
  normaliseArchived,
  pickable,
  restoreFields,
  withArchived,
} from '../archive';
import { checkSignIn, hashCredential, staffRefusal } from '../auth';
import type { Credential } from '../auth';
import { staffById, venuesForOrganization } from '../derive';
import { makeCoreSeed } from '../seed';
import { coreSlice, describeCoreChange, guardActions, newId } from '../store';
import type { PortalState, Role, SignedInUser } from '../types';

const TODAY = '2026-10-07';
const GWEN: SignedInUser = { id: 's-gwen', name: 'Gwen Kimura', role: 'admin' };

/** The core slice with its rules, as the store wires it, for one signed-in person. */
function core(user: SignedInUser) {
  let state = { core: makeCoreSeed() } as unknown as PortalState;
  const refused: string[] = [];
  const getState = () => state;
  const actions = guardActions(
    coreSlice.createActions(
      a => {
        state = { ...state, core: coreSlice.reducer(state.core, a) };
      },
      getState,
      { today: TODAY, newId, user },
    ),
    coreSlice.rules,
    getState,
    user,
    m => refused.push(m),
  );
  return { actions, refused, state: () => state };
}

const person = (role: Role, id = 's-someone'): SignedInUser => ({ id, name: 'Someone', role });

describe('the archive helpers', () => {
  const rows = [
    { id: 'a' },
    { id: 'b', archivedAt: '2026-10-01', archivedById: 's-gwen' },
    { id: 'c' },
  ];

  it('reads archived from the date', () => {
    expect(isArchived(rows[0])).toBe(false);
    expect(isArchived(rows[1])).toBe(true);
    expect(isArchived(undefined)).toBe(false);
    expect(archivedBy(rows[1], '2026-09-30')).toBe(false);
    expect(archivedBy(rows[1], '2026-10-01')).toBe(true);
  });

  it('lists the current ones, or every one with the archived last', () => {
    expect(activeOnly(rows).map(r => r.id)).toEqual(['a', 'c']);
    expect(withArchived(rows, false).map(r => r.id)).toEqual(['a', 'c']);
    expect(withArchived(rows, true).map(r => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('keeps an archived choice in a picker that already has it', () => {
    expect(pickable(rows).map(r => r.id)).toEqual(['a', 'c']);
    expect(pickable(rows, 'b').map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('archives with today and the person, and restores by clearing both', () => {
    expect(archiveFields(GWEN, TODAY)).toEqual({ archivedAt: TODAY, archivedById: 's-gwen' });
    expect(restoreFields()).toEqual({ archivedAt: undefined, archivedById: undefined });
  });

  it('drops archive fields that are not strings, and a person without a date', () => {
    expect(normaliseArchived({ id: 'x', archivedAt: null, archivedById: null })).toEqual({
      id: 'x',
    });
    expect(normaliseArchived({ id: 'x', archivedById: 's-gwen' })).toEqual({ id: 'x' });
    const kept = { id: 'x', archivedAt: TODAY, archivedById: 's-gwen' };
    expect(normaliseArchived(kept)).toBe(kept);
  });
});

describe('archiving and restoring a person', () => {
  it('archives and restores, credited to whoever did it', () => {
    const h = core(GWEN);
    h.actions.archiveStaff('s-devon');
    expect(h.state().core.staff.find(s => s.id === 's-devon')).toMatchObject({
      archivedAt: TODAY,
      archivedById: 's-gwen',
    });
    // Their record stays, so everything they did still names them.
    expect(staffById(h.state(), 's-devon')?.name).toBe('Devon Price');

    h.actions.restoreStaff('s-devon');
    const back = h.state().core.staff.find(s => s.id === 's-devon')!;
    expect(isArchived(back)).toBe(false);
    // Cleared, so a save writes neither field.
    expect(JSON.parse(JSON.stringify(back))).not.toHaveProperty('archivedAt');
    expect(h.refused).toEqual([]);
  });

  it('lists the staff without the archived by default', () => {
    const h = core(GWEN);
    h.actions.archiveStaff('s-renee');
    const ids = activeOnly(h.state().core.staff).map(s => s.id);
    expect(ids).not.toContain('s-renee');
    expect(withArchived(h.state().core.staff, true).at(-1)?.id).toBe('s-renee');
  });

  it('refuses archiving yourself', () => {
    const h = core(GWEN);
    h.actions.archiveStaff('s-gwen');
    expect(h.refused).toEqual(["You can't archive yourself. Ask someone else who manages staff."]);
    expect(isArchived(h.state().core.staff.find(s => s.id === 's-gwen'))).toBe(false);
  });

  it('refuses a Director archiving themself with the same words', () => {
    const h = core(person('director', 's-barry'));
    h.actions.archiveStaff('s-barry');
    expect(h.refused).toEqual(["You can't archive yourself. Ask someone else who manages staff."]);
    expect(isArchived(h.state().core.staff.find(s => s.id === 's-barry'))).toBe(false);
  });

  it('follows the staff rule: a Director archives a teacher, not an Admin', () => {
    const h = core(person('director', 's-barry'));
    h.actions.archiveStaff('s-devon');
    expect(isArchived(h.state().core.staff.find(s => s.id === 's-devon'))).toBe(true);
    h.actions.archiveStaff('s-gwen');
    expect(isArchived(h.state().core.staff.find(s => s.id === 's-gwen'))).toBe(false);
    expect(h.refused).toHaveLength(1);
  });

  it('refuses a role that may not edit staff', () => {
    const h = core(person('office-manager', 's-keisha'));
    h.actions.archiveStaff('s-devon');
    h.actions.restoreStaff('s-devon');
    expect(h.refused).toEqual([
      "You can't do that as an Office manager.",
      "You can't do that as an Office manager.",
    ]);
  });

  it('keeps an archived login archived when the saved staff is loaded', () => {
    const saved = makeCoreSeed();
    saved.staff = saved.staff.map(s =>
      s.id === 's-devon' ? { ...s, archivedAt: TODAY, archivedById: 's-gwen' } : s,
    );
    for (const demo of [true, false]) {
      const loaded = coreSlice.normalise!(JSON.parse(JSON.stringify(saved)), demo)!;
      const devon = loaded.staff.filter(s => s.id === 's-devon');
      expect(devon).toHaveLength(1);
      expect(devon[0]).toMatchObject({ archivedAt: TODAY, archivedById: 's-gwen' });
    }
  });

  it('names the change for a failed save', () => {
    expect(
      describeCoreChange({
        type: 'core/update-staff',
        id: 's-devon',
        patch: archiveFields(GWEN, TODAY),
      }),
    ).toBe('the archive change');
    expect(
      describeCoreChange({ type: 'core/update-venue', id: 'v-studio', patch: restoreFields() }),
    ).toBe('the archive change');
    expect(describeCoreChange({ type: 'core/update-venue', id: 'v-studio', patch: {} })).toBe(
      'the venue',
    );
  });
});

describe('sign-in for an archived person', () => {
  async function users(): Promise<readonly Credential[]> {
    return [{ username: 'devon', staffId: 's-devon', hash: await hashCredential('devon', 'pw') }];
  }

  it('is refused as archived, and restored it goes through again', async () => {
    const staff = makeCoreSeed().staff.map(s =>
      s.id === 's-devon' ? { ...s, ...archiveFields(GWEN, TODAY) } : s,
    );
    await expect(checkSignIn('devon', 'pw', staff, await users())).resolves.toEqual({
      ok: false,
      reason: 'archived',
    });
    // A wrong password still says mismatch, so the archive is not given away.
    await expect(checkSignIn('devon', 'nope', staff, await users())).resolves.toEqual({
      ok: false,
      reason: 'mismatch',
    });
    const restored = staff.map(s => (s.id === 's-devon' ? { ...s, ...restoreFields() } : s));
    await expect(checkSignIn('devon', 'pw', restored, await users())).resolves.toMatchObject({
      ok: true,
    });
  });

  it('turns away a saved session the same way', () => {
    const staff = makeCoreSeed().staff;
    const devon = { username: 'devon', staffId: 's-devon' };
    expect(staffRefusal(devon, staff)).toBeNull();
    expect(
      staffRefusal(
        devon,
        staff.map(s => (s.id === 's-devon' ? { ...s, ...archiveFields(GWEN, TODAY) } : s)),
      ),
    ).toBe('archived');
    expect(staffRefusal({ username: 'x', staffId: 's-gone' }, staff)).toBe('no-staff');
  });
});

describe('archiving partners and venues', () => {
  it('archives and restores an organization without touching its venues', () => {
    const h = core(person('office-manager', 's-keisha'));
    h.actions.archiveOrganization('org-paramount-usd');
    const org = h.state().core.organizations[0];
    expect(org).toMatchObject({ archivedAt: TODAY, archivedById: 's-keisha' });
    // Nothing cascades.
    expect(activeOnly(h.state().core.venues).map(v => v.id)).toContain('v-paramount-ms');
    expect(activeOnly(h.state().core.organizations)).toHaveLength(0);
    h.actions.restoreOrganization('org-paramount-usd');
    expect(isArchived(h.state().core.organizations[0])).toBe(false);
  });

  it('archives a venue out of its organization’s list, and restores it', () => {
    const h = core(person('office-manager', 's-keisha'));
    h.actions.archiveVenue('v-alondra-ms');
    const names = (all: boolean) =>
      venuesForOrganization(h.state(), 'org-paramount-usd', all).map(v => v.id);
    expect(names(false)).toEqual(['v-paramount-ms']);
    expect(names(true)).toEqual(['v-paramount-ms', 'v-alondra-ms']);
    h.actions.restoreVenue('v-alondra-ms');
    expect(names(false)).toEqual(['v-paramount-ms', 'v-alondra-ms']);
  });

  it('needs the partners row to archive or restore', () => {
    const h = core(person('teacher'));
    h.actions.archiveVenue('v-studio');
    h.actions.archiveOrganization('org-paramount-usd');
    expect(h.refused).toHaveLength(2);
    expect(activeOnly(h.state().core.venues)).toHaveLength(3);
  });

  it('migrates a stored partner or venue whose archive fields are not strings', () => {
    const saved = makeCoreSeed() as unknown as Record<string, unknown>;
    const c = saved as unknown as ReturnType<typeof makeCoreSeed>;
    (c.venues[0] as unknown as Record<string, unknown>).archivedAt = null;
    (c.organizations[0] as unknown as Record<string, unknown>).archivedById = 's-gwen';
    const loaded = coreSlice.normalise!(saved, true)!;
    expect(loaded.venues[0]).not.toHaveProperty('archivedAt');
    expect(loaded.organizations[0]).not.toHaveProperty('archivedById');
  });
});
