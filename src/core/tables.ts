import type { SliceTables } from './rows';
import { groupBy, orNull, withoutNulls } from './rows';
import { defaultSettings } from './seed';
import type {
  CoreState,
  FileFormat,
  OfficeDocument,
  OfficeDocumentKind,
  OrganizationKind,
  Role,
  VenueKind,
} from './types';

/**
 * Core's state as the rows of its tables in `docs/SCHEMA.md` ("Core"), and
 * back (#121). `logins` and `activity` are not core's: the sign-ins live in
 * `auth.ts`, and the activity rows are written by the slices whose records
 * they describe.
 */

export type ArchivedColumns = { archived_at: string | null; archived_by: string | null };

export type StaffRow = ArchivedColumns & {
  id: string;
  name: string;
  title: string;
  role: Role;
  teaches: boolean;
};

export type ProgramRow = ArchivedColumns & {
  id: string;
  name: string;
  short: string;
  in_school: boolean;
};

export type ProgramBudgetRow = { program_id: string; fiscal_year: string; amount: number };

export type ProjectRow = ArchivedColumns & {
  id: string;
  name: string;
  program_id: string;
  start_date: string;
  end_date: string;
  budget: number;
};

type Contact = {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export type OrganizationRow = ArchivedColumns &
  Contact & {
    id: string;
    name: string;
    kind: OrganizationKind;
    website: string | null;
    notes: string | null;
  };

export type VenueRow = ArchivedColumns &
  Contact & {
    id: string;
    name: string;
    kind: VenueKind;
    organization_id: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    notes: string | null;
  };

export type OfficeDocumentRow = ArchivedColumns & {
  id: string;
  kind: OfficeDocumentKind;
  name: string;
};

export type OfficeDocumentVersionRow = {
  id: string;
  office_document_id: string;
  number: number;
  name: string;
  format: FileFormat;
  size_kb: number;
  pages: number | null;
  added_at: string;
  added_by: string;
  expires: string | null;
};

export type SettingsRow = {
  id: 1;
  fiscal_year_start_month: number;
  enabled_modules: readonly string[];
};

export type CoreTables = {
  staff: StaffRow[];
  programs: ProgramRow[];
  program_budgets: ProgramBudgetRow[];
  projects: ProjectRow[];
  organizations: OrganizationRow[];
  venues: VenueRow[];
  office_documents: OfficeDocumentRow[];
  office_document_versions: OfficeDocumentVersionRow[];
  settings: SettingsRow[];
};

/** The two archive columns of a record, `null` while it is current. */
export function archivedColumns(row: {
  archivedAt?: string;
  archivedById?: string;
}): ArchivedColumns {
  return { archived_at: orNull(row.archivedAt), archived_by: orNull(row.archivedById) };
}

/** The archive fields back from their columns, left out while current. */
export function archivedFields(row: ArchivedColumns): {
  archivedAt?: string;
  archivedById?: string;
} {
  return withoutNulls({ archivedAt: row.archived_at, archivedById: row.archived_by });
}

export const coreTables: SliceTables<CoreState, CoreTables> = {
  keys: {
    staff: ['id'],
    programs: ['id'],
    program_budgets: ['program_id', 'fiscal_year'],
    projects: ['id'],
    organizations: ['id'],
    venues: ['id'],
    office_documents: ['id'],
    office_document_versions: ['id'],
    settings: ['id'],
  },

  toRows(state) {
    return {
      staff: state.staff.map(s => ({
        id: s.id,
        name: s.name,
        title: s.title,
        role: s.role,
        teaches: s.teaches,
        ...archivedColumns(s),
      })),
      programs: state.programs.map(p => ({
        id: p.id,
        name: p.name,
        short: p.short,
        in_school: p.inSchool,
        ...archivedColumns(p),
      })),
      program_budgets: state.programBudgets.map(b => ({
        program_id: b.programId,
        fiscal_year: b.fiscalYear,
        amount: b.amount,
      })),
      projects: state.projects.map(p => ({
        id: p.id,
        name: p.name,
        program_id: p.programId,
        start_date: p.start,
        end_date: p.end,
        budget: p.budget,
        ...archivedColumns(p),
      })),
      organizations: state.organizations.map(o => ({
        id: o.id,
        name: o.name,
        kind: o.kind,
        contact_name: orNull(o.contactName),
        contact_email: orNull(o.contactEmail),
        contact_phone: orNull(o.contactPhone),
        website: orNull(o.website),
        notes: orNull(o.notes),
        ...archivedColumns(o),
      })),
      venues: state.venues.map(v => ({
        id: v.id,
        name: v.name,
        kind: v.kind,
        organization_id: orNull(v.organizationId),
        street: orNull(v.address?.street),
        city: orNull(v.address?.city),
        state: orNull(v.address?.state),
        zip: orNull(v.address?.zip),
        contact_name: orNull(v.contactName),
        contact_email: orNull(v.contactEmail),
        contact_phone: orNull(v.contactPhone),
        notes: orNull(v.notes),
        ...archivedColumns(v),
      })),
      office_documents: state.officeDocuments.map(d => ({
        id: d.id,
        kind: d.kind,
        name: d.name,
        ...archivedColumns(d),
      })),
      office_document_versions: state.officeDocuments.flatMap(d =>
        d.versions.map(v => ({
          id: v.id,
          office_document_id: d.id,
          number: v.number,
          name: v.name,
          format: v.format,
          size_kb: v.sizeKb,
          pages: orNull(v.pages),
          added_at: v.addedAt,
          added_by: v.addedById,
          expires: orNull(v.expires),
        })),
      ),
      settings: [
        {
          id: 1,
          fiscal_year_start_month: state.settings.fiscalYearStartMonth,
          enabled_modules: [...state.settings.enabledModules],
        },
      ],
    };
  },

  fromRows(tables) {
    const versions = groupBy(tables.office_document_versions, 'office_document_id');
    const settings = tables.settings[0];
    return {
      staff: tables.staff.map(r => ({
        id: r.id,
        name: r.name,
        title: r.title,
        role: r.role,
        teaches: r.teaches,
        ...archivedFields(r),
      })),
      programs: tables.programs.map(r => ({
        id: r.id,
        name: r.name,
        short: r.short,
        inSchool: r.in_school,
        ...archivedFields(r),
      })),
      organizations: tables.organizations.map(r => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        ...withoutNulls({
          contactName: r.contact_name,
          contactEmail: r.contact_email,
          contactPhone: r.contact_phone,
          website: r.website,
          notes: r.notes,
        }),
        ...archivedFields(r),
      })),
      venues: tables.venues.map(r => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        ...withoutNulls({
          organizationId: r.organization_id,
          address: addressFrom(r.street, r.city, r.state, r.zip),
          contactName: r.contact_name,
          contactEmail: r.contact_email,
          contactPhone: r.contact_phone,
          notes: r.notes,
        }),
        ...archivedFields(r),
      })),
      programBudgets: tables.program_budgets.map(r => ({
        programId: r.program_id,
        fiscalYear: r.fiscal_year,
        amount: r.amount,
      })),
      projects: tables.projects.map(r => ({
        id: r.id,
        name: r.name,
        programId: r.program_id,
        start: r.start_date,
        end: r.end_date,
        budget: r.budget,
        ...archivedFields(r),
      })),
      officeDocuments: tables.office_documents.map((r): OfficeDocument => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        // Rows come back in no order: a document keeps its versions oldest first, by number (#131).
        versions: [...(versions.get(r.id) ?? [])]
          .sort((a, b) => a.number - b.number)
          .map(v => ({
            id: v.id,
            number: v.number,
            name: v.name,
            format: v.format,
            sizeKb: v.size_kb,
            addedAt: v.added_at,
            addedById: v.added_by,
            ...withoutNulls({ pages: v.pages, expires: v.expires }),
          })),
        ...archivedFields(r),
      })),
      settings: settings
        ? {
            fiscalYearStartMonth: settings.fiscal_year_start_month,
            enabledModules: [...settings.enabled_modules],
          }
        : defaultSettings(),
    };
  },
};

/**
 * An address from its four columns, all four or none (SCHEMA.md). A row with
 * only some of them set still gives an address, the rest blank, so nothing
 * typed in is lost.
 */
export function addressFrom(
  street: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): { street: string; city: string; state: string; zip: string } | undefined {
  if (street === null && city === null && state === null && zip === null) return undefined;
  return { street: street ?? '', city: city ?? '', state: state ?? '', zip: zip ?? '' };
}
