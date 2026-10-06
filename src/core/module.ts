import type React from 'react';
import type { Requirement } from './permissions';
import type { PortalState, SignedInUser } from './types';

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
  /**
   * Who is signed in. Every action that records who did something (an
   * activity row, an approval, an upload, a transaction's status) credits them.
   */
  user: SignedInUser;
}

/**
 * What one action needs before the store lets it through: a row of the
 * permission table (edit on it), or a rule of its own given the signed-in
 * person, the state and the action's arguments. A rule answers `true` to let
 * it through, `false` to refuse it as the role, or a sentence saying why not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionRule<Args extends unknown[] = any[]> =
  | Requirement['subject']
  | ((user: SignedInUser, state: PortalState, ...args: Args) => boolean | string);

/** One rule per action, so a new action cannot slip past the check. */
export type ActionRules<A> = 0 extends 1 & A
  ? Record<string, ActionRule>
  : {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [K in keyof A]-?: A[K] extends (...args: infer P) => any ? ActionRule<P> : never;
    };

export interface ModuleSlice<S, A> {
  /** Storage key and state key, e.g. 'grants'. */
  id: string;
  seed(today: string): S;
  reducer(state: S, action: AnyAction): S;
  createActions(dispatch: Dispatch, getState: () => PortalState, ctx: SliceContext): A;
  /**
   * What each action needs. The store checks it before the action runs and
   * refuses with a toast when the signed-in person's role may not (decision 0001).
   */
  rules: ActionRules<A>;
  /** Optional: validate and fill a loaded payload. Return undefined to reject it. */
  normalise?(raw: unknown): S | undefined;
}

/**
 * What a rail item, a route or a dashboard contribution needs to show: one
 * requirement, or several of which any one will do. Unset is open to everyone.
 */
export type Requires = Requirement | Requirement[];

export interface NavItem {
  path: string;
  label: string;
  /** Lucide icon name, e.g. 'landmark'. */
  icon: string;
  badge?(state: PortalState, today: string): number;
  /** Hidden from a role that does not meet it. Defaults to the route's own `requires`. */
  requires?: Requires;
}

export interface ModuleRoute {
  path: string;
  element: React.ReactElement;
  /** A role that does not meet it gets the no-access screen, not the element. */
  requires?: Requires;
  /**
   * For a route that opens one record an "Own" cell limits, such as a teacher's
   * roll call: may this person open this one? Read with the route's params.
   * False gets the no-access screen too.
   */
  allows?(
    user: SignedInUser,
    state: PortalState,
    params: Record<string, string | undefined>,
  ): boolean;
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
  /** Hidden from a role that does not meet it. Defaults to what `href` needs. */
  requires?: Requires;
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
  /** Hidden from a role that does not meet it. Defaults to what `href` needs. */
  requires?: Requires;
}

/** A Card a module adds to the dashboard or Settings, shown to the roles that meet `requires`. */
export interface GatedCard {
  component: React.ComponentType;
  requires?: Requires;
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
  panels?: GatedCard[];
}

export interface ModuleManifest {
  id: string;
  label: string;
  /** One sentence; it shows in Settings → Modules. */
  description: string;
  /** One rail section, or several when the module is big enough to need them. */
  nav: NavSection | NavSection[];
  routes: ModuleRoute[];
  dashboard?: DashboardContribution;
  /**
   * Each renders a Card on the Settings screen, after the Modules card, for
   * the roles that meet its `requires`.
   */
  settings?: GatedCard[];
  // The two positions where a manifest cannot know its own state and action types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slice: ModuleSlice<any, any>;
}
