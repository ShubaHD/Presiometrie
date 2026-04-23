const LS_NAME = "roca_lab_user";
const LS_ID = "roca_lab_user_id";

export function getLabUserFromStorage(): { userId: string; displayName: string } {
  if (typeof window === "undefined") {
    return { userId: "ssr", displayName: "—" };
  }
  const displayName =
    window.localStorage.getItem(LS_NAME)?.trim() ||
    process.env.NEXT_PUBLIC_ROCA_USER?.trim() ||
    "Laborator";
  let userId = window.localStorage.getItem(LS_ID)?.trim() || "";
  if (!userId) {
    userId = process.env.NEXT_PUBLIC_ROCA_USER_ID?.trim() || displayName;
  }
  return { userId, displayName };
}

export function setLabUserInStorage(displayName: string, userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_NAME, displayName.trim());
  window.localStorage.setItem(LS_ID, userId.trim());
}

export function labUserFetchHeaders(): HeadersInit {
  const { userId, displayName } = getLabUserFromStorage();
  return {
    "x-roca-user-id": userId,
    "x-roca-user": displayName,
  };
}

export function jsonLabHeaders(): HeadersInit {
  return { ...labUserFetchHeaders(), "Content-Type": "application/json" };
}
