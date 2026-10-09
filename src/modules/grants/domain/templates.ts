import { addDays } from 'date-fns';
import { toDate, toISO } from '../../../core/format';
import { phaseIndex } from './phases';
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
  DateAnchor,
  DocumentKind,
  DocumentStatus,
  Grant,
  GrantDocument,
  Phase,
  Task,
} from './types';

/**
 * Checklist templates — the "playbook". Each item says what to do, in which
 * phase, and when it is due relative to one of the grant's key dates.
 *
 * Deviation from SPEC §2: the spec's `anchor` union omits `startBy`, `loiDue`
 * and `decisionExpected`, yet its own standard template anchors items to all
 * three ("Draft LOI (loiDue −14)", "Follow up if no decision
 * (decisionExpected +14)"). `DateAnchor` is therefore `keyof GrantDates`.
 *
 * The spec also leaves reporting/closed items anchored to "report due", which
 * is not a grant date. They are anchored to `periodEnd` instead: +30/+60/+90
 * for collect/draft/submit and +120/+150 for the close-out items, which lands
 * close to a typical "final report due 90 days after the period ends".
 */

type Spec = [phase: Phase, title: string, offsetDays: number, anchor: DateAnchor];

function items(templateId: string, specs: Spec[]): ChecklistTemplateItem[] {
  return specs.map(([phase, title, offsetDays, anchor], i) => ({
    id: `${templateId}-i${i + 1}`,
    phase,
    title,
    offsetDays,
    anchor,
  }));
}

const STANDARD_ID = 'tpl-foundation-standard';
const GOVERNMENT_ID = 'tpl-government';
const CORPORATE_ID = 'tpl-corporate-sponsorship';
const RENEWAL_ID = 'tpl-renewal';

/** "Foundation grant — standard" — exactly the checklist in SPEC §3. */
const STANDARD: ChecklistTemplate = {
  id: STANDARD_ID,
  name: 'Foundation grant — standard',
  description: 'The default path for a private foundation proposal, LOI through close-out.',
  items: items(STANDARD_ID, [
    ['prospect', 'Confirm eligibility and fit', 0, 'startBy'],
    ['prospect', "Read last year's 990 / funder priorities", 2, 'startBy'],
    ['prospect', 'Add funder contact', 3, 'startBy'],

    ['loi', 'Draft LOI', -14, 'loiDue'],
    ['loi', 'Board chair review', -5, 'loiDue'],
    ['loi', 'Submit LOI', 0, 'loiDue'],

    ['applying', 'Confirm attachments list with funder', -45, 'applicationDue'],
    ['applying', 'Update program narrative', -30, 'applicationDue'],
    ['applying', 'Build project budget', -21, 'applicationDue'],
    ['applying', 'Gather IRS determination letter and board list', -21, 'applicationDue'],
    ['applying', 'Update financial statements', -14, 'applicationDue'],
    ['applying', 'Director review', -7, 'applicationDue'],
    ['applying', 'Submit application', 0, 'applicationDue'],

    ['submitted', 'Send thank-you / confirmation note', 3, 'submitted'],
    ['submitted', 'Follow up if no decision', 14, 'decisionExpected'],

    ['awarded', 'Send acknowledgement letter', 7, 'decided'],
    ['awarded', 'Countersign grant agreement', 14, 'decided'],
    ['awarded', 'Set up budget lines', 14, 'decided'],
    ['awarded', 'Schedule reports', 14, 'decided'],

    ['active', 'Reconcile expenses monthly', 30, 'periodStart'],

    ['reporting', 'Collect attendance and outcomes data', 30, 'periodEnd'],
    ['reporting', 'Draft interim/final report', 60, 'periodEnd'],
    ['reporting', 'Submit report', 90, 'periodEnd'],

    ['closed', 'File final acknowledgement', 120, 'periodEnd'],
    ['closed', 'Archive folder', 150, 'periodEnd'],
  ]),
};

/** The standard path plus the paperwork a public funder always asks for. */
const GOVERNMENT: ChecklistTemplate = {
  id: GOVERNMENT_ID,
  name: 'Government grant',
  description:
    'City, county, state and federal funders — portal registration and extra compliance.',
  items: items(GOVERNMENT_ID, [
    ['prospect', 'Confirm eligibility and fit', 0, 'startBy'],
    ['prospect', 'Read the guidelines and scoring rubric', 2, 'startBy'],
    ['prospect', 'Register in the funder portal', 5, 'startBy'],
    ['prospect', 'Add funder contact', 5, 'startBy'],

    ['applying', 'Confirm attachments list with funder', -45, 'applicationDue'],
    ['applying', 'Get DUNS/UEI and SAM.gov confirmation', -35, 'applicationDue'],
    ['applying', 'Update program narrative', -30, 'applicationDue'],
    ['applying', 'Build project budget', -21, 'applicationDue'],
    ['applying', 'Gather IRS determination letter and board list', -21, 'applicationDue'],
    ['applying', 'Board resolution authorising the application', -21, 'applicationDue'],
    ['applying', 'Update financial statements', -14, 'applicationDue'],
    ['applying', 'Director review', -7, 'applicationDue'],
    ['applying', 'Submit application in the portal', 0, 'applicationDue'],

    ['submitted', 'Save the portal confirmation number', 1, 'submitted'],
    ['submitted', 'Follow up if no decision', 14, 'decisionExpected'],

    ['awarded', 'Send acknowledgement letter', 7, 'decided'],
    ['awarded', 'Countersign grant agreement', 14, 'decided'],
    ['awarded', 'Set up budget lines', 14, 'decided'],
    ['awarded', 'Schedule quarterly reports', 14, 'decided'],

    ['active', 'Reconcile expenses monthly', 30, 'periodStart'],
    ['active', 'File quarterly report', 90, 'periodStart'],
    ['active', 'File quarterly report', 180, 'periodStart'],
    ['active', 'File quarterly report', 270, 'periodStart'],

    ['reporting', 'Collect attendance and outcomes data', 30, 'periodEnd'],
    ['reporting', 'Draft final report', 60, 'periodEnd'],
    ['reporting', 'Submit report in the portal', 90, 'periodEnd'],

    ['closed', 'File final acknowledgement', 120, 'periodEnd'],
    ['closed', 'Archive folder', 150, 'periodEnd'],
  ]),
};

/** Short list: sponsorships are a pitch, an invoice and a thank-you. */
const CORPORATE: ChecklistTemplate = {
  id: CORPORATE_ID,
  name: 'Corporate sponsorship',
  description: 'Short path for company sponsorships — pitch, invoice, acknowledgement.',
  items: items(CORPORATE_ID, [
    ['prospect', 'Confirm sponsorship levels and deadline', 0, 'startBy'],

    ['applying', 'Build the pitch deck', -21, 'applicationDue'],
    ['applying', 'Submit sponsorship request', 0, 'applicationDue'],

    ['awarded', 'Send the sponsorship invoice', 7, 'decided'],

    ['active', 'Deliver logo and acknowledgement package', 14, 'periodStart'],

    ['reporting', 'Send thank-you with photos', 14, 'periodEnd'],
  ]),
};

/** For a funder who has already said yes once — lighter than a cold proposal. */
const RENEWAL: ChecklistTemplate = {
  id: RENEWAL_ID,
  name: 'Renewal (returning funder)',
  description:
    'A funder we already have a relationship with — refresh last year rather than start over.',
  items: items(RENEWAL_ID, [
    ['prospect', 'Confirm the funder is renewing this cycle', 0, 'startBy'],
    ['prospect', "Pull last year's report and outcomes", 2, 'startBy'],

    ['applying', "Update the narrative with this year's numbers", -21, 'applicationDue'],
    ['applying', 'Refresh the project budget', -14, 'applicationDue'],
    ['applying', 'Director review', -7, 'applicationDue'],
    ['applying', 'Submit renewal application', 0, 'applicationDue'],

    ['submitted', 'Send thank-you / confirmation note', 3, 'submitted'],

    ['awarded', 'Countersign grant agreement', 14, 'decided'],
    ['awarded', 'Schedule reports', 14, 'decided'],

    ['active', 'Reconcile expenses monthly', 30, 'periodStart'],

    ['reporting', 'Draft report', 60, 'periodEnd'],
    ['reporting', 'Submit report', 90, 'periodEnd'],
  ]),
};

export const DEFAULT_TEMPLATES: ChecklistTemplate[] = [STANDARD, GOVERNMENT, CORPORATE, RENEWAL];

/**
 * A fresh copy of the default playbook, for the demo and for a new office alike
 * (decision 0004). Items are offsets from a grant's own dates, so nothing in
 * them depends on the demo date. Never mutate `DEFAULT_TEMPLATES` itself.
 */
export function defaultTemplates(): ChecklistTemplate[] {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
}

/** The template the "Add grant" dialog pre-selects. */
export const DEFAULT_TEMPLATE_ID = STANDARD_ID;

/**
 * The template items a grant keeps, each with the task it becomes, in order.
 *
 * - A due date is computed as `grant.dates[anchor] + offsetDays`. When the
 *   anchor date is unknown the task is created with `dueDate: undefined`.
 * - LOI items are skipped when `grant.loiRequired` is false.
 * - `excludeItemIds` drops items the user unchecked in the onboarding dialog.
 * - `fromPhase` drops the items of every phase before it: a grant brought in
 *   already under way has passed them elsewhere (decision 0004).
 */
export function templatePlan(
  template: ChecklistTemplate,
  grant: Pick<Grant, 'id' | 'loiRequired' | 'dates' | 'ownerId'>,
  excludeItemIds: string[] = [],
  fromPhase?: Phase,
): Array<{ item: ChecklistTemplateItem; task: Omit<Task, 'id'> }> {
  const excluded = new Set(excludeItemIds);
  const from = fromPhase ? phaseIndex(fromPhase) : 0;
  return template.items
    .filter(item => !excluded.has(item.id))
    .filter(item => item.phase !== 'loi' || grant.loiRequired)
    .filter(item => phaseIndex(item.phase) < 0 || phaseIndex(item.phase) >= from)
    .map((item, index) => ({
      item,
      task: {
        grantId: grant.id,
        phase: item.phase,
        title: item.title,
        dueDate: dueDateFor(item.anchor, item.offsetDays, grant.dates),
        assigneeId: grant.ownerId,
        done: false,
        order: index,
      },
    }));
}

/** Turn a template into tasks for a grant: the tasks of `templatePlan`. */
export function instantiateTemplate(
  template: ChecklistTemplate,
  grant: Pick<Grant, 'id' | 'loiRequired' | 'dates' | 'ownerId'>,
  excludeItemIds: string[] = [],
  fromPhase?: Phase,
): Array<Omit<Task, 'id'>> {
  return templatePlan(template, grant, excludeItemIds, fromPhase).map(row => row.task);
}

function dueDateFor(
  anchor: DateAnchor,
  offsetDays: number,
  dates: Grant['dates'],
): string | undefined {
  const anchorDate = dates[anchor];
  if (!anchorDate) return undefined;
  return toISO(addDays(toDate(anchorDate), offsetDays));
}

/** Human phrasing for a template item's timing: "21 days before application due". */
const ANCHOR_LABELS: Record<DateAnchor, string> = {
  startBy: 'start date',
  loiDue: 'LOI due',
  applicationDue: 'application due',
  submitted: 'submission',
  decisionExpected: 'expected decision',
  decided: 'decision',
  periodStart: 'period start',
  periodEnd: 'period end',
};

export function timingLabel(item: Pick<ChecklistTemplateItem, 'offsetDays' | 'anchor'>): string {
  const anchor = ANCHOR_LABELS[item.anchor];
  if (item.offsetDays === 0) return `On ${anchor}`;
  const n = Math.abs(item.offsetDays);
  return `${n} ${n === 1 ? 'day' : 'days'} ${item.offsetDays < 0 ? 'before' : 'after'} ${anchor}`;
}

/**
 * The standard document register created with every grant (SPEC §4.3):
 * narrative, budget, IRS letter, board list, financials — all `needed`, or
 * all `submitted` on a grant brought in already awarded (the application that
 * won it went in with them).
 */
export const DEFAULT_DOCUMENT_REGISTER: Array<{ name: string; kind: DocumentKind }> = [
  { name: 'Program narrative', kind: 'narrative' },
  { name: 'Project budget', kind: 'budget' },
  { name: 'IRS determination letter', kind: 'irs-letter' },
  { name: 'Board of directors list', kind: 'board-list' },
  { name: 'Financial statements', kind: 'financials' },
];

export function instantiateDocumentRegister(
  grantId: string,
  updatedAt: string,
  status: DocumentStatus = 'needed',
): Array<Omit<GrantDocument, 'id'>> {
  return DEFAULT_DOCUMENT_REGISTER.map(doc => ({
    grantId,
    name: doc.name,
    kind: doc.kind,
    status,
    updatedAt,
  }));
}
