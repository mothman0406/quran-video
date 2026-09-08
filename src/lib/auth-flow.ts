export type AuthContinuation = "export";
export const ACCOUNT_PLANS = ["free", "pro", "premium"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

export const AUTH_CONTINUATION_STORAGE_KEY = "quran-video.auth-continuation";
export const AUTH_RESUME_PROJECT_STORAGE_KEY = "quran-video.auth-resume-project";

export type AuthIntent =
  | { kind: "open-export-settings" }
  | { kind: "authenticate"; continuation: AuthContinuation };

export function exportAuthIntent(authenticated: boolean): AuthIntent {
  return authenticated
    ? { kind: "open-export-settings" }
    : { kind: "authenticate", continuation: "export" };
}

/** Billing is intentionally not consulted during the authentication milestone. */
export function accountPlanForAuthenticatedUser(): AccountPlan {
  return "free";
}

/** OAuth and email links may only return to public, first-party editor routes. */
export function safeAuthReturnPath(value: string | null | undefined): "/" | "/editor" {
  return value === "/" ? "/" : "/editor";
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserSessionStorage(): SessionStorageLike | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function rememberAuthContinuation(continuation: AuthContinuation, storage = browserSessionStorage()): void {
  storage?.setItem(AUTH_CONTINUATION_STORAGE_KEY, continuation);
}

export function takeAuthContinuation(storage = browserSessionStorage()): AuthContinuation | null {
  const value = storage?.getItem(AUTH_CONTINUATION_STORAGE_KEY);
  storage?.removeItem(AUTH_CONTINUATION_STORAGE_KEY);
  return value === "export" ? value : null;
}

export function rememberAuthResumeProject(id: string, storage = browserSessionStorage()): void {
  storage?.setItem(AUTH_RESUME_PROJECT_STORAGE_KEY, id);
}

export function takeAuthResumeProject(storage = browserSessionStorage()): string | null {
  const id = storage?.getItem(AUTH_RESUME_PROJECT_STORAGE_KEY) ?? null;
  storage?.removeItem(AUTH_RESUME_PROJECT_STORAGE_KEY);
  return id && id.length <= 200 ? id : null;
}
