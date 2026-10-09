import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { archiveFields, isArchived, normaliseArchived, restoreFields } from './archive';
import { DEMO_TODAY_KEY, demoTodayFrom, demoTodayToStore, isDemo } from './demo';
import { programFields, programProblem } from './derive';
import { toISO } from './format';
import type { ActionRules, AnyAction, ModuleSlice } from './module';
import { OWN_ROLE_REFUSAL, can, mayChangeStaff } from './permissions';
import type { Need, Subject } from './permissions';
import { REPLACE, createLiveStore } from './live';
import type { Saving } from './live';
import type { Repository } from './persistence';
import * as repository from './repository';
import { localRepository } from './repository';
import type { PortalSlice } from './repository';
import { ROLE_LABELS, isRole } from './roles';
import { DEFAULT_ENABLED_MODULES, loginStaff, makeCoreEmpty, makeCoreSeed } from './seed';
import type {
  AppSettings,
  CoreActions,
  CoreState,
  Organization,
  PortalActions,
  Program,
  PortalState,
  Role,
  SignedInUser,
  StaffMember,
  Venue,
} from './types';

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** `crypto.randomUUID()` where available, with a plain fallback for old runtimes. */
export function newId(prefix: string): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  const raw =
    typeof cryptoObj?.randomUUID === 'function'
      ? cryptoObj.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw.replace(/-/g, '').slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// The core slice
// ---------------------------------------------------------------------------

type CoreAction =
  | { type: 'core/add-staff'; member: StaffMember }
  | { type: 'core/update-staff'; id: string; patch: Partial<StaffMember> }
  | { type: 'core/add-program'; program: Program }
  | { type: 'core/update-program'; id: string; patch: Partial<Program> }
  | { type: 'core/add-organization'; organization: Organization }
  | { type: 'core/update-organization'; id: string; patch: Partial<Organization> }
  | { type: 'core/add-venue'; venue: Venue }
  | { type: 'core/update-venue'; id: string; patch: Partial<Venue> }
  | { type: 'core/update-settings'; patch: Partial<AppSettings> };

function withId<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map(row => (row.id === id ? { ...row, ...patch } : row));
}

function coreReducer(state: CoreState, raw: AnyAction): CoreState {
  const action = raw as CoreAction;
  switch (action.type) {
    case 'core/add-staff':
      return { ...state, staff: [...state.staff, action.member] };
    case 'core/update-staff':
      return { ...state, staff: withId(state.staff, action.id, action.patch) };
    case 'core/add-program':
      if (state.programs.some(p => p.id === action.program.id)) return state;
      return { ...state, programs: [...state.programs, action.program] };
    case 'core/update-program':
      return { ...state, programs: withId(state.programs, action.id, action.patch) };
    case 'core/add-organization':
      return { ...state, organizations: [...state.organizations, action.organization] };
    case 'core/update-organization':
      return { ...state, organizations: withId(state.organizations, action.id, action.patch) };
    case 'core/add-venue':
      return { ...state, venues: [...state.venues, action.venue] };
    case 'core/update-venue':
      return { ...state, venues: withId(state.venues, action.id, action.patch) };
    case 'core/update-settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      return state;
  }
}

/**
 * A person as saved, brought up to date. Before roles existed `role` held the
 * job title; it moves to `title`, and the role comes from the seeded person
 * with the same id, else Teacher for someone who teaches, else Read-only.
 */
function normaliseStaff(raw: Partial<StaffMember>, seeded: StaffMember[]): StaffMember {
  const seed = seeded.find(s => s.id === raw.id);
  const role = isRole(raw.role)
    ? raw.role
    : (seed?.role ?? (raw.teaches ? 'teacher' : 'read-only'));
  const title =
    typeof raw.title === 'string'
      ? raw.title
      : typeof raw.role === 'string' && !isRole(raw.role)
        ? raw.role
        : (seed?.title ?? '');
  return normaliseArchived({
    ...raw,
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    title,
    role,
    teaches: raw.teaches ?? false,
  });
}

/**
 * A program as saved, brought up to date. Its id is kept as it was, whatever
 * it is: the seeded ones and the generated ones are all just strings now. A
 * missing short name takes the full one.
 */
function normaliseProgram(raw: Partial<Program>): Program {
  const name = String(raw.name ?? raw.id ?? '');
  return normaliseArchived({
    ...raw,
    id: String(raw.id ?? ''),
    name,
    short: typeof raw.short === 'string' && raw.short.trim() ? raw.short : name,
  });
}

/** Why a person may not archive this record, or true when they may. */
function mayArchiveStaff(user: SignedInUser, state: PortalState, id: string): boolean | string {
  if (id === user.id) return "You can't archive yourself. Ask someone else who manages staff.";
  const role = state.core.staff.find(s => s.id === id)?.role;
  return mayChangeStaff(user.role, role, role);
}

/** A core change in plain words, for "Couldn't save …". */
export function describeCoreChange(action: AnyAction): string | undefined {
  const a = action as CoreAction;
  if ('patch' in a && a.patch && 'archivedAt' in a.patch) return 'the archive change';
  switch (a.type) {
    case 'core/add-staff':
    case 'core/update-staff':
      return 'the person';
    case 'core/add-organization':
    case 'core/update-organization':
      return 'the partner';
    case 'core/add-program':
    case 'core/update-program':
      return 'the program';
    case 'core/add-venue':
    case 'core/update-venue':
      return 'the venue';
    case 'core/update-settings':
      return 'the settings';
  }
  return undefined;
}

/** The staff and settings half of `actions.core`; the store adds the data half. */
type CoreDataActions = Omit<
  CoreActions,
  'resetDemo' | 'setDemoToday' | 'importJson' | 'exportJson'
>;

export const coreSlice: ModuleSlice<CoreState, CoreDataActions> = {
  id: 'core',
  seed: () => makeCoreSeed(),
  empty: () => makeCoreEmpty(),
  reducer: coreReducer,
  describe: describeCoreChange,
  createActions(dispatch, getState, ctx) {
    const archived = () => archiveFields(ctx.user, ctx.today);
    return {
      addStaff(input) {
        const id = newId('s');
        dispatch({ type: 'core/add-staff', member: { ...input, id } });
        return id;
      },
      updateStaff(id, patch) {
        dispatch({ type: 'core/update-staff', id, patch });
      },
      addProgram(input) {
        const id = newId('p');
        dispatch({ type: 'core/add-program', program: { ...programFields(input), id } });
        return id;
      },
      updateProgram(id, patch) {
        const current = getState().core.programs.find(p => p.id === id);
        if (!current) return;
        const fields = programFields({ ...current, ...patch });
        dispatch({ type: 'core/update-program', id, patch: fields });
      },
      archiveProgram(id) {
        dispatch({ type: 'core/update-program', id, patch: archived() });
      },
      restoreProgram(id) {
        dispatch({ type: 'core/update-program', id, patch: restoreFields() });
      },
      addOrganization(input) {
        const id = newId('org');
        dispatch({ type: 'core/add-organization', organization: { ...input, id } });
        return id;
      },
      updateOrganization(id, patch) {
        dispatch({ type: 'core/update-organization', id, patch });
      },
      addVenue(input) {
        const id = newId('v');
        dispatch({ type: 'core/add-venue', venue: { ...input, id } });
        return id;
      },
      updateVenue(id, patch) {
        dispatch({ type: 'core/update-venue', id, patch });
      },
      archiveStaff(id) {
        dispatch({ type: 'core/update-staff', id, patch: archived() });
      },
      restoreStaff(id) {
        dispatch({ type: 'core/update-staff', id, patch: restoreFields() });
      },
      archiveOrganization(id) {
        dispatch({ type: 'core/update-organization', id, patch: archived() });
      },
      restoreOrganization(id) {
        dispatch({ type: 'core/update-organization', id, patch: restoreFields() });
      },
      archiveVenue(id) {
        dispatch({ type: 'core/update-venue', id, patch: archived() });
      },
      restoreVenue(id) {
        dispatch({ type: 'core/update-venue', id, patch: restoreFields() });
      },
      updateSettings(patch) {
        dispatch({ type: 'core/update-settings', patch });
      },
      setModuleEnabled(id, on) {
        const current = getState().core.settings.enabledModules;
        const next = on ? [...new Set([...current, id])] : current.filter(m => m !== id);
        dispatch({ type: 'core/update-settings', patch: { enabledModules: next } });
      },
    };
  },
  rules: {
    addStaff: (user, _state, input) => mayChangeStaff(user.role, undefined, input.role),
    updateStaff: (user, state, id, patch) => {
      const from = state.core.staff.find(s => s.id === id)?.role;
      const to = patch.role ?? from;
      // Nobody changes their own role, Admin included (decision 0001); the
      // rest of their own record follows the staff rule like anyone's.
      if (id === user.id && to !== from) return OWN_ROLE_REFUSAL;
      return mayChangeStaff(user.role, from, to);
    },
    // Whoever may edit a person may archive them (decision 0002), but not themself.
    archiveStaff: mayArchiveStaff,
    restoreStaff: (user, state, id) => {
      const role = state.core.staff.find(s => s.id === id)?.role;
      return mayChangeStaff(user.role, role, role);
    },
    // Programs are the office's own configuration, so they go with "Staff and
    // roles": Admin and Director (decision 0001, "Programs" row, proposed in #44).
    addProgram: (user, state, input) =>
      can(user.role, 'programs', 'edit') && (programProblem(state.core.programs, input) ?? true),
    updateProgram: (user, state, id, patch) => {
      if (!can(user.role, 'programs', 'edit')) return false;
      const current = state.core.programs.find(p => p.id === id);
      if (!current) return true;
      return programProblem(state.core.programs, { ...current, ...patch }, id) ?? true;
    },
    archiveProgram: 'programs',
    restoreProgram: 'programs',
    addOrganization: 'partners',
    updateOrganization: 'partners',
    archiveOrganization: 'partners',
    restoreOrganization: 'partners',
    addVenue: 'partners',
    updateVenue: 'partners',
    archiveVenue: 'partners',
    restoreVenue: 'partners',
    // The fiscal year and the module switches are the system's own settings,
    // so they go with "Modules, import, export".
    updateSettings: 'modules',
    setModuleEnabled: 'modules',
  },
  normalise(raw, demo = false) {
    if (!raw || typeof raw !== 'object') return undefined;
    const c = raw as Partial<CoreState>;
    if (!Array.isArray(c.staff) || !Array.isArray(c.programs)) return undefined;
    // An older save may carry `demoToday`; the demo date is a browser
    // preference now (demo.ts), so it is dropped here.
    const settings: Partial<CoreState['settings']> = c.settings ?? {};
    const seeded = makeCoreSeed();
    const staff = c.staff.map(s => normaliseStaff(s, seeded.staff));
    // Every login belongs to a staff record; a payload without that person
    // gets them back, so the login still resolves. A demo build adds back the
    // whole seeded staff; an empty one only the people the logins need. A
    // person who is there but archived stays archived: only a missing record
    // is added back, never an archived one made current again.
    const required = demo ? seeded.staff : loginStaff();
    for (const s of required) if (!staff.some(x => x.id === s.id)) staff.push(s);
    // A demo payload saved before places existed gets the seeded ones, so the
    // teaching module's venue ids still resolve.
    return {
      staff,
      programs: c.programs.map(normaliseProgram),
      organizations: Array.isArray(c.organizations)
        ? c.organizations.map(normaliseArchived)
        : demo
          ? seeded.organizations
          : [],
      venues: Array.isArray(c.venues) ? c.venues.map(normaliseArchived) : demo ? seeded.venues : [],
      settings: {
        fiscalYearStartMonth: settings.fiscalYearStartMonth ?? 7,
        enabledModules: settings.enabledModules ?? [...DEFAULT_ENABLED_MODULES],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// The permission check on every action
// ---------------------------------------------------------------------------

/** "You can't do that as a Teacher." The words a refused change shows. */
export function refusalMessage(role: Role): string {
  const noun = role === 'read-only' ? `${ROLE_LABELS[role]} user` : ROLE_LABELS[role];
  const article = /^[AEIOU]/.test(noun) ? 'an' : 'a';
  return `You can't do that as ${article} ${noun}.`;
}

/**
 * Wrap a slice's actions so each one runs only when its rule lets the
 * signed-in person through (decision 0001). A refused action changes nothing,
 * returns undefined and calls `onRefused` with the reason. The screens hide
 * what this refuses; the check lives here so a stale screen cannot get past it.
 */
export function guardActions<A extends object>(
  actions: A,
  rules: ActionRules<A>,
  getState: () => PortalState,
  user: SignedInUser,
  onRefused: (message: string) => void = () => {},
): A {
  const guarded: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(actions)) {
    if (typeof fn !== 'function') {
      guarded[name] = fn;
      continue;
    }
    const rule = (rules as Record<string, unknown>)[name] as ActionRules<A>[keyof A] | undefined;
    guarded[name] = (...args: unknown[]) => {
      const verdict =
        rule === undefined
          ? false
          : typeof rule === 'function'
            ? (rule as (...a: unknown[]) => boolean | string)(user, getState(), ...args)
            : can(user.role, rule as Subject, 'edit');
      if (verdict === true) return (fn as (...a: unknown[]) => unknown)(...args);
      onRefused(typeof verdict === 'string' ? verdict : refusalMessage(user.role));
      return undefined;
    };
  }
  return guarded as A;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** What a demo-only action says when it is called in a build without the demo. */
export const NO_DEMO = 'The demo data is not part of this portal.';

/** Replace every slice at once (reset, import). */
interface ReplaceAction extends AnyAction {
  type: typeof REPLACE;
}

/** One reducer per slice, routed by the `<sliceId>/` prefix on the action type. */
export function makeReducer(slices: PortalSlice[]) {
  return function reducer(state: PortalState, action: AnyAction): PortalState {
    if (action.type === REPLACE) {
      return (action as ReplaceAction).state as PortalState;
    }
    const sliceId = action.type.split('/')[0];
    const slice = slices.find(s => s.id === sliceId);
    if (!slice) return state;

    const bag = state as unknown as Record<string, unknown>;
    const next = slice.reducer(bag[sliceId], action);
    if (next === bag[sliceId]) return state;
    return { ...bag, [sliceId]: next } as unknown as PortalState;
  };
}

/**
 * The words for a change that was not saved, from the slice that made it.
 * An import or a reset touches every slice, so it is named for what it was.
 */
export function describeChange(
  slices: PortalSlice[],
  sliceId: string,
  action: AnyAction,
): string | undefined {
  if (action.type === REPLACE) return 'the new data';
  return slices.find(s => s.id === sliceId)?.describe?.(action);
}

/**
 * The day the portal treats as today: the demo date this browser set, else the
 * clock. Screens read it as `useStore().today`.
 */
export function resolveToday(demoToday: string | undefined, clock: string): string {
  return demoToday ?? clock;
}

/**
 * The demo date this browser uses: the stored preference, the seed's day when
 * none is stored, and none at all outside a demo build.
 */
export function savedDemoToday(demo: boolean): string | undefined {
  return demo ? demoTodayFrom(repository.loadPreference(DEMO_TODAY_KEY)) : undefined;
}

/**
 * The staff as saved in this browser, or as a fresh portal starts when nothing
 * is saved. The sign-in check reads it before the store mounts, so it reads
 * localStorage directly rather than through the Repository.
 */
export function savedStaff(demo: boolean = isDemo()): StaffMember[] {
  return (repository.loadSlice(coreSlice as PortalSlice, '', demo) as CoreState).staff;
}

export interface StoreValue {
  state: PortalState;
  /** Today as an ISO `YYYY-MM-DD` string; pass it to every derive function. */
  today: string;
  /** Who is signed in, read from their staff record so a rename shows at once. */
  user: SignedInUser;
  actions: PortalActions;
  /** Whether this is a demo build (`isDemo()`): the sample data, the demo date, the reset. */
  demo: boolean;
  /** The demo date in use, or undefined when today is the clock. Always undefined outside a demo. */
  demoToday: string | undefined;
  /** Whether a change is being saved, or the last one could not be. The shell shows it. */
  saving: Saving;
  /**
   * Resolves once every change made so far is saved: true, or false when one
   * failed and was rolled back. Roll call waits on it before leaving the page.
   */
  whenSaved(): Promise<boolean>;
}

const StoreContext = createContext<StoreValue | undefined>(undefined);

export interface StoreProviderProps {
  /**
   * The module slices to compose with core, in registry order. `app/App.tsx`
   * passes `MODULES.map(m => m.slice)`; tests pass whatever they need.
   */
  slices?: PortalSlice[];
  /** Overrides today and the demo date, for tests and screenshots. */
  today?: string;
  /** Whether to start from the demo data. Defaults to `isDemo()`; tests pass it. */
  demo?: boolean;
  /** Where the data lives. Defaults to localStorage; tests pass one that fails on demand. */
  repository?: Repository;
  /** The signed-in person's staff id. Every action is credited to them. */
  userId: string;
  /**
   * Called when `userId` names nobody in the staff list (an import without
   * them, say: `no-staff`), or someone archived (`archived`). Nothing below
   * the provider renders until it is fixed.
   */
  onUnknownUser?: (reason: 'no-staff' | 'archived') => void;
  /** Called with the reason when an action is refused for the signed-in person's role. */
  onRefused?: (message: string) => void;
  /**
   * Called when a change could not be saved and was rolled back, with the
   * sentence to show: "Couldn't save the roll call mark".
   */
  onSaveFailed?: (message: string) => void;
  children: ReactNode;
}

/**
 * Loads every slice through the repository, one `load` per slice, then hands
 * the state to the live store. Nothing below it renders until the load is in.
 */
export function StoreProvider(props: StoreProviderProps) {
  const { slices, today: fixedToday, demo = isDemo(), repository: repo = localRepository } = props;
  const clock = useMemo(() => fixedToday ?? toISO(new Date()), [fixedToday]);
  const all = useMemo<PortalSlice[]>(() => [coreSlice as PortalSlice, ...(slices ?? [])], [slices]);
  const [loaded, setLoaded] = React.useState<{ all: PortalSlice[]; state: PortalState }>();
  const [loadFailed, setLoadFailed] = React.useState(false);

  useEffect(() => {
    let current = true;
    Promise.all(all.map(slice => repo.load(slice, clock, demo))).then(
      values => {
        if (!current) return;
        const state: Record<string, unknown> = {};
        all.forEach((slice, i) => (state[slice.id] = values[i]));
        setLoaded({ all, state: state as unknown as PortalState });
      },
      () => {
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [all, clock, demo, repo]);

  if (loadFailed)
    return (
      <p role="alert" style={{ padding: 'var(--space-7)', font: 'var(--type-body)' }}>
        The portal could not load its data. Reload the page to try again.
      </p>
    );
  if (!loaded || loaded.all !== all) return null;
  return (
    <LiveProvider
      {...props}
      all={all}
      initial={loaded.state}
      clock={clock}
      demo={demo}
      repo={repo}
    />
  );
}

interface LiveProviderProps extends StoreProviderProps {
  all: PortalSlice[];
  initial: PortalState;
  clock: string;
  demo: boolean;
  repo: Repository;
}

function LiveProvider({
  all,
  initial,
  clock,
  repo,
  today: fixedToday,
  demo,
  userId,
  onUnknownUser,
  onRefused,
  onSaveFailed,
  children,
}: LiveProviderProps) {
  const failedRef = React.useRef(onSaveFailed);
  failedRef.current = onSaveFailed;
  const [live] = React.useState(() =>
    createLiveStore({
      initial,
      reducer: makeReducer(all),
      repository: repo,
      describe: (sliceId, action) => describeChange(all, sliceId, action),
      onSaveFailed: message => failedRef.current?.(message),
    }),
  );
  const state = React.useSyncExternalStore(live.subscribe, live.getState);
  const saving = React.useSyncExternalStore(live.subscribe, live.getSaving);

  // Held here so Settings can move the demo day and every screen follows.
  const [demoToday, setDemoTodayState] = React.useState(() => savedDemoToday(demo));
  const today = fixedToday ?? resolveToday(demoToday, clock);

  const found = state.core.staff.find(s => s.id === userId);
  // An archived person is nobody to be: an import that archives them signs them out.
  const member = found && !isArchived(found) ? found : undefined;
  const name = member?.name ?? '';
  const role = member?.role ?? 'read-only';
  const user = useMemo<SignedInUser>(() => ({ id: userId, name, role }), [userId, name, role]);
  useEffect(() => {
    if (!member) onUnknownUser?.(found ? 'archived' : 'no-staff');
  }, [member, found, onUnknownUser]);

  const refusedRef = React.useRef(onRefused);
  refusedRef.current = onRefused;

  // Every change goes through the live store: on screen at once, then one
  // `repository.apply` per slice it touched, rolled back if that fails.
  const actions = useMemo<PortalActions>(() => {
    const ctx = { today, newId, user };
    const dispatch = live.dispatch;
    // The live store's state, so an action sees the one dispatched just before it.
    const getState = live.getState;
    const refuse = (message: string) => refusedRef.current?.(message);
    const bag: Record<string, unknown> = {};
    for (const slice of all) {
      const raw = slice.createActions(dispatch, getState, ctx) as object;
      bag[slice.id] = guardActions(raw, slice.rules, getState, user, refuse);
    }

    const replace = (next: PortalState) => dispatch({ type: REPLACE, state: next });

    const data = guardActions<
      Pick<CoreActions, 'resetDemo' | 'setDemoToday' | 'importJson' | 'exportJson'>
    >(
      {
        resetDemo() {
          // Settings offers it only in a demo build; anywhere else it changes nothing.
          if (!demo) return refuse(NO_DEMO);
          replace(repository.freshState(all, today, demo));
        },
        setDemoToday(iso) {
          if (!demo) return refuse(NO_DEMO);
          repository.savePreference(DEMO_TODAY_KEY, demoTodayToStore(iso));
          setDemoTodayState(iso);
        },
        importJson(text: string) {
          replace(repository.readImport(all, text, today, demo));
        },
        exportJson() {
          return repository.exportJson(all, live.getState());
        },
      },
      {
        resetDemo: 'modules',
        setDemoToday: 'modules',
        importJson: 'modules',
        exportJson: 'modules',
      },
      getState,
      user,
      refuse,
    );
    bag.core = { ...(bag.core as CoreDataActions), ...data } satisfies CoreActions;

    return bag as unknown as PortalActions;
  }, [all, today, user, demo, live]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      today,
      user,
      actions,
      demo,
      demoToday: demo ? demoToday : undefined,
      saving,
      whenSaved: live.whenSaved,
    }),
    [state, today, user, actions, demo, demoToday, saving, live],
  );

  return <StoreContext.Provider value={value}>{member ? children : null}</StoreContext.Provider>;
}

/** The one hook every screen uses. Must be inside a `<StoreProvider>`. */
export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside a <StoreProvider>');
  return value;
}

/**
 * `can` for the signed-in person: `const allowed = useCan(); allowed('grants', 'edit')`.
 * Screens use it to leave out what the store would refuse.
 */
export function useCan(): (subject: Subject, need?: Need, own?: boolean) => boolean {
  const { user } = useStore();
  return React.useCallback(
    (subject: Subject, need: Need = 'open', own = false) => can(user.role, subject, need, own),
    [user.role],
  );
}
