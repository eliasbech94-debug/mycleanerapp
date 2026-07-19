// In-memory per-conversation draft store for the Support composer.
// - Never persisted to localStorage — see requirements: no signed URLs in local storage,
//   and drafts should never bleed across conversations. Memory-only satisfies both.
// - Separate slots for Reply vs Internal note.
export type ComposerMode = "reply" | "note";

interface DraftBucket {
  reply: string;
  note: string;
}

const store = new Map<string, DraftBucket>();
type Listener = () => void;
const listeners = new Set<Listener>();

function get(id: string): DraftBucket {
  return store.get(id) ?? { reply: "", note: "" };
}

export function getDraft(conversationId: string, mode: ComposerMode): string {
  return get(conversationId)[mode];
}

export function setDraft(conversationId: string, mode: ComposerMode, value: string): void {
  const b = { ...get(conversationId), [mode]: value } as DraftBucket;
  if (!b.reply && !b.note) store.delete(conversationId);
  else store.set(conversationId, b);
  listeners.forEach((l) => l());
}

export function clearDraft(conversationId: string, mode?: ComposerMode): void {
  if (!mode) {
    store.delete(conversationId);
  } else {
    const b = { ...get(conversationId), [mode]: "" } as DraftBucket;
    if (!b.reply && !b.note) store.delete(conversationId);
    else store.set(conversationId, b);
  }
  listeners.forEach((l) => l());
}

export function hasAnyDraft(conversationId: string): boolean {
  const b = store.get(conversationId);
  return !!(b && (b.reply.trim() || b.note.trim()));
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Test-only reset. */
export function __resetDrafts(): void {
  store.clear();
}
