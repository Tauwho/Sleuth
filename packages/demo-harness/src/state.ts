import { z } from "zod";

/**
 * Demo state as an ordered log of the calls that changed something. Saving the log, not a
 * snapshot, means the app's own store code rebuilds the state on load: replay each entry with the
 * clock set to its recorded time, and the same ids and timestamps come back.
 */
export type LogEntry =
  | { kind: "call"; at: number; method: string; path: string; body?: unknown }
  | { kind: "event"; at: number; name: string; data: Record<string, string> };

const LogEntrySchema: z.ZodType<LogEntry> = z.union([
  z.object({
    kind: z.literal("call"),
    at: z.number(),
    method: z.string(),
    path: z.string(),
    body: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("event"),
    at: z.number(),
    name: z.string(),
    data: z.record(z.string(), z.string()),
  }),
]) as z.ZodType<LogEntry>;

export type DemoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface EventLog {
  /** The saved entries, or [] for a missing, broken or foreign value. */
  read(): LogEntry[];
  save(entries: readonly LogEntry[]): void;
  clear(): void;
}

/** A log kept under `key` in `storage`. Null storage keeps nothing (tests, blocked storage). */
export function createEventLog(storage: DemoStorage | null, key: string): EventLog {
  return {
    read() {
      if (!storage) return [];
      try {
        const raw = storage.getItem(key);
        if (!raw) return [];
        const parsed = z.array(LogEntrySchema).safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : [];
      } catch {
        return [];
      }
    },
    save(entries) {
      if (!storage) return;
      try {
        storage.setItem(key, JSON.stringify(entries));
      } catch {
        // Storage full or blocked: the demo keeps working in memory for this page.
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to clear.
      }
    },
  };
}

/** Runs tasks one at a time, in order. A failed task does not block the next one. */
export function createSerialQueue(first: Promise<unknown> = Promise.resolve()) {
  let queue: Promise<unknown> = first;
  return function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };
}

/** This tab's sessionStorage, or null where it is blocked (some private modes). */
export function tabStorage(): DemoStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
