import type React from 'react';
import type { PortalState } from './types';

/**
 * What a module hands the platform: one slice of state and one manifest.
 * See `src/modules/README.md` for how to add one.
 */

/** Every action is `{ type: '<sliceId>/<name>', … }` so the store can route it. */
export interface AnyAction {
  type: string;
  [key: string]: unknown;
}

export type Dispatch = (action: AnyAction) => void;

/** What a slice is given when it builds its actions. */
export interface SliceContext {
  /** Today as ISO `YYYY-MM-DD`. */
  today: string;
  newId(prefix: string): string;
}

export interface ModuleSlice<S, A> {
  /** Storage key and state key, e.g. 'grants'. */
  id: string;
  seed(today: string): S;
  reducer(state: S, action: AnyAction): S;
  createActions(dispatch: Dispatch, getState: () => PortalState, ctx: SliceContext): A;
  /** Optional: validate and fill a loaded payload. Return undefined to reject it. */
  normalise?(raw: unknown): S | undefined;
}

export interface NavItem {
  path: string;
  label: string;
  /** Lucide icon name, e.g. 'landmark'. */
  icon: string;
  badge?(state: PortalState, today: string): number;
}

/** One titled group of rail items. */
export interface NavSection {
  section: string;
  items: NavItem[];
}

export interface StatSpec {
  id: string;
  label: string;
  value: string;
  unit?: string;
  footnote?: string;
  /** A colour token: `var(--gold-400)`. */
  accent: string;
  href?: string;
}

export interface AttentionItem {
  id: string;
  date: string;
  label: string;
  detail: string;
  status: 'overdue' | 'due-soon' | 'info';
  href: string;
  ownerId?: string;
  /** The module label, shown as a Badge on the row. */
  source: string;
}

export interface DashboardContribution {
  /** At most two per module. */
  stats?(state: PortalState, today: string): StatSpec[];
  /**
   * A few words for the page subtitle, joined after core's date and fiscal
   * year with ` · `. Undefined when the module has nothing to add today.
   */
  subtitle?(state: PortalState, today: string): string | undefined;
  attention?(state: PortalState, today: string): AttentionItem[];
  /** Each panel renders a Card into the dashboard's right column. */
  panels?: React.ComponentType[];
}

export interface ModuleManifest {
  id: string;
  label: string;
  /** One sentence; it shows in Settings → Modules. */
  description: string;
  /** One rail section, or several when the module is big enough to need them. */
  nav: NavSection | NavSection[];
  routes: Array<{ path: string; element: React.ReactElement }>;
  dashboard?: DashboardContribution;
  /** Each renders a Card on the Settings screen, after the Modules card. */
  settings?: React.ComponentType[];
  // The two positions where a manifest cannot know its own state and action types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slice: ModuleSlice<any, any>;
}
