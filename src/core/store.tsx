import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { DEMO_TODAY_KEY, demoTodayFrom, demoTodayToStore, isDemo } from './demo';
import { toISO } from './format';
import type { ActionRules, AnyAction, ModuleSlice } from './module';
import { can, mayChangeStaff } from './permissions';
import type { Need, Subject } from './permissions';
import * as repository from './repository';
import type { PortalSlice } from './repository';
import { ROLE_LABELS, isRole } from './roles';
import { DEFAULT_ENABLED_MODULES, loginStaff, makeCoreEmpty, makeCoreSeed } from './seed';
import type {
  AppSettings,
  CoreActions,
  CoreState,
  Organization,
  PortalActions,
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
  return {
    ...raw,
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    title,
    role,
    teaches: raw.teaches ?? false,
  };
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
  createActions(dispatch, getState) {
    return {
      addStaff(input) {
        const id = newId('s');
        dispatch({ type: 'core/add-staff', member: { ...input, id } });
        return id;
      },
      updateStaff(id, patch) {
        dispatch({ type: 'core/update-staff', id, patch });
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
    updateStaff: (user, state, id, patch) =>
      mayChangeStaff(
        user.role,
        state.core.staff.find(s => s.id === id)?.role,
        patch.role ?? state.core.staff.find(s => s.id === id)?.role,
      ),
    addOrganization: 'partners',
    updateOrganization: 'partners',
    addVenue: 'partners',
    updateVenue: 'partners',
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
    // whole seeded staff; an empty one only the people the logins need.
    const required = demo ? seeded.staff : loginStaff();
    for (const s of required) if (!staff.some(x => x.id === s.id)) staff.push(s);
    // A demo payload saved before places existed gets the seeded ones, so the
    // teaching module's venue ids still resolve.
    return {
      staff,
      programs: c.programs.map(p => ({ ...p, short: p.short ?? p.name })),
      organizations: Array.isArray(c.organizations)
        ? c.organizations
        : demo
          ? seeded.organizations
          : [],
      venues: Array.isArray(c.venues) ? c.venues : demo ? seeded.venues : [],
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
  type: 'portal/replace';
}

/** One reducer per slice, routed by the `<sliceId>/` prefix on the action type. */
export function makeReducer(slices: PortalSlice[]) {
  return function reducer(state: PortalState, action: AnyAction): PortalState {
    if (action.type === 'portal/replace') {
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
 * is saved. The sign-in check reads it before the store mounts.
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
  /** The signed-in person's staff id. Every action is credited to them. */
  userId: string;
  /**
   * Called when `userId` names nobody in the staff list (an import without
   * them, say). Nothing below the provider renders until it is fixed.
   */
  onUnknownUser?: () => void;
  /** Called with the reason when an action is refused for the signed-in person's role. */
  onRefused?: (message: string) => void;
  children: ReactNode;
}

export function StoreProvider({
  slices,
  today: fixedToday,
  demo = isDemo(),
  userId,
  onUnknownUser,
  onRefused,
  children,
}: StoreProviderProps) {
  const clock = useMemo(() => fixedToday ?? toISO(new Date()), [fixedToday]);
  const all = useMemo<PortalSlice[]>(() => [coreSlice as PortalSlice, ...(slices ?? [])], [slices]);

  const reducer = useMemo(() => makeReducer(all), [all]);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    repository.loadState(all, clock, demo),
  );

  // Held here so Settings can move the demo day and every screen follows.
  const [demoToday, setDemoTodayState] = React.useState(() => savedDemoToday(demo));
  const today = fixedToday ?? resolveToday(demoToday, clock);

  const member = state.core.staff.find(s => s.id === userId);
  const name = member?.name ?? '';
  const role = member?.role ?? 'read-only';
  const user = useMemo<SignedInUser>(() => ({ id: userId, name, role }), [userId, name, role]);
  useEffect(() => {
    if (!member) onUnknownUser?.();
  }, [member, onUnknownUser]);

  // `state` is read by exportJson and by actions that need the latest value.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const refusedRef = React.useRef(onRefused);
  refusedRef.current = onRefused;

  // The repository is the only writer, and only the slices that changed are written.
  const savedRef = React.useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    const bag = state as unknown as Record<string, unknown>;
    const saved = savedRef.current;
    for (const slice of all) {
      if (!saved || saved[slice.id] !== bag[slice.id])
        repository.saveSlice(slice.id, bag[slice.id]);
    }
    savedRef.current = { ...bag };
  }, [state, all]);

  const actions = useMemo<PortalActions>(() => {
    const ctx = { today, newId, user };
    const getState = () => stateRef.current;
    const refuse = (message: string) => refusedRef.current?.(message);
    const bag: Record<string, unknown> = {};
    for (const slice of all) {
      const raw = slice.createActions(dispatch, getState, ctx) as object;
      bag[slice.id] = guardActions(raw, slice.rules, getState, user, refuse);
    }

    const replace = (next: PortalState) => {
      savedRef.current = { ...(next as unknown as Record<string, unknown>) };
      dispatch({ type: 'portal/replace', state: next });
    };

    const data = guardActions<
      Pick<CoreActions, 'resetDemo' | 'setDemoToday' | 'importJson' | 'exportJson'>
    >(
      {
        resetDemo() {
          // Settings offers it only in a demo build; anywhere else it changes nothing.
          if (!demo) return refuse(NO_DEMO);
          replace(repository.reset(all, today, demo));
        },
        setDemoToday(iso) {
          if (!demo) return refuse(NO_DEMO);
          repository.savePreference(DEMO_TODAY_KEY, demoTodayToStore(iso));
          setDemoTodayState(iso);
        },
        importJson(text: string) {
          replace(repository.importJson(all, text, today, demo));
        },
        exportJson() {
          return repository.exportJson(all, stateRef.current);
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
  }, [all, today, user, demo]);

  const value = useMemo<StoreValue>(
    () => ({ state, today, user, actions, demo, demoToday: demo ? demoToday : undefined }),
    [state, today, user, actions, demo, demoToday],
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
