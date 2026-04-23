export interface TestLockFields {
  locked_by_user_id: string | null;
  lock_expires_at: string | null;
}

export function isLockActive(t: TestLockFields): boolean {
  if (!t.locked_by_user_id) return false;
  if (t.lock_expires_at) {
    return new Date(t.lock_expires_at) > new Date();
  }
  return true;
}

export function isLockedByOther(t: TestLockFields, actorUserId: string): boolean {
  return isLockActive(t) && t.locked_by_user_id !== actorUserId;
}
