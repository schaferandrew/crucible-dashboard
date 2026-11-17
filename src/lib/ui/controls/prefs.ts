// Per-viewer conveniences kept in localStorage. Every access is guarded: private windows and blocked storage
// just mean the choice isn't remembered.

const PROVISIONAL_KEY = 'crucible-provisional';

/** The reader's last "include provisional tasks" choice (B-13). Used only when the URL doesn't say. */
export function readProvisional(): boolean {
  try {
    return localStorage.getItem(PROVISIONAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeProvisional(on: boolean): void {
  try {
    localStorage.setItem(PROVISIONAL_KEY, on ? '1' : '0');
  } catch {
    /* not remembered */
  }
}
