import React, { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { toISO } from './format';
import type { AnyAction, ModuleSlice } from './module';
import * as repository from './repository';
import type { PortalSlice } from './repository';
import { DEFAULT_ENABLED_MODULES, makeCoreSeed } from './seed';
import type { AppSettings, CoreActions, CoreState, PortalActions, PortalState, StaffMember } from './types';

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
  | { type: 'core/update-settings'; patch: Partial<AppSettings> };

function coreReducer(state: CoreState, raw: AnyAction): CoreState {
  const action = raw as CoreAction;
  switch (action.type) {
    case 'core/add-staff':
      return { ...state, staff: [...state.staff, action.member] };
    case 'core/update-staff':
      return {
        ...state,
        staff: state.staff.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'core/update-settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      return state;
  }
}

/** The staff and settings half of `actions.core`; the store adds the data half. */
type CoreDataActions = Omit<CoreActions, 'resetDemo' | 'importJson' | 'exportJson'>;

export const coreSlice: ModuleSlice<CoreState, CoreDataActions> = {
  id: 'core',
  seed: () => makeCoreSeed(),
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
      updateSettings(patch) {
        dispatch({ type: 'core/update-settings', patch });
      },
      setModuleEnabled(id, on) {
        const current = getState().core.settings.enabledModules;
        const next = on ? [...new Set([...current, id])] : current.filter((m) => m !== id);
        dispatch({ type: 'core/update-settings', patch: { enabledModules: next } });
      },
    };
  },
  normalise(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const c = raw as Partial<CoreState>;
    if (!Array.isArray(c.staff) || !Array.isArray(c.programs)) return undefined;
    const settings = c.settings ?? ({} as AppSettings);
    return {
      staff: c.staff.map((s) => ({ ...s, teaches: s.teaches ?? false })),
      programs: c.programs.map((p) => ({ ...p, short: p.short ?? p.name })),
      settings: {
        fiscalYearStartMonth: settings.fiscalYearStartMonth ?? 7,
        enabledModules: settings.enabledModules ?? [...DEFAULT_ENABLED_MODULES],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

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
    const slice = slices.find((s) => s.id === sliceId);
    if (!slice) return state;

    const bag = state as unknown as Record<string, unknown>;
    const next = slice.reducer(bag[sliceId], action);
    if (next === bag[sliceId]) return state;
    return { ...bag, [sliceId]: next } as unknown as PortalState;
  };
}

export interface StoreValue {
  state: PortalState;
  /** Today as an ISO `YYYY-MM-DD` string; pass it to every derive function. */
  today: string;
  actions: PortalActions;
}

const StoreContext = createContext<StoreValue | undefined>(undefined);

export interface StoreProviderProps {
  /**
   * The module slices to compose with core, in registry order. `app/App.tsx`
   * passes `MODULES.map(m => m.slice)`; tests pass whatever they need.
   */
  slices?: PortalSlice[];
  /** Overrides today, for tests and screenshots. */
  today?: string;
  children: ReactNode;
}

export function StoreProvider({ slices, today: fixedToday, children }: StoreProviderProps) {
  const today = useMemo(() => fixedToday ?? toISO(new Date()), [fixedToday]);
  const all = useMemo<PortalSlice[]>(() => [coreSlice as PortalSlice, ...(slices ?? [])], [slices]);

  const reducer = useMemo(() => makeReducer(all), [all]);
  const [state, dispatch] = useReducer(reducer, undefined, () => repository.loadState(all, today));

  // `state` is read by exportJson and by actions that need the latest value.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // The repository is the only writer, and only the slices that changed are written.
  const savedRef = React.useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    const bag = state as unknown as Record<string, unknown>;
    const saved = savedRef.current;
    for (const slice of all) {
      if (!saved || saved[slice.id] !== bag[slice.id]) repository.saveSlice(slice.id, bag[slice.id]);
    }
    savedRef.current = { ...bag };
  }, [state, all]);

  const actions = useMemo<PortalActions>(() => {
    const ctx = { today, newId };
    const getState = () => stateRef.current;
    const bag: Record<string, unknown> = {};
    for (const slice of all) bag[slice.id] = slice.createActions(dispatch, getState, ctx);

    const replace = (next: PortalState) => {
      savedRef.current = { ...(next as unknown as Record<string, unknown>) };
      dispatch({ type: 'portal/replace', state: next });
    };

    bag.core = {
      ...(bag.core as CoreDataActions),
      resetDemo() {
        replace(repository.reset(all, today));
      },
      importJson(text: string) {
        replace(repository.importJson(all, text, today));
      },
      exportJson() {
        return repository.exportJson(all, stateRef.current);
      },
    } satisfies CoreActions;

    return bag as unknown as PortalActions;
  }, [all, today]);

  const value = useMemo<StoreValue>(() => ({ state, today, actions }), [state, today, actions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The one hook every screen uses. Must be inside a `<StoreProvider>`. */
export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside a <StoreProvider>');
  return value;
}
