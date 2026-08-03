import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mycleaner.mission.pinned";
const MAX_PINNED = 8;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Pinned Mission Control pages, persisted per browser. */
export function usePinnedPages() {
  const [pinned, setPinned] = useState<string[]>(read);

  useEffect(() => {
    setPinned(read());
  }, []);

  const persist = useCallback((next: string[]) => {
    setPinned(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — pins simply do not persist */
    }
  }, []);

  const toggle = useCallback(
    (url: string) => {
      persist(
        pinned.includes(url)
          ? pinned.filter((u) => u !== url)
          : [...pinned, url].slice(-MAX_PINNED),
      );
    },
    [pinned, persist],
  );

  const isPinned = useCallback((url: string) => pinned.includes(url), [pinned]);

  return { pinned, toggle, isPinned };
}
