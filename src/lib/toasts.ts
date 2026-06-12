import { useSyncExternalStore } from 'react';

/* Estado de UI puro (no data del servidor, por eso no vive en el data
   service): una cola mínima de avisos efímeros. El data service hace
   pushToast cuando una acción falla de forma que el usuario debe ver
   (hoy: el 429 del rate limit) y App renderiza useToasts. */

export interface Toast {
  id: number;
  message: string;
}

const TOAST_TTL_MS = 6000;

let toasts: readonly Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function notify(): void {
  for (const listener of listeners) listener();
}

export function pushToast(message: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, TOAST_TTL_MS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
