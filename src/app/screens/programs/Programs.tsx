import React from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../Shell';
import {
  ArchiveDialog,
  ArchivedBadge,
  ShowArchivedSwitch,
  useArchivedParam,
} from '../../components/archive';
import { KV } from '../../components/badges';
import { useToast } from '../../ToastHost';
import { Button, Card, EmptyState, Icon } from '../../../design-system';
import {
  activeOnly,
  archivedOnly,
  isArchived,
  programsList,
  useCan,
  useStore,
} from '../../../core';
import type { Program } from '../../../core';
import { ProgramDialog } from './ProgramDialog';
import type { ProgramDraft } from './ProgramDialog';
import './programs.css';

/**
 * Operations › Programs: every program in a list that scrolls on its own, and
 * the selected program's sheet beside it. The URL names the selection
 * (`/programs/:id`), and `?archived=1` is Show archived. Add program, Edit,
 * Archive and Restore are for Admin and Director (decision 0001, "Programs");
 * everyone else reads.
 *
 * A core screen, since programs are core's noun. Later issues add the budget,
 * the projects and the grants that pay for it as more parts of the sheet.
 */
export default function Programs() {
  const { state, actions } = useStore();
  const mayEdit = useCan()('programs', 'edit');
  const { id } = useParams();
  const { search } = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const [showArchived, setShowArchived] = useArchivedParam();
  const [draft, setDraft] = React.useState<ProgramDraft | null>(null);
  const [archiving, setArchiving] = React.useState<Program | null>(null);

  const rows = programsList(state, showArchived);
  const current = activeOnly(state.core.programs).length;
  const archivedCount = archivedOnly(state.core.programs).length;
  // An archived program still opens from a link: it is history.
  const selected = state.core.programs.find(p => p.id === id);
  const select = (programId: string) => nav(`/programs/${programId}${search}`);

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

  // No program named, or one that is not here: the first on the list.
  if (!selected && rows.length > 0) {
    return <Navigate to={`/programs/${rows[0].id}${search}`} replace />;
  }

  return (
    <>
      <div className="ja-programs">
        <aside className="ja-programs__side" aria-label="Programs">
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
              {rows.map(p => (
                <li key={p.id}>
                  <Link
                    to={`/programs/${p.id}${search}`}
                    className="ja-programs__item"
                    aria-current={p.id === selected?.id ? 'page' : undefined}
                  >
                    <span className="ja-programs__name">{p.name}</span>
                    {isArchived(p) ? (
                      <ArchivedBadge />
                    ) : (
                      p.short !== p.name && <span className="ja-programs__short">{p.short}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {selected && (
          <Sheet
            program={selected}
            onEdit={
              mayEdit
                ? () => setDraft({ id: selected.id, name: selected.name, short: selected.short })
                : undefined
            }
            onArchive={mayEdit ? () => setArchiving(selected) : undefined}
            onRestore={mayEdit ? () => restore(selected) : undefined}
          />
        )}
      </div>
      {dialogs}
    </>
  );
}

/**
 * The selected program. Each part of it is a section of the one card, so the
 * budget, the projects and who pays for it can be added below the details.
 */
function Sheet({
  program,
  onEdit,
  onArchive,
  onRestore,
}: {
  program: Program;
  /** Unset for a role that may not change programs. */
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const archived = isArchived(program);
  return (
    <Card
      title={
        <span className="ja-programs__title">
          {program.name}
          {archived && <ArchivedBadge />}
        </span>
      }
      subtitle="Program"
      action={
        archived ? (
          onRestore && (
            <Button variant="secondary" size="sm" onClick={onRestore}>
              Restore
            </Button>
          )
        ) : onEdit ? (
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
        ) : undefined
      }
    >
      <section aria-label="Details">
        <KV k="Name" v={program.name} />
        <KV k="Short name" v={program.short} />
      </section>
    </Card>
  );
}
