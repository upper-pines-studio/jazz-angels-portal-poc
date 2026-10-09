import React from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import {
  ArchiveDialog,
  ArchivedBadge,
  ShowArchivedSwitch,
  useArchivedParam,
} from '../../components/archive';
import { FundingBar } from '../../components/funding';
import { useToast } from '../../ToastHost';
import { Button, Card, EmptyState, Icon, Select } from '../../../design-system';
import {
  activeOnly,
  archivedOnly,
  isArchived,
  money,
  programBudget,
  programsList,
  projectById,
  projectsInFiscalYear,
  useCan,
  useStore,
} from '../../../core';
import type { FiscalYear, FundingTarget, Program, Project } from '../../../core';
import { ProgramDialog } from './ProgramDialog';
import type { ProgramDraft } from './ProgramDialog';
import { BudgetDialog, ProjectDialog } from './ProjectDialog';
import type { ProjectDraft } from './ProjectDialog';
import { ProgramSheet, ProjectSheet } from './Sheet';
import { barParts, fundingOf, useFiscalYearParam } from './funding';
import './programs.css';

/**
 * Operations › Programs: every program, with its projects nested under it, in
 * a list that scrolls on its own, and the selected one's sheet beside it
 * (decision 0006). The URL names the selection (`/programs/:id`, or
 * `/programs/projects/:projectId`), `?fy=FY28` the fiscal year (this one when
 * unset) and `?archived=1` Show archived.
 *
 * Who does what (decision 0001): Add program, Edit, Archive and Restore of a
 * program are Admin and Director ("Programs"). Budgets and projects are
 * "Program budgets and projects": Edit for Admin, Director, Office manager and
 * Bookkeeper, View for Office assistant and Read-only; a Teacher sees the
 * program names only. "Paid for by" on each sheet is the grants module's part,
 * through its manifest.
 *
 * A core screen, since programs, budgets and projects are core's nouns.
 */
export default function Programs() {
  const { state, actions } = useStore();
  const can = useCan();
  const mayEdit = can('programs', 'edit');
  const mayMoney = can('program-budgets');
  const mayBudget = can('program-budgets', 'edit');
  const { id, projectId } = useParams();
  const { search } = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const [showArchived, setShowArchived] = useArchivedParam();
  const { fy, choices, setFy } = useFiscalYearParam();
  const [draft, setDraft] = React.useState<ProgramDraft | null>(null);
  const [archiving, setArchiving] = React.useState<Program | null>(null);
  const [projectDraft, setProjectDraft] = React.useState<ProjectDraft | null>(null);
  const [archivingProject, setArchivingProject] = React.useState<Project | null>(null);
  const [budgetFor, setBudgetFor] = React.useState<string | null>(null);

  const rows = programsList(state, showArchived);
  const current = activeOnly(state.core.programs).length;
  const archivedCount =
    archivedOnly(state.core.programs).length +
    (mayMoney ? archivedOnly(projectsInFiscalYear(state, fy, true)).length : 0);
  const projects = mayMoney ? projectsInFiscalYear(state, fy, showArchived) : [];
  // An archived program or project still opens from a link: it is history.
  const project = projectId && mayMoney ? projectById(state, projectId) : undefined;
  const program = projectId ? undefined : state.core.programs.find(p => p.id === id);
  const select = (programId: string) => nav(`/programs/${programId}${search}`);
  const openProject = (pid: string) => nav(`/programs/projects/${pid}${search}`);

  usePageHeader({
    title: 'Programs',
    subtitle:
      current > 0
        ? `${current} ${current === 1 ? 'program' : 'programs'}`
        : state.core.programs.length > 0
          ? 'No current programs'
          : 'No programs yet',
    actions: mayEdit ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setDraft({ name: '', short: '' })}
      >
        Add program
      </Button>
    ) : undefined,
  });

  function restore(p: Program) {
    actions.core.restoreProgram(p.id);
    toast({
      tone: 'success',
      title: 'Program restored',
      message: `${p.name} is back in the pickers.`,
    });
  }

  function restoreProject(p: Project) {
    actions.core.restoreProject(p.id);
    toast({
      tone: 'success',
      title: 'Project restored',
      message: `${p.name} is back on the list, and the grant money given to it counts again.`,
    });
  }

  const dialogs = (
    <>
      {draft && mayEdit && (
        <ProgramDialog draft={draft} onClose={() => setDraft(null)} onAdded={select} />
      )}
      {archiving && mayEdit && (
        <ArchiveDialog
          title={`Archive ${archiving.name}?`}
          message="It leaves the pickers for new grants, students, ensembles and hours. Everything that already names it keeps it, and you can restore it."
          onConfirm={() => {
            actions.core.archiveProgram(archiving.id);
            toast({
              tone: 'success',
              title: 'Program archived',
              message: `${archiving.name} is off the pickers. Restore it from Show archived.`,
            });
            // The sheet that was open is gone from the list; open the first one.
            if (!showArchived) nav(`/programs${search}`, { replace: true });
          }}
          onClose={() => setArchiving(null)}
        />
      )}
      {projectDraft && mayBudget && (
        <ProjectDialog
          draft={projectDraft}
          onClose={() => setProjectDraft(null)}
          onAdded={openProject}
        />
      )}
      {archivingProject && mayBudget && (
        <ArchiveDialog
          title={`Archive ${archivingProject.name}?`}
          message="It leaves the Programs list. The grant money given to it stays in each grant's history and goes back to not yet given. You can restore it."
          onConfirm={() => {
            actions.core.archiveProject(archivingProject.id);
            toast({
              tone: 'success',
              title: 'Project archived',
              message: `${archivingProject.name} is off the list. Restore it from Show archived.`,
            });
            if (!showArchived) select(archivingProject.programId);
          }}
          onClose={() => setArchivingProject(null)}
        />
      )}
      {budgetFor && mayBudget && (
        <BudgetDialog programId={budgetFor} fy={fy} onClose={() => setBudgetFor(null)} />
      )}
    </>
  );

  if (state.core.programs.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            icon={<Icon name="layers" size={22} />}
            title="No programs yet"
            message={
              mayEdit
                ? 'Studio sessions, in-school classes and the other programs a grant, a student or an ensemble belongs to show up here. Add one to start.'
                : 'Studio sessions, in-school classes and the other programs a grant, a student or an ensemble belongs to show up here, once an admin or a director adds them.'
            }
            action={
              mayEdit ? (
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={() => setDraft({ name: '', short: '' })}
                >
                  Add program
                </Button>
              ) : undefined
            }
          />
        </Card>
        {dialogs}
      </>
    );
  }

  // No program or project named, or one that is not here: the first program on the list.
  if (!program && !project) {
    const first = rows[0] ?? state.core.programs[0];
    return <Navigate to={`/programs/${first.id}${search}`} replace />;
  }

  const selectedKey = project ? `project:${project.id}` : `program:${program?.id}`;

  return (
    <>
      <div className="ja-programs">
        <aside className="ja-programs__side" aria-label="Programs">
          {mayMoney && (
            <div className="ja-programs__head">
              <label className="ja-programs__fy">
                <span>Fiscal year</span>
                <Select
                  value={fy.label}
                  options={choices.map(c => c.label)}
                  onChange={e => setFy(e.target.value)}
                />
              </label>
              <YearTotals fy={fy} programs={rows} projects={projects} />
            </div>
          )}
          <ShowArchivedSwitch
            count={archivedCount}
            checked={showArchived}
            onChange={setShowArchived}
          />
          {rows.length === 0 ? (
            <p className="ja-programs__none">
              Every program is archived. Show archived lists them.
            </p>
          ) : (
            <ul className="ja-programs__list">
              {rows.map(p => {
                const under = projects.filter(x => x.programId === p.id);
                return (
                  <li key={p.id}>
                    <ListItem
                      to={`/programs/${p.id}${search}`}
                      name={p.name}
                      archived={isArchived(p)}
                      current={selectedKey === `program:${p.id}`}
                      note={p.short !== p.name ? p.short : undefined}
                      target={
                        mayMoney
                          ? { kind: 'program', programId: p.id, fiscalYear: fy.label }
                          : undefined
                      }
                      fy={fy}
                    />
                    {under.length > 0 && (
                      <ul className="ja-programs__projects" aria-label={`Projects in ${p.name}`}>
                        {under.map(x => (
                          <li key={x.id}>
                            <ListItem
                              to={`/programs/projects/${x.id}${search}`}
                              name={x.name}
                              archived={isArchived(x)}
                              current={selectedKey === `project:${x.id}`}
                              target={{ kind: 'project', projectId: x.id }}
                              fy={fy}
                              project
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {program && (
          <ProgramSheet
            program={program}
            fy={fy}
            showArchived={showArchived}
            onEdit={
              mayEdit
                ? () => setDraft({ id: program.id, name: program.name, short: program.short })
                : undefined
            }
            onArchive={mayEdit ? () => setArchiving(program) : undefined}
            onRestore={mayEdit ? () => restore(program) : undefined}
            onSetBudget={mayBudget ? () => setBudgetFor(program.id) : undefined}
            onAddProject={
              mayBudget
                ? () =>
                    setProjectDraft({
                      name: '',
                      programId: program.id,
                      start: '',
                      end: '',
                      budget: '',
                    })
                : undefined
            }
          />
        )}
        {project && (
          <ProjectSheet
            project={project}
            onEdit={
              mayBudget
                ? () =>
                    setProjectDraft({
                      id: project.id,
                      name: project.name,
                      programId: project.programId,
                      start: project.start,
                      end: project.end,
                      budget: String(project.budget),
                    })
                : undefined
            }
            onArchive={mayBudget ? () => setArchivingProject(project) : undefined}
            onRestore={mayBudget ? () => restoreProject(project) : undefined}
          />
        )}
      </div>
      {dialogs}
    </>
  );
}

/** "FY27: $106,500 budgeted · $83,500 funded", over the list. */
function YearTotals({
  fy,
  programs,
  projects,
}: {
  fy: FiscalYear;
  programs: Program[];
  projects: Project[];
}) {
  const { state, user } = useStore();
  const targets: FundingTarget[] = [
    ...activeOnly(programs).map(p => ({
      kind: 'program' as const,
      programId: p.id,
      fiscalYear: fy.label,
    })),
    ...activeOnly(projects).map(p => ({ kind: 'project' as const, projectId: p.id })),
  ];
  let budgeted = 0;
  let funded = 0;
  for (const t of targets) {
    const { summary } = fundingOf(state, user.role, t);
    budgeted += summary.budget;
    funded += summary.funded;
  }
  return (
    <p className="ja-programs__totals">
      {budgeted === 0 && funded === 0
        ? `Nothing budgeted for ${fy.label} yet.`
        : `${money(budgeted)} budgeted · ${money(funded)} funded`}
    </p>
  );
}

/**
 * One program or project on the list. For a role that may see budgets: what
 * is funded against its budget for the fiscal year, and the bar.
 */
function ListItem({
  to,
  name,
  archived,
  current,
  note,
  target,
  fy,
  project = false,
}: {
  to: string;
  name: string;
  archived: boolean;
  current: boolean;
  /** The short name, for a role that sees no money. */
  note?: string;
  target?: FundingTarget;
  fy: FiscalYear;
  project?: boolean;
}) {
  const { state, user } = useStore();
  const funding = target && fundingOf(state, user.role, target);
  const hasBudget =
    !target ||
    target.kind === 'project' ||
    programBudget(state, target.programId, fy.label) !== undefined;
  return (
    <Link
      to={to}
      className={project ? 'ja-programs__item ja-programs__item--project' : 'ja-programs__item'}
      aria-current={current ? 'page' : undefined}
    >
      <span className="ja-programs__name">{name}</span>
      {archived && <ArchivedBadge />}
      {funding ? (
        <>
          <span className="ja-programs__short">{fundedLine(funding.summary, hasBudget)}</span>
          {(funding.summary.budget > 0 || funding.summary.funded > 0) && (
            <FundingBar
              size="sm"
              parts={barParts(funding.sources)}
              max={funding.summary.budget}
              label={fundedLine(funding.summary, hasBudget)}
            />
          )}
        </>
      ) : (
        !archived && note && <span className="ja-programs__short">{note}</span>
      )}
    </Link>
  );
}

/** "$15,300 of $18,000 · $2,700 to find", "covered", "over", or no budget yet. */
function fundedLine(
  s: { budget: number; funded: number; stillToFind: number; overBudget: number },
  hasBudget: boolean,
): string {
  if (!hasBudget || s.budget === 0) {
    return s.funded > 0 ? `${money(s.funded)} · no budget yet` : 'No budget yet';
  }
  const of = `${money(s.funded)} of ${money(s.budget)}`;
  if (s.overBudget > 0) return `${of} · ${money(s.overBudget)} over`;
  if (s.stillToFind > 0) return `${of} · ${money(s.stillToFind)} to find`;
  return `${of} · covered`;
}
