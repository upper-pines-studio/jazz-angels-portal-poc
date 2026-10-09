import type React from 'react';
import type { Requirement } from './permissions';
import type { FundingTarget, PortalState, SignedInUser } from './types';

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
  /** The demo data. A demo build starts from it, and the tests use it. */
  seed(today: string): S;
  /**
   * What a new office starts with when the demo is off (decision 0004): empty
   * collections and default settings.
   */
  empty(): S;
  reducer(state: S, action: AnyAction): S;
  createActions(dispatch: Dispatch, getState: () => PortalState, ctx: SliceContext): A;
  /**
   * What each action needs. The store checks it before the action runs and
   * refuses with a toast when the signed-in person's role may not (decision 0001).
   */
  rules: ActionRules<A>;
  /**
   * Optional: validate and fill a loaded payload. Return undefined to reject it.
   * `demo` says whether this is a demo build, for a slice that fills a gap
   * from its seed; unset counts as off.
   */
  normalise?(raw: unknown, demo?: boolean): S | undefined;
  /**
   * Optional: name one of this slice's changes in plain words, for the toast
   * when it could not be saved: `Couldn't save ${describe(action)}`. Given the
   * action as dispatched (`{ type: 'teaching/update', key: 'attendance', … }`)
   * it answers "the roll call mark". Unset, or undefined, reads "that change".
   */
  describe?(action: AnyAction): string | undefined;
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

/**
 * One thing paying toward a program's year or a project, as its module sees
 * it: for grants, one grant's share (decision 0006). The sheet adds up the
 * amounts (`fundingSummary`) and draws one bar segment per source.
 */
export interface FundingSource {
  /** Stable among one target's sources: the grant's id. */
  id: string;
  /** Who pays, short: "Herb Alpert". */
  label: string;
  /** What it is: the grant's title. */
  detail: string;
  /** Where the source's own page is. */
  href: string;
  /** Toward this target, whole dollars. */
  amount: number;
  /** Pending money: counts as "If awarded", apart from awarded money, with a hatched bar. */
  ifAwarded: boolean;
  /** All the source has to give: the amount awarded, or requested while pending. */
  total: number;
  /** What it has not yet given to anything; negative when more is given out than it has. */
  notYetGiven: number;
  /** Plain sentences saying why this money may not be usable here. Empty when none. */
  warnings: string[];
}

/**
 * What a module adds to a program's or a project's sheet on the Programs page
 * (decision 0006): the money it puts toward it, and optionally its own part of
 * the sheet ("Paid for by", with Add money from a grant), rendered with the
 * target it is for.
 */
export interface FundingContribution {
  /** Every source paying toward the target, awarded first, then by amount. */
  sources(state: PortalState, target: FundingTarget): FundingSource[];
  /** Its own section of the sheet, shown to the roles that meet `requires`. */
  panel?: React.ComponentType<{ target: FundingTarget }>;
  requires?: Requires;
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
  /** What it pays toward on the Programs page: a program's year or a project. */
  funding?: FundingContribution;
  // The two positions where a manifest cannot know its own state and action types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slice: ModuleSlice<any, any>;
}
