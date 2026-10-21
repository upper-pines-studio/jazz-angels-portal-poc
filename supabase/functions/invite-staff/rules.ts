/**
 * Who may invite whom (decision 0001, "Sign-ins are by invitation"): the refusal as the sentence
 * the person sees, or null when the invitation may go. No imports, so it reads the same here and
 * in a test.
 */

/** The roles with "Staff and roles" in decision 0001. */
export const STAFF_AND_ROLES = ['admin', 'director'];

export interface Caller {
  role: string;
}

export interface Invitee {
  name: string;
  role: string;
  email: string | null;
  archived_at: string | null;
}

export interface Refusal {
  /** 403 for who is asking, 404 for a record that is not there, 409 for the record as it is. */
  status: 403 | 404 | 409;
  error: string;
}

export function refusal(
  caller: Caller | null,
  invitee: Invitee | null,
  hasLogin: boolean,
): Refusal | null {
  if (!caller) {
    return {
      status: 403,
      error: "Your sign-in isn't tied to a current staff record, so you can't send invitations.",
    };
  }
  if (!STAFF_AND_ROLES.includes(caller.role)) {
    return {
      status: 403,
      error: 'Only an Admin or a Director sends invitations. Ask one of them to send it.',
    };
  }
  if (!invitee) {
    return { status: 404, error: 'That staff record is not there. Reload Settings and try again.' };
  }
  if (invitee.archived_at) {
    return {
      status: 409,
      error: `${invitee.name} is archived. Restore them before sending an invitation.`,
    };
  }
  if (!invitee.email) {
    return {
      status: 409,
      error: `${invitee.name} has no email yet. Add one with Edit, then send the invitation.`,
    };
  }
  if (hasLogin) {
    return { status: 409, error: `${invitee.name} already has a sign-in.` };
  }
  if (invitee.role === 'admin' && caller.role !== 'admin') {
    return {
      status: 403,
      error: `Only an Admin sends the invitation for an Admin's record. Ask an Admin to invite ${invitee.name}.`,
    };
  }
  return null;
}
