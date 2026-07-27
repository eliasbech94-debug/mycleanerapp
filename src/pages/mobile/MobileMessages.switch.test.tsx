/**
 * Phase 5A — Focused conversation-switch + reconciliation tests.
 *
 * Exercises the REAL useConversationDetail hook + MobileConversationView
 * with a scriptable supabase client double so we can:
 *   - Delay conversation-a's fetch and resolve it after switching to B.
 *   - Track channel lifecycle (created / removed / scoped by conv id).
 *   - Fire realtime INSERTs deterministically to verify dedupe +
 *     optimistic reconciliation across two identical-body sends.
 *
 * These tests do NOT modify production behavior. They only assert the
 * observable guarantees users care about (no cross-conversation leak,
 * scoped teardown, dedupe-by-id, two distinct confirmed messages).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

// ---------- Scriptable supabase double ----------
type FakeChannel = {
  name: string;
  handlers: { evt: string; cfg: any; cb: (payload: any) => void }[];
  subscribed: boolean;
  removed: boolean;
  on: (evt: string, cfg: any, cb: (p: any) => void) => FakeChannel;
  subscribe: (cb?: (s: string) => void) => FakeChannel;
};

const state = {
  channels: [] as FakeChannel[],
  sendCalls: [] as any[],
  markReadCalls: [] as any[],
  // Pending conversation-get resolvers keyed by conversation id
  pendingGets: new Map<string, (v: any) => void>(),
  serverSeq: 0,
};

function makeChannel(name: string): FakeChannel {
  const ch: FakeChannel = {
    name,
    handlers: [],
    subscribed: false,
    removed: false,
    on(evt, cfg, cb) {
      this.handlers.push({ evt, cfg, cb });
      return this;
    },
    subscribe(cb) {
      this.subscribed = true;
      cb?.("SUBSCRIBED");
      return this;
    },
  };
  state.channels.push(ch);
  return ch;
}

function fireInsert(ch: FakeChannel, row: any) {
  for (const h of ch.handlers) {
    if (
      h.cfg?.event === "INSERT" &&
      h.cfg?.table === "messages"
    ) {
      h.cb({ new: row });
    }
  }
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn((path: string, opts?: any) => {
        if (typeof path === "string" && path.startsWith("conversation-get")) {
          const qs = path.split("?")[1] ?? "";
          const params = new URLSearchParams(qs);
          const id = params.get("id")!;
          return new Promise((resolve) => {
            state.pendingGets.set(id, resolve);
          });
        }
        if (path === "conversation-send-message") {
          state.sendCalls.push(opts?.body);
          state.serverSeq += 1;
          return Promise.resolve({
            data: {
              message: {
                id: `srv-${state.serverSeq}`,
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          });
        }
        if (path === "conversation-mark-read") {
          state.markReadCalls.push(opts?.body);
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    },
    channel: (name: string) => makeChannel(name),
    removeChannel: (c: FakeChannel) => {
      c.removed = true;
      return Promise.resolve("ok");
    },
    auth: { signOut: async () => ({ error: null }) },
  },
}));

const mockUser = { id: "user-1", email: "u@example.com" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, loading: false, profile: null }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => d ?? _k,
    i18n: { language: "en" },
  }),
}));

// Silence toast in the tested component
vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));

// The list hook is not exercised here, provide a stub so imports resolve.
vi.mock("@/hooks/useCustomerConversations", () => ({
  useCustomerConversations: () => ({
    conversations: [],
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));

import { MobileConversationView } from "./MobileMessages";
import { useConversationDetail } from "@/hooks/useConversationDetail";

// ---------- Harness ----------
function Navigator({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => {
    nav(to);
  }, [to, nav]);
  return null;
}

function renderConv(initial: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/inbox/:id" element={<MobileConversationView />} />
          <Route path="/inbox" element={<div data-testid="inbox-root" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return utils;
}

function resolveGet(id: string, payload: any) {
  const r = state.pendingGets.get(id);
  if (!r) throw new Error(`No pending get for ${id}`);
  state.pendingGets.delete(id);
  r({ data: payload, error: null });
}

function baseDetail(convId: string, subject: string, messages: any[] = []) {
  return {
    conversation: { id: convId, kind: "booking", subject, status: "open" },
    participants: [{ user_id: "user-1", role: "customer" }],
    tags: [],
    read: null,
    messages,
    events: [],
  };
}

beforeEach(() => {
  state.channels = [];
  state.sendCalls = [];
  state.markReadCalls = [];
  state.pendingGets.clear();
  state.serverSeq = 0;
});

// =====================================================================
// 1) Conversation-switch integrity
// =====================================================================
describe("Mobile conversation switch (A -> B while A is loading)", () => {
  it("scopes channels + data strictly to the active conversation", async () => {
    // Rerender container so we can navigate mid-flight.
    function Root({ target }: { target: string }) {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return (
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/inbox/conversation-a"]}>
            <Navigator to={target} />
            <Routes>
              <Route path="/inbox/:id" element={<MobileConversationView />} />
              <Route path="/inbox" element={<div data-testid="inbox-root" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    const { rerender, container } = render(<Root target="/inbox/conversation-a" />);

    // Wait for A's fetch to be initiated and A's channel to be created.
    await waitFor(() => expect(state.pendingGets.has("conversation-a")).toBe(true));
    await waitFor(() =>
      expect(state.channels.some((c) => c.name === "conv:conversation-a")).toBe(true),
    );
    const chanA = state.channels.find((c) => c.name === "conv:conversation-a")!;
    expect(chanA.subscribed).toBe(true);
    expect(chanA.removed).toBe(false);

    // Navigate to B BEFORE A's fetch resolves.
    rerender(<Root target="/inbox/conversation-b" />);

    // A's channel must be torn down; B's channel must be created and scoped to B.
    await waitFor(() => expect(chanA.removed).toBe(true));
    await waitFor(() =>
      expect(state.channels.some((c) => c.name === "conv:conversation-b")).toBe(true),
    );
    const chanB = state.channels.find((c) => c.name === "conv:conversation-b")!;
    expect(chanB.subscribed).toBe(true);
    expect(chanB.removed).toBe(false);
    // Filter is scoped to B only.
    const bMsgHandler = chanB.handlers.find(
      (h) => h.cfg?.event === "INSERT" && h.cfg?.table === "messages",
    )!;
    expect(bMsgHandler.cfg.filter).toBe("conversation_id=eq.conversation-b");

    // Resolve B first so the view has a stable state.
    resolveGet("conversation-b", baseDetail("conversation-b", "Rengøring B", [
      { id: "b-1", sender_user_id: "peer", sender_role: "customer", body: "Hej fra B",
        message_type: "text", is_internal_note: false, reply_to_message_id: null,
        edited_at: null, created_at: new Date().toISOString() },
    ]));

    await waitFor(() => expect(screen.getByText("Hej fra B")).toBeTruthy());

    // Now resolve A's delayed request AFTER B is active — must be a no-op.
    act(() => {
      resolveGet("conversation-a", baseDetail("conversation-a", "Kunde A hemmelighed", [
        { id: "a-1", sender_user_id: "peer", sender_role: "customer",
          body: "Kunde A privat besked", message_type: "text", is_internal_note: false,
          reply_to_message_id: null, edited_at: null,
          created_at: new Date().toISOString() },
      ]));
    });

    // A's title / messages MUST NOT appear in B.
    expect(screen.queryByText("Kunde A hemmelighed")).toBeNull();
    expect(screen.queryByText("Kunde A privat besked")).toBeNull();
    expect(screen.getByText("Rengøring B")).toBeTruthy();
    expect(screen.getByText("Hej fra B")).toBeTruthy();

    // Sending from B must always target conversation-b.
    const textarea = container.querySelector("#mobile-composer") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "sender fra B" } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => expect(state.sendCalls.length).toBe(1));
    expect(state.sendCalls[0]).toMatchObject({
      conversation_id: "conversation-b",
      body: "sender fra B",
    });

    // A stale realtime callback for A must never reach B: the removed
    // channel guarantees no delivery in production. Assert removal is
    // permanent even after B has been active for a while.
    expect(chanA.removed).toBe(true);
    // Firing a would-be-orphaned event against B's channel with B's id
    // must land, but any invocation via A is impossible because A has
    // no subscribers left (handlers are still attached to the removed
    // channel object but supabase.removeChannel severs delivery).
    fireInsert(chanB, {
      id: "b-2", conversation_id: "conversation-b", sender_user_id: "peer",
      sender_role: "customer", body: "Live besked B",
      message_type: "text", is_internal_note: false, reply_to_message_id: null,
      edited_at: null, created_at: new Date().toISOString(),
    });
    await waitFor(() => expect(screen.getByText("Live besked B")).toBeTruthy());
  });

  it("removes B's channel on unmount", async () => {
    const { unmount } = renderConv("/inbox/conversation-b");
    await waitFor(() => expect(state.pendingGets.has("conversation-b")).toBe(true));
    resolveGet("conversation-b", baseDetail("conversation-b", "B", []));
    const chanB = state.channels.find((c) => c.name === "conv:conversation-b")!;
    expect(chanB.removed).toBe(false);
    unmount();
    await waitFor(() => expect(chanB.removed).toBe(true));
  });
});

// =====================================================================
// 2) Optimistic reconciliation with identical bodies
// =====================================================================
describe("useConversationDetail — identical-body reconciliation", () => {
  function HookProbe({ id, expose }: { id: string; expose: (api: any) => void }) {
    const api = useConversationDetail(id);
    useEffect(() => {
      expose(api);
    });
    return null;
  }

  it("keeps two identical sends as distinct server-confirmed messages and dedupes duplicate delivery", async () => {
    let api: any = null;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HookProbe id="conv-x" expose={(a) => (api = a)} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(state.pendingGets.has("conv-x")).toBe(true));
    resolveGet("conv-x", baseDetail("conv-x", "X", []));
    await waitFor(() => expect(api.detail?.messages.length).toBe(0));
    const chan = state.channels.find((c) => c.name === "conv:conv-x")!;

    const now = Date.now();

    // Two optimistic sends with identical body, within reconcile window.
    act(() => {
      api.addOptimistic({
        tempId: "tmp-1", body: "på vej", is_internal_note: false,
        sender_user_id: "user-1", sender_role: "customer",
        created_at: new Date(now).toISOString(),
      });
      api.addOptimistic({
        tempId: "tmp-2", body: "på vej", is_internal_note: false,
        sender_user_id: "user-1", sender_role: "customer",
        created_at: new Date(now + 100).toISOString(),
      });
    });
    await waitFor(() => expect(api.detail?.messages.length).toBe(2));

    // Confirm both via server response (as `send()` would do).
    act(() => {
      api.confirmOptimistic("tmp-1", { id: "srv-A", created_at: new Date(now).toISOString() });
      api.confirmOptimistic("tmp-2", { id: "srv-B", created_at: new Date(now + 100).toISOString() });
    });

    let msgs = api.detail!.messages;
    expect(msgs.length).toBe(2);
    expect(msgs.map((m: any) => m.id).sort()).toEqual(["srv-A", "srv-B"]);
    expect(msgs.every((m: any) => !m._optimistic)).toBe(true);

    // Realtime redelivery of both server IDs must be deduped (no growth).
    act(() => {
      fireInsert(chan, {
        id: "srv-A", conversation_id: "conv-x", sender_user_id: "user-1",
        sender_role: "customer", body: "på vej", message_type: "text",
        is_internal_note: false, reply_to_message_id: null, edited_at: null,
        created_at: new Date(now).toISOString(),
      });
      fireInsert(chan, {
        id: "srv-B", conversation_id: "conv-x", sender_user_id: "user-1",
        sender_role: "customer", body: "på vej", message_type: "text",
        is_internal_note: false, reply_to_message_id: null, edited_at: null,
        created_at: new Date(now + 100).toISOString(),
      });
      // And a bonus duplicate of srv-A — still deduped.
      fireInsert(chan, {
        id: "srv-A", conversation_id: "conv-x", sender_user_id: "user-1",
        sender_role: "customer", body: "på vej", message_type: "text",
        is_internal_note: false, reply_to_message_id: null, edited_at: null,
        created_at: new Date(now).toISOString(),
      });
    });

    msgs = api.detail!.messages;
    expect(msgs.length).toBe(2);
    expect(msgs.map((m: any) => m.id).sort()).toEqual(["srv-A", "srv-B"]);
  });

  it("realtime arriving before confirmOptimistic reconciles per-optimistic (no wrong-slot swap loss)", async () => {
    let api: any = null;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HookProbe id="conv-y" expose={(a) => (api = a)} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(state.pendingGets.has("conv-y")).toBe(true));
    resolveGet("conv-y", baseDetail("conv-y", "Y", []));
    await waitFor(() => expect(api.detail).toBeTruthy());
    const chan = state.channels.find((c) => c.name === "conv:conv-y")!;

    const now = Date.now();
    act(() => {
      api.addOptimistic({
        tempId: "t1", body: "dup", is_internal_note: false,
        sender_user_id: "user-1", sender_role: "customer",
        created_at: new Date(now).toISOString(),
      });
      api.addOptimistic({
        tempId: "t2", body: "dup", is_internal_note: false,
        sender_user_id: "user-1", sender_role: "customer",
        created_at: new Date(now + 50).toISOString(),
      });
    });

    // Realtime for both server messages arrives BEFORE confirmOptimistic.
    act(() => {
      fireInsert(chan, {
        id: "srv-1", conversation_id: "conv-y", sender_user_id: "user-1",
        sender_role: "customer", body: "dup", message_type: "text",
        is_internal_note: false, reply_to_message_id: null, edited_at: null,
        created_at: new Date(now).toISOString(),
      });
      fireInsert(chan, {
        id: "srv-2", conversation_id: "conv-y", sender_user_id: "user-1",
        sender_role: "customer", body: "dup", message_type: "text",
        is_internal_note: false, reply_to_message_id: null, edited_at: null,
        created_at: new Date(now + 50).toISOString(),
      });
    });

    // Both optimistic slots reconciled to server messages with distinct ids.
    const msgs = api.detail!.messages;
    expect(msgs.length).toBe(2);
    expect(msgs.map((m: any) => m.id).sort()).toEqual(["srv-1", "srv-2"]);
    expect(msgs.every((m: any) => !m._optimistic)).toBe(true);

    // Late confirmOptimistic calls (server response finally arrives) must
    // be idempotent: the tempIds are gone, so nothing changes.
    act(() => {
      api.confirmOptimistic("t1", { id: "srv-1", created_at: new Date(now).toISOString() });
      api.confirmOptimistic("t2", { id: "srv-2", created_at: new Date(now + 50).toISOString() });
    });
    expect(api.detail!.messages.length).toBe(2);
  });
});
