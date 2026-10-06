import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Icon } from '../../design-system';
import { ROLE_LABELS, useStore } from '../../core';
import { usePageHeader } from '../Shell';

/**
 * What a route shows to a role that may not open it (decision 0001). The URL
 * stays as it was, so the person can see what they asked for and why not.
 */
export default function NoAccess() {
  const nav = useNavigate();
  const { user } = useStore();
  usePageHeader({ title: 'No access' });

  return (
    <Card>
      <EmptyState
        icon={<Icon name="lock" size={22} />}
        title="You do not have access to this"
        message={`This page is not part of the ${ROLE_LABELS[user.role]} role. If you need it for your work, ask whoever runs the portal to change your role in Settings.`}
        action={
          <Button variant="primary" size="sm" onClick={() => nav('/')}>
            Back to the dashboard
          </Button>
        }
      />
    </Card>
  );
}
