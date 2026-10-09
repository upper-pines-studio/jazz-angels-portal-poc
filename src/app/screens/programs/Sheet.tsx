import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Card, Icon } from '../../../design-system';
import {
  dateRange,
  fiscalYearsOverlapping,
  isArchived,
  isOperations,
  money,
  programBudget,
  programName,
  projectsForProgram,
  useCan,
  useStore,
} from '../../../core';
import type { FiscalYear, FundingTarget, Program, Project } from '../../../core';
import { ArchivedBadge } from '../../components/archive';
import { KV } from '../../components/badges';
import { Figure, Figures, FundingBar, FundingLabel } from '../../components/funding';
import { barParts, fundingContributions, fundingOf } from './funding';

/**
 * The money part of a sheet: the four figures, the stacked bar, a line saying
 * when, and each module's own part ("Paid for by", from grants). Shown to the
 * roles that may see program budgets (decision 0001).
 */
function FundingPart({
  target,
  when,
  budgetAction,
  noBudget,
}: {
  target: FundingTarget;
  /** "FY27 runs Jul 1, 2026 – Jun 30, 2027." */
  when: React.ReactNode;
  /** Set budget or Change budget, for a role that may. */
  budgetAction?: React.ReactNode;
  /** Unset when there is a budget; else the sentence that says there is none. */
  noBudget?: string;
}) {
  const { state, user } = useStore();
  const { sources, summary } = fundingOf(state, user.role, target);
  const panels = fundingContributions(state, user.role).filter(c => c.panel);
  // With no budget set, nothing is over it or still to find.
  const over = !noBudget && summary.overBudget > 0;

  return (
    <>
      <section className="ja-sheet__part" aria-label="Budget and funding">
        {noBudget && summary.funded === 0 ? (
          <div className="ja-sheet__nobudget">
            <p>{noBudget}</p>
            {budgetAction}
          </div>
        ) : (
          <>
            <Figures>
              <Figure label="Budget" value={noBudget ? 'Not set' : money(summary.budget)}>
                {budgetAction && <div className="ja-sheet__figaction">{budgetAction}</div>}
              </Figure>
              <Figure label="From awarded grants" value={money(summary.awarded)} />
              <Figure label="If pending grants come in" value={money(summary.ifAwarded)} />
              {over ? (
                <Figure
                  label="More than the budget"
                  value={money(summary.overBudget)}
                  tone="over"
                />
              ) : (
                <Figure label="Still to find" value={noBudget ? '–' : money(summary.stillToFind)} />
              )}
            </Figures>
            <div className="ja-sheet__bar">
              <FundingBar
                parts={barParts(sources)}
                max={summary.budget}
                label={`${money(summary.funded)} funded of a ${money(summary.budget)} budget`}
              />
            </div>
          </>
        )}
        <p className="ja-sheet__when">{when}</p>
      </section>
      {panels.map(c => {
        const Panel = c.panel!;
        return (
          <section key={c.moduleId} className="ja-sheet__part">
            <Panel target={target} />
          </section>
        );
      })}
    </>
  );
}

function SheetCard({
  title,
  subtitle,
  archived,
  action,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  archived: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      title={
        <span className="ja-programs__title">
          {title}
          {archived && <ArchivedBadge />}
        </span>
      }
      subtitle={subtitle}
      action={action}
    >
      <div className="ja-sheet">{children}</div>
    </Card>
  );
}

/** Edit and Archive, or Restore on an archived record, for a role that may. */
function RecordActions({
  archived,
  onEdit,
  onArchive,
  onRestore,
}: {
  archived: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  if (archived) {
    return onRestore ? (
      <Button variant="secondary" size="sm" onClick={onRestore}>
        Restore
      </Button>
    ) : null;
  }
  if (!onEdit) return null;
  return (
    <span className="ja-actions">
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Icon name="pencil" size={15} />}
        onClick={onEdit}
      >
        Edit
      </Button>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Icon name="archive" size={15} />}
        onClick={onArchive}
      >
        Archive
      </Button>
    </span>
  );
}

/**
 * A program's sheet: its budget for the fiscal year and what pays for it, its
 * projects, and its name. Edit and Archive are for Admin and Director
 * ("Programs"); the budget and the projects for the roles with "Program
 * budgets and projects" Edit. A role without "Program budgets and projects"
 * sees the name only.
 *
 * Operations has the same sheet, with what it is in place of the name, and
 * no Edit or Archive: it is not a program and there is exactly one
 * (decision 0006).
 */
export function ProgramSheet({
  program,
  fy,
  showArchived,
  onEdit,
  onArchive,
  onRestore,
  onSetBudget,
  onAddProject,
}: {
  program: Program;
  fy: FiscalYear;
  showArchived: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onSetBudget?: () => void;
  onAddProject?: () => void;
}) {
  const { state, user } = useStore();
  const { search } = useLocation();
  const mayMoney = useCan()('program-budgets');
  const archived = isArchived(program);
  const budget = programBudget(state, program.id, fy.label);
  const target: FundingTarget = { kind: 'program', programId: program.id, fiscalYear: fy.label };
  const projects = projectsForProgram(state, program.id, showArchived);
  const office = isOperations(program.id);
  const kind = office ? "The office's running costs" : 'Program';

  return (
    <SheetCard
      title={program.name}
      subtitle={mayMoney ? `${kind} · ${fy.label}` : kind}
      archived={archived}
      action={
        office ? undefined : (
          <RecordActions
            archived={archived}
            onEdit={onEdit}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        )
      }
    >
      {mayMoney && (
        <FundingPart
          target={target}
          when={`${fy.label} runs ${dateRange(fy.start, fy.end)}.`}
          noBudget={
            budget === undefined
              ? onSetBudget
                ? `No budget for ${fy.label} yet. Set one to see what the grants cover and what's still to find.`
                : `No budget for ${fy.label} yet. Once one is set, this shows what the grants cover and what's still to find.`
              : undefined
          }
          budgetAction={
            onSetBudget && (
              <Button
                variant={budget === undefined ? 'secondary' : 'link'}
                size="sm"
                onClick={onSetBudget}
              >
                {budget === undefined ? 'Set budget' : 'Change budget'}
              </Button>
            )
          }
        />
      )}

      {mayMoney && (
        <section className="ja-sheet__part" aria-label={`Projects in ${program.name}`}>
          <FundingLabel>Projects in {program.name}</FundingLabel>
          {projects.length === 0 ? (
            <p className="ja-sheet__empty">
              {office
                ? 'No projects in Operations yet. A project is one-off work, like an office move or a new laptop, with its own dates and budget.'
                : 'No projects in this program yet. A project is one-off work, like a spring showcase or an instrument refresh, with its own dates and budget.'}
            </p>
          ) : (
            <ul className="ja-sheet__projects">
              {projects.map(p => {
                const { summary } = fundingOf(state, user.role, {
                  kind: 'project',
                  projectId: p.id,
                });
                return (
                  <li key={p.id}>
                    <span className="ja-sheet__pname">
                      <Link to={`/programs/projects/${p.id}${search}`}>{p.name}</Link>
                      {isArchived(p) && <ArchivedBadge />}
                    </span>
                    <span className="ja-sheet__muted">{dateRange(p.start, p.end)}</span>
                    <span className="ja-sheet__num">
                      {money(summary.funded)} of {money(summary.budget)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {onAddProject && !archived && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Icon name="plus" size={14} />}
                onClick={onAddProject}
              >
                Add a project
              </Button>
            </div>
          )}
        </section>
      )}

      {office ? (
        <section className="ja-sheet__part" aria-label="About Operations">
          {mayMoney && <FundingLabel>About Operations</FundingLabel>}
          <p className="ja-sheet__about">
            Operations is where money that isn't tied to one program goes: rent, salaries,
            insurance, the office. It isn't a program, so it keeps its name and can't be archived. A
            grant that names it counts every program's numbers on its Reports tab.
          </p>
        </section>
      ) : (
        <section className="ja-sheet__part" aria-label="Details">
          {mayMoney && <FundingLabel>Details</FundingLabel>}
          <div>
            <KV k="Name" v={program.name} />
            <KV k="Short name" v={program.short} />
          </div>
        </section>
      )}
    </SheetCard>
  );
}

/**
 * A project's sheet: its budget and what pays for it, across all its dates,
 * and its details. Edit, Archive and Restore are for the roles with "Program
 * budgets and projects" Edit.
 */
export function ProjectSheet({
  project,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: Project;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const { state } = useStore();
  const { search } = useLocation();
  const archived = isArchived(project);
  const years = fiscalYearsOverlapping(
    project.start,
    project.end,
    state.core.settings.fiscalYearStartMonth,
  ).map(y => y.label);
  const program = programName(state, project.programId);
  const programLink = <Link to={`/programs/${project.programId}${search}`}>{program}</Link>;

  return (
    <SheetCard
      title={project.name}
      subtitle={<>Project · part of {programLink}</>}
      archived={archived}
      action={
        <RecordActions
          archived={archived}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      }
    >
      <FundingPart
        target={{ kind: 'project', projectId: project.id }}
        when={`Runs ${dateRange(project.start, project.end)}, so it counts in ${joinWords(years)}.`}
      />
      <section className="ja-sheet__part" aria-label="Details">
        <FundingLabel>Details</FundingLabel>
        <div>
          <KV k="Name" v={project.name} />
          <KV k="Part of" v={programLink} />
          <KV k="Dates" v={dateRange(project.start, project.end)} />
          <KV k="Budget" v={money(project.budget)} />
        </div>
      </section>
    </SheetCard>
  );
}

/** "FY27", "FY27 and FY28", "FY26, FY27 and FY28". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
