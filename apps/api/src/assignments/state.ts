import { AssignmentStatus } from '@prisma/client';
import { fail } from '../common/errors';
import { Tx } from '../common/prisma.service';

// Allowed assignment state transitions (FR-ASG-01).
const ALLOWED: Record<AssignmentStatus, AssignmentStatus[]> = {
  REQUESTED: ['OPEN', 'CANCELLED'],
  OPEN: ['AGREED', 'CANCELLED'],
  AGREED: ['FUNDED', 'CANCELLED'],
  FUNDED: ['DELIVERED', 'DISPUTED', 'CANCELLED', 'ACCEPTED'],
  DELIVERED: ['ACCEPTED', 'DISPUTED', 'FUNDED'], // FUNDED again while a revision or next milestone is in progress
  DISPUTED: ['FUNDED', 'DELIVERED', 'ACCEPTED', 'CLOSED', 'CANCELLED'],
  ACCEPTED: ['CLOSED', 'FUNDED'],
  CLOSED: [],
  CANCELLED: [],
};

export async function transition(
  tx: Tx,
  assignment: { id: string; status: AssignmentStatus },
  to: AssignmentStatus,
  actorId: string | null,
  note?: string,
  extra: Record<string, unknown> = {},
) {
  if (assignment.status === to) return;
  if (!ALLOWED[assignment.status].includes(to)) {
    throw fail.conflict('INVALID_STATE', `This assignment cannot move from ${assignment.status} to ${to}.`);
  }
  // Optimistic check so two requests cannot both move the same assignment.
  const res = await tx.assignment.updateMany({ where: { id: assignment.id, status: assignment.status }, data: { status: to, ...extra } });
  if (res.count !== 1) throw fail.conflict('STATE_CHANGED', 'This assignment was just updated by someone else. Refresh and try again.');
  await tx.assignmentEvent.create({ data: { assignmentId: assignment.id, fromStatus: assignment.status, toStatus: to, actorId, note } });
  assignment.status = to;
}
