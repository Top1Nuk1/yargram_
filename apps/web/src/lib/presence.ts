import type { User } from '../types';

export interface PresencePayload {
  userId: string;
  online?: boolean;
  isOnline?: boolean;
  lastSeenAt?: User['lastSeenAt'];
  lastSeenStatus?: User['lastSeenStatus'];
}

// Explicit null revokes previously visible precision. Approximate server statuses
// also revoke precision, including when an older payload omits lastSeenAt.
export function mergeUserProfile<T extends Partial<User>>(previous: T, update: Partial<User>): T {
  const next = { ...previous, ...update };
  if (update.lastSeenStatus || update.showLastSeen === false) {
    next.lastSeenAt = null;
    next.online = false;
    next.isOnline = false;
  } else if (update.lastSeenAt !== undefined && update.lastSeenStatus === undefined) {
    next.lastSeenStatus = null;
  }
  return next;
}

export function updateUserPresence(user: User, payload: PresencePayload): User {
  if (user.id !== payload.userId) return user;
  const update: Partial<User> = {};
  if (payload.isOnline !== undefined || payload.online !== undefined) {
    update.online = update.isOnline = payload.isOnline ?? payload.online;
  }
  if (payload.lastSeenAt !== undefined) update.lastSeenAt = payload.lastSeenAt;
  if (payload.lastSeenStatus !== undefined) update.lastSeenStatus = payload.lastSeenStatus;
  return mergeUserProfile(user, update);
}
