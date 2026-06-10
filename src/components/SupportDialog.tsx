import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LifeBuoy, Loader2, MessageCircle, Plus, Send, ShieldAlert, Trash2, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Thread = {
  id: string;
  topic: "support" | "complaint";
  subject: string;
  status: "open" | "escalated" | "closed";
  last_message_at: string;
  created_at: string;
};

type DBMessage = {
  id: string;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  parts: any;
  created_at: string;
};

export default function SupportDialog({
  mode,
  onClose,
}: {
  mode: "support" | "complaint";
  onClose: () => void;
}) {
  const isComplaint = mode === "complaint";
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { user } = useAuth();

  const loadThreads = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("support_threads")
      .select("id, topic, subject, status, last_message_at, created_at")
      .eq("topic", mode)
      .order("last_message_at", { ascending: false });
    if (error) toast.error("Kunne ikke hente samtaler");
    setThreads((data ?? []) as Thread[]);
    setLoadingList(false);
  };

  useEffect(() => {
    if (user) loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mode]);

  const startNewThread = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, topic: mode, subject: "Ny henvendelse" })
      .select("id, topic, subject, status, last_message_at, created_at")
      .single();
    if (error || !data) {
      toast.error("Kunne ikke oprette samtale");
      return;
    }
    setThreads((p) => [data as Thread, ...p]);
    setActiveId(data.id);
  };

  const deleteThread = async (id: string) => {
    if (!confirm("Slet denne samtale permanent?")) return;
    const { error } = await supabase.from("support_threads").delete().eq("id", id);
    if (error) return toast.error("Kunne ikke slette");
    setThreads((p) => p.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      style={{ background: `${C.ink}aa` }}
      onClick={onClose}
    >
      <div
        className="flex h-[min(640px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: C.cream, color: C.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: `${C.ink}1f` }}>
          <div className="flex items-center gap-2">
            {active && (
              <button
                onClick={() => setActiveId(null)}
                className="grid h-8 w-8 place-items-center rounded-lg"
                style={{ background: `${C.ink}11` }}
                aria-label="Tilbage"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span
              className="grid h-9 w-9 place-items-center rounded-lg"
              style={{
                background: isComplaint ? `${C.orange}22` : `${C.teal}22`,
                color: isComplaint ? C.orange : C.teal,
              }}
            >
              {isComplaint ? <ShieldAlert className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />}
            </span>
            <div>
              <h3 className="font-display text-xl leading-tight">
                {isComplaint ? "Klager" : "Hjælp & support"}
              </h3>
              {active && (
                <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">
                  {active.status === "escalated"
                    ? "Eskaleret til medarbejder"
                    : active.status === "closed"
                    ? "Lukket"
                    : "AI-assistent · skriv eskaler for menneske"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: `${C.ink}11` }}
            aria-label="Luk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {!active ? (
          <ThreadList
            threads={threads}
            loading={loadingList}
            isComplaint={isComplaint}
            onPick={(id) => setActiveId(id)}
            onNew={startNewThread}
            onDelete={deleteThread}
          />
        ) : (
          <ChatPane
            key={active.id}
            thread={active}
            onSubjectChange={(s) =>
              setThreads((p) => p.map((t) => (t.id === active.id ? { ...t, subject: s } : t)))
            }
            onStatusChange={(s) =>
              setThreads((p) => p.map((t) => (t.id === active.id ? { ...t, status: s } : t)))
            }
          />
        )}
      </div>
    </div>
  );
}

function ThreadList({
  threads,
  loading,
  isComplaint,
  onPick,
  onNew,
  onDelete,
}: {
  threads: Thread[];
  loading: boolean;
  isComplaint: boolean;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-5 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">
          Dine {isComplaint ? "klager" : "samtaler"}
        </p>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em]"
          style={{ background: C.ink, color: C.cream }}
        >
          <Plus className="h-3.5 w-3.5" /> Ny
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="grid place-items-center py-10 opacity-60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm opacity-70">
              Ingen {isComplaint ? "klager" : "samtaler"} endnu.
            </p>
            <button
              onClick={onNew}
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold uppercase tracking-[0.14em]"
              style={{ background: C.orange, color: "#fff" }}
            >
              <MessageCircle className="h-4 w-4" /> Start ny chat
            </button>
          </div>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              className="group flex items-center gap-2 rounded-xl px-2"
              style={{ background: "transparent" }}
            >
              <button
                onClick={() => onPick(t.id)}
                className="flex flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-black/5"
              >
                <span
                  className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg"
                  style={{ background: `${C.teal}1a`, color: C.teal }}
                >
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="flex-1 overflow-hidden">
                  <span className="block truncate text-sm font-bold">{t.subject}</span>
                  <span className="block text-[11px] opacity-60">
                    {new Date(t.last_message_at).toLocaleString("da-DK", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {t.status === "escalated" && (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-black uppercase" style={{ background: C.orange, color: "#fff" }}>
                        Eskaleret
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                onClick={() => onDelete(t.id)}
                className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                aria-label="Slet"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChatPane({
  thread,
  onSubjectChange,
  onStatusChange,
}: {
  thread: Thread;
  onSubjectChange: (s: string) => void;
  onStatusChange: (s: Thread["status"]) => void;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load historic messages
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("id, role, content, parts, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });
      const msgs: UIMessage[] = ((data ?? []) as DBMessage[])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts:
            Array.isArray(m.parts) && m.parts.length > 0
              ? m.parts
              : [{ type: "text" as const, text: m.content }],
        }));
      setInitialMessages(msgs);
    })();
  }, [thread.id]);

  const transport = useMemo(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`;
    return new DefaultChatTransport({
      api: url,
      headers: () => ({
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      }),
      body: { threadId: thread.id, topic: thread.topic },
      credentials: "omit",
      fetch: async (input, init) => {
        const session = (await supabase.auth.getSession()).data.session;
        const headers = new Headers(init?.headers);
        if (session?.access_token) {
          headers.set("Authorization", `Bearer ${session.access_token}`);
        }
        return fetch(input, { ...init, headers });
      },
    });
  }, [thread.id, thread.topic]);

  const { messages, sendMessage, status, error } = useChat({
    id: thread.id,
    messages: initialMessages ?? [],
    transport,
    onError: (e) => toast.error(e.message || "Chat fejlede"),
    onFinish: () => {
      // Detect escalation tool result
      // refresh status from DB after assistant turn
      supabase
        .from("support_threads")
        .select("status, subject")
        .eq("id", thread.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.status) onStatusChange(data.status as Thread["status"]);
          if (data?.subject) onSubjectChange(data.subject);
        });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id, status]);

  const isLoading = status === "submitted" || status === "streaming";

  const submit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  if (!initialMessages) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm opacity-70" style={{ borderColor: `${C.ink}22` }}>
            Skriv din besked nedenfor. AI-assistenten svarer med det samme — og kan eskalere til en medarbejder hvis nødvendigt.
          </div>
        )}
        {messages.map((m) => {
          const text = (m.parts ?? [])
            .map((p: any) => (p.type === "text" ? p.text : ""))
            .join("");
          const escalated = (m.parts ?? []).some(
            (p: any) => p.type === "tool-escalate_to_human" && p.state === "output-available",
          );
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={isUser ? "flex justify-end" : ""}>
              <div
                className={isUser ? "max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm" : "max-w-[95%]"}
                style={
                  isUser
                    ? { background: C.ink, color: C.cream }
                    : { color: C.ink }
                }
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{text}</p>
                ) : (
                  <div className="prose prose-sm max-w-none text-[14px] [&>p]:my-1 [&>ul]:my-1">
                    <ReactMarkdown>{text || (isLoading ? "…" : "")}</ReactMarkdown>
                    {escalated && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em]" style={{ background: C.orange, color: "#fff" }}>
                        <ShieldAlert className="h-3.5 w-3.5" /> Sendt videre til medarbejder
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {status === "submitted" && (
          <div className="text-sm opacity-60">AI tænker …</div>
        )}
        {error && <div className="text-sm text-red-600">{error.message}</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t px-4 py-3"
        style={{ borderColor: `${C.ink}1f`, background: "#fff" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Skriv en besked …"
          rows={1}
          className="flex-1 resize-none rounded-xl border-2 px-3 py-2 text-sm outline-none focus:border-current"
          style={{ borderColor: `${C.ink}22`, background: "#fff", color: C.ink, maxHeight: 120 }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl disabled:opacity-40"
          style={{ background: C.orange, color: "#fff" }}
          aria-label="Send"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
