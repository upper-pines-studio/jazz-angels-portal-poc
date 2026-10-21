import type { SliceTables } from '../../../core/rows';
import { groupBy, instantFrom, minuteFrom, orNull, withoutNulls } from '../../../core/rows';
import { archivedColumns, archivedFields } from '../../../core/tables';
import type { ArchivedColumns } from '../../../core/tables';
import type { FileFormat, FundingTarget } from '../../../core/types';
import { makeEmpty } from './seed';
import type {
  DateAnchor,
  DocumentKind,
  DocumentStatus,
  FunderType,
  GrantFileKind,
  GrantsState,
  Phase,
  ReportStatus,
  Restriction,
  TransactionStatus,
} from './types';

/**
 * Grants' state as the rows of its tables in `docs/SCHEMA.md` ("Grants" and
 * "Money"), and back (#121). The nested shapes come apart as SCHEMA.md says:
 * `Grant.dates` and `broughtIn` are columns on `grants`, `Grant.programs` is
 * `grant_programs`, a share's target is columns on `grant_shares`, a
 * template's items, a reminder plan's recipients, a split rule's parts and a
 * budget line's accounts are child tables, and the log is `activity` rows with
 * subject kind `grant`.
 *
 * Not stored: `incoming`, the demo's stand-in for what the next QuickBooks sync
 * brings (SCHEMA.md, "What is not stored"); read back, it is empty.
 */

export type FunderRow = ArchivedColumns & {
  id: string;
  name: string;
  type: FunderType;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  cycle_notes: string | null;
  notes: string | null;
};

export type GrantRow = ArchivedColumns & {
  id: string;
  funder_id: string;
  title: string;
  restriction: Restriction;
  owner_id: string;
  phase: Phase;
  loi_required: boolean;
  amount_requested: number | null;
  amount_awarded: number | null;
  start_by: string | null;
  loi_due: string | null;
  application_due: string | null;
  submitted: string | null;
  decision_expected: string | null;
  decided: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  created_at: string;
  brought_in_phase: Phase | null;
  brought_in_on: string | null;
  renews_grant_id: string | null;
};

export type GrantProgramRow = { grant_id: string; program_id: string };

export type GrantShareRow = {
  id: string;
  grant_id: string;
  target_kind: FundingTarget['kind'];
  program_id: string | null;
  fiscal_year: string | null;
  project_id: string | null;
  amount: number;
};

export type TaskRow = {
  id: string;
  grant_id: string;
  phase: Phase;
  title: string;
  due_date: string | null;
  assignee_id: string | null;
  done: boolean;
  done_at: string | null;
  sort_order: number;
};

export type GrantDocumentRow = {
  id: string;
  grant_id: string;
  name: string;
  kind: DocumentKind;
  status: DocumentStatus;
  url: string | null;
  office_document_id: string | null;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  grant_id: string;
  label: string;
  expected_date: string;
  amount: number;
  received_date: string | null;
  source_page: number | null;
};

export type AwardTermRow = {
  id: string;
  grant_id: string;
  label: string;
  text: string;
  page: number | null;
  sort_order: number;
};

export type ReportRow = {
  id: string;
  grant_id: string;
  kind: 'interim' | 'final';
  due_date: string;
  submitted_date: string | null;
  status: ReportStatus;
};

export type ReminderPlanRow = {
  report_id: string;
  offsets: readonly number[];
  keep_reminding: boolean;
};

export type ReminderPlanRecipientRow = { report_id: string; staff_id: string };

export type ReminderDefaultsRow = {
  id: 1;
  offsets: readonly number[];
  keep_reminding: boolean;
  repeat_every_days: number;
  send_hour: number;
};

export type ReminderDefaultRecipientRow = { staff_id: string };

export type ChecklistTemplateRow = { id: string; name: string; description: string | null };

export type ChecklistTemplateItemRow = {
  id: string;
  template_id: string;
  phase: Phase;
  title: string;
  offset_days: number;
  anchor: DateAnchor;
  sort_order: number;
};

export type QuickBooksConnectionRow = {
  id: 1;
  connected: boolean;
  company: string | null;
  last_synced_at: string | null;
};

export type QbAccountRow = { code: string; name: string };

export type QbClassRow = { id: string; name: string };

export type TransactionRow = {
  id: string;
  date: string;
  payee: string;
  memo: string;
  account_code: string;
  class_id: string | null;
  amount: number;
  ref: string;
  status: TransactionStatus;
  assigned_by: string | null;
  assigned_at: string | null;
};

export type BudgetVersionRow = { id: string; grant_id: string; number: number };

export type BudgetLineRow = {
  id: string;
  grant_id: string;
  category: string;
  class_id: string | null;
};

export type BudgetLineAmountRow = {
  budget_version_id: string;
  budget_line_id: string;
  planned: number;
};

export type BudgetLineAccountRow = { budget_line_id: string; account_code: string };

export type ExpenseRow = {
  id: string;
  grant_id: string;
  budget_line_id: string;
  date: string;
  payee: string;
  amount: number;
  note: string | null;
  transaction_id: string | null;
  backup_note: string | null;
};

export type SplitRuleRow = { id: string; payee: string };

export type SplitRulePartRow = {
  split_rule_id: string;
  part: number;
  grant_id: string;
  budget_line_id: string;
  percent: number;
};

export type GrantFileRow = {
  id: string;
  grant_id: string;
  expense_id: string | null;
  kind: GrantFileKind;
  name: string;
  format: FileFormat;
  size_kb: number;
  pages: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

export type GrantActivityRow = {
  id: string;
  subject_kind: 'grant';
  subject_id: string;
  at: string;
  who_id: string | null;
  who: string | null;
  text: string;
  kind: null;
  detail: null;
};

export type GrantsTables = {
  funders: FunderRow[];
  grants: GrantRow[];
  grant_programs: GrantProgramRow[];
  grant_shares: GrantShareRow[];
  tasks: TaskRow[];
  grant_documents: GrantDocumentRow[];
  payments: PaymentRow[];
  award_terms: AwardTermRow[];
  reports: ReportRow[];
  reminder_plans: ReminderPlanRow[];
  reminder_plan_recipients: ReminderPlanRecipientRow[];
  reminder_defaults: ReminderDefaultsRow[];
  reminder_default_recipients: ReminderDefaultRecipientRow[];
  checklist_templates: ChecklistTemplateRow[];
  checklist_template_items: ChecklistTemplateItemRow[];
  quickbooks_connection: QuickBooksConnectionRow[];
  qb_accounts: QbAccountRow[];
  qb_classes: QbClassRow[];
  transactions: TransactionRow[];
  budget_versions: BudgetVersionRow[];
  budget_lines: BudgetLineRow[];
  budget_line_amounts: BudgetLineAmountRow[];
  budget_line_accounts: BudgetLineAccountRow[];
  expenses: ExpenseRow[];
  split_rules: SplitRuleRow[];
  split_rule_parts: SplitRulePartRow[];
  grant_files: GrantFileRow[];
  activity: GrantActivityRow[];
};

/**
 * The id of a grant's first budget, version 1 (decision 0005, "Budget
 * changes"). The browser build has only that one, and a budget line's
 * `planned` is its amount there. Derived from the grant's id, so it is made in
 * the change that adds the grant (SCHEMA.md, "Ids").
 */
export function firstBudgetId(grantId: string): string {
  return `${grantId}-budget-1`;
}

const bySortOrder = <R extends { sort_order: number }>(rows: R[]): R[] =>
  [...rows].sort((a, b) => a.sort_order - b.sort_order);

export const grantsTables: SliceTables<GrantsState, GrantsTables> = {
  keys: {
    funders: ['id'],
    grants: ['id'],
    grant_programs: ['grant_id', 'program_id'],
    grant_shares: ['id'],
    tasks: ['id'],
    grant_documents: ['id'],
    payments: ['id'],
    award_terms: ['id'],
    reports: ['id'],
    reminder_plans: ['report_id'],
    reminder_plan_recipients: ['report_id', 'staff_id'],
    reminder_defaults: ['id'],
    reminder_default_recipients: ['staff_id'],
    checklist_templates: ['id'],
    checklist_template_items: ['id'],
    quickbooks_connection: ['id'],
    qb_accounts: ['code'],
    qb_classes: ['id'],
    transactions: ['id'],
    budget_versions: ['id'],
    budget_lines: ['id'],
    budget_line_amounts: ['budget_version_id', 'budget_line_id'],
    budget_line_accounts: ['budget_line_id', 'account_code'],
    expenses: ['id'],
    split_rules: ['id'],
    split_rule_parts: ['split_rule_id', 'part'],
    grant_files: ['id'],
    activity: ['id'],
  },

  toRows(state) {
    const d = state.reminderDefaults;
    const qb = state.quickbooks;
    return {
      funders: state.funders.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        contact_name: orNull(f.contactName),
        contact_email: orNull(f.contactEmail),
        contact_phone: orNull(f.contactPhone),
        website: orNull(f.website),
        cycle_notes: orNull(f.cycleNotes),
        notes: orNull(f.notes),
        ...archivedColumns(f),
      })),
      grants: state.grants.map(g => ({
        id: g.id,
        funder_id: g.funderId,
        title: g.title,
        restriction: g.restriction,
        owner_id: g.ownerId,
        phase: g.phase,
        loi_required: g.loiRequired,
        amount_requested: orNull(g.amountRequested),
        amount_awarded: orNull(g.amountAwarded),
        start_by: orNull(g.dates.startBy),
        loi_due: orNull(g.dates.loiDue),
        application_due: orNull(g.dates.applicationDue),
        submitted: orNull(g.dates.submitted),
        decision_expected: orNull(g.dates.decisionExpected),
        decided: orNull(g.dates.decided),
        period_start: orNull(g.dates.periodStart),
        period_end: orNull(g.dates.periodEnd),
        notes: orNull(g.notes),
        created_at: g.createdAt,
        brought_in_phase: orNull(g.broughtIn?.phase),
        brought_in_on: orNull(g.broughtIn?.on),
        renews_grant_id: orNull(g.renewsGrantId),
        ...archivedColumns(g),
      })),
      grant_programs: state.grants.flatMap(g =>
        g.programs.map(programId => ({ grant_id: g.id, program_id: programId })),
      ),
      grant_shares: state.grantShares.map(s => ({
        id: s.id,
        grant_id: s.grantId,
        target_kind: s.target.kind,
        program_id: s.target.kind === 'program' ? s.target.programId : null,
        fiscal_year: s.target.kind === 'program' ? s.target.fiscalYear : null,
        project_id: s.target.kind === 'project' ? s.target.projectId : null,
        amount: s.amount,
      })),
      tasks: state.tasks.map(t => ({
        id: t.id,
        grant_id: t.grantId,
        phase: t.phase,
        title: t.title,
        due_date: orNull(t.dueDate),
        assignee_id: orNull(t.assigneeId),
        done: t.done,
        done_at: orNull(t.doneAt),
        sort_order: t.order,
      })),
      grant_documents: state.documents.map(doc => ({
        id: doc.id,
        grant_id: doc.grantId,
        name: doc.name,
        kind: doc.kind,
        status: doc.status,
        url: orNull(doc.url),
        office_document_id: orNull(doc.officeDocumentId),
        updated_at: doc.updatedAt,
      })),
      payments: state.payments.map(p => ({
        id: p.id,
        grant_id: p.grantId,
        label: p.label,
        expected_date: p.expectedDate,
        amount: p.amount,
        received_date: orNull(p.receivedDate),
        source_page: orNull(p.sourcePage),
      })),
      award_terms: state.terms.map(t => ({
        id: t.id,
        grant_id: t.grantId,
        label: t.label,
        text: t.text,
        page: orNull(t.page),
        sort_order: t.order,
      })),
      reports: state.reports.map(r => ({
        id: r.id,
        grant_id: r.grantId,
        kind: r.kind,
        due_date: r.dueDate,
        submitted_date: orNull(r.submittedDate),
        status: r.status,
      })),
      reminder_plans: state.reminderPlans.map(p => ({
        report_id: p.reportId,
        offsets: [...p.offsets],
        keep_reminding: p.keepReminding,
      })),
      reminder_plan_recipients: state.reminderPlans.flatMap(p =>
        p.recipientIds.map(staffId => ({ report_id: p.reportId, staff_id: staffId })),
      ),
      reminder_defaults: [
        {
          id: 1,
          offsets: [...d.offsets],
          keep_reminding: d.keepReminding,
          repeat_every_days: d.repeatEveryDays,
          send_hour: d.sendHour,
        },
      ],
      reminder_default_recipients: d.alsoNotifyIds.map(staffId => ({ staff_id: staffId })),
      checklist_templates: state.templates.map(t => ({
        id: t.id,
        name: t.name,
        description: orNull(t.description),
      })),
      checklist_template_items: state.templates.flatMap(t =>
        t.items.map((item, i) => ({
          id: item.id,
          template_id: t.id,
          phase: item.phase,
          title: item.title,
          offset_days: item.offsetDays,
          anchor: item.anchor,
          sort_order: i + 1,
        })),
      ),
      quickbooks_connection: [
        {
          id: 1,
          connected: qb.connected,
          // Blank until connected and synced, as a new office starts it.
          company: qb.company || null,
          last_synced_at: qb.lastSyncedAt || null,
        },
      ],
      qb_accounts: state.accounts.map(a => ({ code: a.code, name: a.name })),
      qb_classes: state.classes.map(c => ({ id: c.id, name: c.name })),
      transactions: state.transactions.map(t => ({
        id: t.id,
        date: t.date,
        payee: t.payee,
        memo: t.memo,
        account_code: t.accountCode,
        class_id: orNull(t.classId),
        amount: t.amount,
        ref: t.ref,
        status: t.status,
        assigned_by: orNull(t.assignedById),
        assigned_at: orNull(t.assignedAt),
      })),
      budget_versions: state.grants.map(g => ({
        id: firstBudgetId(g.id),
        grant_id: g.id,
        number: 1,
      })),
      budget_lines: state.budgetLines.map(l => ({
        id: l.id,
        grant_id: l.grantId,
        category: l.category,
        class_id: orNull(l.classId),
      })),
      budget_line_amounts: state.budgetLines.map(l => ({
        budget_version_id: firstBudgetId(l.grantId),
        budget_line_id: l.id,
        planned: l.planned,
      })),
      budget_line_accounts: state.budgetLines.flatMap(l =>
        (l.accountCodes ?? []).map(code => ({ budget_line_id: l.id, account_code: code })),
      ),
      expenses: state.expenses.map(e => ({
        id: e.id,
        grant_id: e.grantId,
        budget_line_id: e.budgetLineId,
        date: e.date,
        payee: e.payee,
        amount: e.amount,
        note: orNull(e.note),
        transaction_id: orNull(e.transactionId),
        backup_note: orNull(e.backupNote),
      })),
      split_rules: state.splitRules.map(r => ({ id: r.id, payee: r.payee })),
      split_rule_parts: state.splitRules.flatMap(r =>
        r.parts.map((p, i) => ({
          split_rule_id: r.id,
          part: i + 1,
          grant_id: p.grantId,
          budget_line_id: p.budgetLineId,
          percent: p.percent,
        })),
      ),
      grant_files: state.files.map(f => ({
        id: f.id,
        grant_id: f.grantId,
        expense_id: orNull(f.expenseId),
        kind: f.kind,
        name: f.name,
        format: f.format,
        size_kb: f.sizeKb,
        pages: orNull(f.pages),
        uploaded_by: f.uploadedById,
        uploaded_at: f.uploadedAt,
      })),
      activity: state.activity.map(a => ({
        id: a.id,
        subject_kind: 'grant',
        subject_id: a.grantId,
        at: a.at,
        who_id: orNull(a.whoId),
        who: orNull(a.who),
        text: a.text,
        kind: null,
        detail: null,
      })),
    };
  },

  fromRows(tables) {
    const fallback = makeEmpty();
    const programs = groupBy(tables.grant_programs, 'grant_id');
    const recipients = groupBy(tables.reminder_plan_recipients, 'report_id');
    const items = groupBy(tables.checklist_template_items, 'template_id');
    const parts = groupBy(tables.split_rule_parts, 'split_rule_id');
    const accounts = groupBy(tables.budget_line_accounts, 'budget_line_id');
    // A line's planned amount is the one in its grant's current budget: the
    // highest version number (decision 0005). The browser build has only 1.
    const versionNumber = new Map(tables.budget_versions.map(v => [v.id, v.number]));
    const planned = new Map<string, { number: number; planned: number }>();
    for (const a of tables.budget_line_amounts) {
      const number = versionNumber.get(a.budget_version_id) ?? 0;
      const held = planned.get(a.budget_line_id);
      if (!held || number >= held.number)
        planned.set(a.budget_line_id, { number, planned: a.planned });
    }
    const defaults = tables.reminder_defaults[0];
    const qb = tables.quickbooks_connection[0];
    return {
      funders: tables.funders.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        ...withoutNulls({
          contactName: r.contact_name,
          contactEmail: r.contact_email,
          contactPhone: r.contact_phone,
          website: r.website,
          cycleNotes: r.cycle_notes,
          notes: r.notes,
        }),
        ...archivedFields(r),
      })),
      grants: tables.grants.map(r => ({
        id: r.id,
        funderId: r.funder_id,
        title: r.title,
        programs: (programs.get(r.id) ?? []).map(p => p.program_id),
        restriction: r.restriction,
        ownerId: r.owner_id,
        phase: r.phase,
        loiRequired: r.loi_required,
        dates: withoutNulls({
          startBy: r.start_by,
          loiDue: r.loi_due,
          applicationDue: r.application_due,
          submitted: r.submitted,
          decisionExpected: r.decision_expected,
          decided: r.decided,
          periodStart: r.period_start,
          periodEnd: r.period_end,
        }),
        createdAt: r.created_at,
        ...withoutNulls({
          amountRequested: r.amount_requested,
          amountAwarded: r.amount_awarded,
          notes: r.notes,
          broughtIn:
            r.brought_in_phase !== null && r.brought_in_on !== null
              ? { phase: r.brought_in_phase, on: r.brought_in_on }
              : undefined,
          renewsGrantId: r.renews_grant_id,
        }),
        ...archivedFields(r),
      })),
      tasks: tables.tasks.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        phase: r.phase,
        title: r.title,
        done: r.done,
        order: r.sort_order,
        ...withoutNulls({ dueDate: r.due_date, assigneeId: r.assignee_id, doneAt: r.done_at }),
      })),
      documents: tables.grant_documents.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        name: r.name,
        kind: r.kind,
        status: r.status,
        updatedAt: r.updated_at,
        ...withoutNulls({ url: r.url, officeDocumentId: r.office_document_id }),
      })),
      payments: tables.payments.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        label: r.label,
        expectedDate: r.expected_date,
        amount: r.amount,
        ...withoutNulls({ receivedDate: r.received_date, sourcePage: r.source_page }),
      })),
      budgetLines: tables.budget_lines.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        category: r.category,
        planned: planned.get(r.id)?.planned ?? 0,
        accountCodes: (accounts.get(r.id) ?? []).map(a => a.account_code),
        ...withoutNulls({ classId: r.class_id }),
      })),
      expenses: tables.expenses.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        budgetLineId: r.budget_line_id,
        date: r.date,
        payee: r.payee,
        amount: r.amount,
        ...withoutNulls({
          note: r.note,
          transactionId: r.transaction_id,
          backupNote: r.backup_note,
        }),
      })),
      reports: tables.reports.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        kind: r.kind,
        dueDate: r.due_date,
        status: r.status,
        ...withoutNulls({ submittedDate: r.submitted_date }),
      })),
      activity: tables.activity
        .filter(r => r.subject_kind === 'grant')
        .map(r => ({
          id: r.id,
          grantId: r.subject_id,
          at: instantFrom(r.at),
          text: r.text,
          ...withoutNulls({ whoId: r.who_id, who: r.who }),
        })),
      templates: tables.checklist_templates.map(r => ({
        id: r.id,
        name: r.name,
        ...withoutNulls({ description: r.description }),
        items: bySortOrder(items.get(r.id) ?? []).map(i => ({
          id: i.id,
          phase: i.phase,
          title: i.title,
          offsetDays: i.offset_days,
          anchor: i.anchor,
        })),
      })),
      quickbooks: qb
        ? {
            connected: qb.connected,
            company: qb.company ?? '',
            lastSyncedAt: qb.last_synced_at ? minuteFrom(qb.last_synced_at) : '',
          }
        : fallback.quickbooks,
      accounts: tables.qb_accounts.map(r => ({ code: r.code, name: r.name })),
      classes: tables.qb_classes.map(r => ({ id: r.id, name: r.name })),
      transactions: tables.transactions.map(r => ({
        id: r.id,
        date: r.date,
        payee: r.payee,
        memo: r.memo,
        accountCode: r.account_code,
        amount: r.amount,
        ref: r.ref,
        status: r.status,
        ...withoutNulls({
          classId: r.class_id,
          assignedById: r.assigned_by,
          assignedAt: r.assigned_at,
        }),
      })),
      incoming: [],
      splitRules: tables.split_rules.map(r => ({
        id: r.id,
        payee: r.payee,
        parts: [...(parts.get(r.id) ?? [])]
          .sort((a, b) => a.part - b.part)
          .map(p => ({ grantId: p.grant_id, budgetLineId: p.budget_line_id, percent: p.percent })),
      })),
      files: tables.grant_files.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        kind: r.kind,
        name: r.name,
        format: r.format,
        sizeKb: r.size_kb,
        uploadedById: r.uploaded_by,
        uploadedAt: r.uploaded_at,
        ...withoutNulls({ expenseId: r.expense_id, pages: r.pages }),
      })),
      terms: tables.award_terms.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        label: r.label,
        text: r.text,
        order: r.sort_order,
        ...withoutNulls({ page: r.page }),
      })),
      reminderPlans: tables.reminder_plans.map(r => ({
        reportId: r.report_id,
        offsets: [...r.offsets],
        recipientIds: (recipients.get(r.report_id) ?? []).map(p => p.staff_id),
        keepReminding: r.keep_reminding,
      })),
      reminderDefaults: defaults
        ? {
            offsets: [...defaults.offsets],
            alsoNotifyIds: tables.reminder_default_recipients.map(r => r.staff_id),
            keepReminding: defaults.keep_reminding,
            repeatEveryDays: defaults.repeat_every_days,
            sendHour: defaults.send_hour,
          }
        : fallback.reminderDefaults,
      grantShares: tables.grant_shares.map(r => ({
        id: r.id,
        grantId: r.grant_id,
        target: shareTarget(r),
        amount: r.amount,
      })),
    };
  },
};

/** A share's target from its columns: a program's year, or a project. */
function shareTarget(row: GrantShareRow): FundingTarget {
  return row.target_kind === 'project'
    ? { kind: 'project', projectId: row.project_id ?? '' }
    : { kind: 'program', programId: row.program_id ?? '', fiscalYear: row.fiscal_year ?? '' };
}
