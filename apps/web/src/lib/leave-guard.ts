'use client';

/**
 * Leaving a form with unsaved work: the open form registers a check here, and in-app navigation that does
 * not go through a link the form can see (Ctrl K, the Ask panel's record links) asks it first. Links and the browser's
 * Back are handled by `FormShell` itself.
 */
type Guard = () => Promise<boolean>;

let current: Guard | null = null;

/** Registers the open form's check; returns the function that removes it. */
export function setLeaveGuard(guard: Guard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Resolves true when it is fine to navigate away (no form open, nothing changed, or the user chose to leave). */
export function confirmLeave(): Promise<boolean> {
  return current ? current() : Promise.resolve(true);
}
