import React from 'react';
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
} from '../../../design-system';
import { TableScroll } from '../../components/TableScroll';
import { ArchiveDialog, ArchivedName, ShowArchivedSwitch } from '../../components/archive';
import { useToast } from '../../ToastHost';
import {
  archivedOnly,
  isArchived,
  programProblem,
  programsList,
  useCan,
  useStore,
} from '../../../core';
import type { Program } from '../../../core';

interface ProgramDraft {
  id?: string;
  name: string;
  short: string;
}

/**
 * Settings' Programs card: every program with its short name, and for Admin
 * and Director (decision 0001, "Programs") Add program, Edit, Archive and
 * Restore. An archived program leaves the pickers; the grants, students,
 * ensembles and hours that name it keep its name.
 */
export default function ProgramsCard() {
  const { state, actions } = useStore();
  const mayEdit = useCan()('programs', 'edit');
  const toast = useToast();
  // Show archived on this card: its own, so local state, as on the staff list.
  const [showArchived, setShowArchived] = React.useState(false);
  const [draft, setDraft] = React.useState<ProgramDraft | null>(null);
  const [archiving, setArchiving] = React.useState<Program | null>(null);

  const rows = programsList(state, showArchived);
  const none = state.core.programs.length === 0;
  const add = () => setDraft({ name: '', short: '' });

  function restore(p: Program) {
    actions.core.restoreProgram(p.id);
    toast({
      tone: 'success',
      title: 'Program restored',
      message: `${p.name} is back in the pickers.`,
    });
  }

  return (
    <>
      <Card
        title="Programs"
        subtitle="What the money and the classes are for."
        padding="0"
        action={
          <ShowArchivedSwitch
            count={archivedOnly(state.core.programs).length}
            checked={showArchived}
            onChange={setShowArchived}
          />
        }
      >
        {none ? (
          <EmptyState
            style={{ padding: 'var(--space-6)' }}
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
                  onClick={add}
                >
                  Add program
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableScroll minWidth={520}>
              <DataTable
                rows={rows}
                emptyLabel="Every program is archived. Show archived lists them."
                columns={[
                  {
                    key: 'name',
                    label: 'Program',
                    strong: true,
                    render: (p: Program) => <ArchivedName name={p.name} record={p} />,
                  },
                  { key: 'short', label: 'Short name', width: '180px' },
                  ...(mayEdit
                    ? [
                        {
                          key: 'actions',
                          label: '',
                          width: '150px',
                          align: 'right' as const,
                          render: (p: Program) =>
                            isArchived(p) ? (
                              <a
                                href="#"
                                onClick={e => {
                                  e.preventDefault();
                                  restore(p);
                                }}
                              >
                                Restore
                              </a>
                            ) : (
                              <span className="ja-actions" style={{ justifyContent: 'flex-end' }}>
                                <a
                                  href="#"
                                  onClick={e => {
                                    e.preventDefault();
                                    setDraft({ id: p.id, name: p.name, short: p.short });
                                  }}
                                >
                                  Edit
                                </a>
                                <a
                                  href="#"
                                  onClick={e => {
                                    e.preventDefault();
                                    setArchiving(p);
                                  }}
                                >
                                  Archive
                                </a>
                              </span>
                            ),
                        },
                      ]
                    : []),
                ]}
              />
            </TableScroll>
            {mayEdit && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0 var(--space-4)',
                  background: 'var(--surface-sunken)',
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Icon name="plus" size={15} />}
                  onClick={add}
                >
                  Add program
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {draft && mayEdit && <ProgramDialog draft={draft} onClose={() => setDraft(null)} />}

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
          }}
          onClose={() => setArchiving(null)}
        />
      )}
    </>
  );
}

/** Add program or Edit program: the name, and the short name a tab or a narrow column uses. */
function ProgramDialog({ draft, onClose }: { draft: ProgramDraft; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [name, setName] = React.useState(draft.name);
  const [short, setShort] = React.useState(draft.short);
  const [showErrors, setShowErrors] = React.useState(false);

  const problem = programProblem(state.core.programs, { name, short }, draft.id);

  const save = () => {
    if (problem) {
      setShowErrors(true);
      return;
    }
    if (draft.id) {
      actions.core.updateProgram(draft.id, { name, short });
      toast({ tone: 'success', title: 'Program updated', message: name.trim() });
    } else {
      actions.core.addProgram({ name, short });
      toast({ tone: 'success', title: 'Program added', message: name.trim() });
    }
    onClose();
  };

  return (
    <Dialog
      open
      width={460}
      title={draft.id ? 'Edit program' : 'Add program'}
      description={
        draft.id
          ? 'Every grant, student and ensemble that names it shows the new name.'
          : 'What a grant, a student, an ensemble or an hour of teaching is for.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {draft.id ? 'Save program' : 'Add program'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Name" required error={showErrors ? problem : undefined}>
          <Input
            value={name}
            placeholder="Summer Jazz Camp"
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
        <Field
          label="Short name"
          hint="The word a tab or a narrow column uses. Left blank, it is the name."
        >
          <Input
            value={short}
            placeholder="Camp"
            onChange={e => setShort(e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
