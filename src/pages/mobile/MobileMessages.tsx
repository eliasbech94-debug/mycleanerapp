/**
 * MobileMessages — iOS-style inbox for customer/provider participants.
 *
 * Data model: reuses the existing `conversation-list` edge function
 * (participant-scoped, RLS-enforced). Sending/detail reuses
 * `useConversationDetail` and `conversation-send-message`.
 *
 * Rendered inside <MobileAppShell> at < 768px only via MobileInboxGate.
 * Desktop (>= 768px) is unaffected and redirects to /profil?tab=inbox.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, Inbox, Loader2, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCustomerConversations, type InboxConversationRow } from "@/hooks/useCustomerConversations";
import { useConversationDetail } from "@/hooks/useConversationDetail";
import { MobileAppShell } from "@/components/layout/MobileAppShell";
import { AiDisclosure } from "@/components/conversation/AiDisclosure";
import { HumanTakeoverNotice } from "@/components/conversation/HumanTakeoverNotice";
import { useHumanHandover } from "@/hooks/useHumanHandover";
import { isAiGenerated, isAutomatedSystemMessage } from "@/lib/conversations/senderType";
import { useCountryPath, loginPathWithRedirect } from "@/lib/countryPath";

function formatTimestamp(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function conversationTitle(row: InboxConversationRow, t: (k: string, o?: any) => string): string {
  if (row.subject && row.subject.trim()) return row.subject;
  if (row.kind === "support") return t("mobileMessages.supportTitle", "Support");
  return t("mobileMessages.defaultTitle", "Samtale");
}

function Avatar({ label }: { label: string }) {
  const initial = (label ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))]/12 text-sm font-semibold text-[hsl(var(--mkt-brand))]"
    >
      {initial}
    </div>
  );
}

export function MobileInboxList() {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const localize = useCountryPath();
  const { conversations, loading, error, refresh } = useCustomerConversations();

  return (
    <MobileAppShell appBar={{ title: t("mobileMessages.title", "Beskeder") }}>
      <div data-testid="mobile-messages" className="px-4 pt-2 pb-6">
        {loading ? (
          <ul aria-label={t("common.loading", "Indlæser")} className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3"
              >
                <div className="h-11 w-11 rounded-full bg-[hsl(var(--mkt-ink))]/6" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-[hsl(var(--mkt-ink))]/6" />
                  <div className="h-3 w-2/3 rounded bg-[hsl(var(--mkt-ink))]/6" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 text-center"
          >
            <AlertCircle className="h-6 w-6 text-[hsl(var(--mkt-brand))]" aria-hidden />
            <p className="text-sm text-[hsl(var(--mkt-ink))]">
              {t("mobileMessages.error", "Kunne ikke hente beskeder.")}
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              className="tap-target inline-flex min-h-[44px] items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 text-sm font-semibold text-white"
            >
              {t("mobileMessages.retry", "Prøv igen")}
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div
            data-testid="mobile-messages-empty"
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-8 text-center"
          >
            <Inbox className="h-6 w-6 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
            <p className="text-sm text-[hsl(var(--mkt-ink-muted))]">
              {t("mobileMessages.empty", "Ingen samtaler endnu. Book en Cleaner for at komme i gang.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {conversations.map((c) => {
              const title = conversationTitle(c, t);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/inbox/${c.id}`)}
                    className="tap-target flex w-full min-h-[64px] items-center gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-3 text-left active:bg-[hsl(var(--mkt-ink))]/4"
                  >
                    <Avatar label={title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[hsl(var(--mkt-ink))]">
                          {title}
                        </p>
                        <span className="text-[11px] text-[hsl(var(--mkt-ink-muted))]">
                          {formatTimestamp(c.last_message_at, i18n.language)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-[hsl(var(--mkt-ink-muted))]">
                        {c.status === "resolved" || c.status === "closed"
                          ? t("mobileMessages.statusClosed", "Afsluttet")
                          : t("mobileMessages.tapToOpen", "Tryk for at åbne")}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MobileAppShell>
  );
}

export function MobileConversationView() {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const {
    detail,
    loading,
    error,
    markRead,
    latestMessageId,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
  } = useConversationDetail(id ?? null);
  const { t: tAi } = useTranslation("ai");
  const { requestHuman, pending: handoverPending, result: handover } = useHumanHandover(id ?? null);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottom = useRef(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Track scroll position so we don't jerk the view when the user is reading older messages.
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const threshold = 80;
    wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (wasNearBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [detail?.messages.length]);

  useEffect(() => {
    if (latestMessageId) markRead(latestMessageId);
  }, [latestMessageId, markRead]);

  const send = useCallback(async () => {
    const text = value.trim();
    if (!text || sending || !id || !user) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addOptimistic({
      tempId,
      body: text,
      is_internal_note: false,
      sender_user_id: user.id,
      sender_role: "customer",
      created_at: new Date().toISOString(),
    });
    setValue("");
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "conversation-send-message",
        { body: { conversation_id: id, body: text } },
      );
      if (fnErr) throw fnErr;
      const real = (data as any)?.message;
      if (real?.id) {
        confirmOptimistic(tempId, { id: real.id, created_at: real.created_at });
      }
    } catch (e: any) {
      failOptimistic(tempId);
      toast.error(t("mobileMessages.sendFailed", "Kunne ikke sende besked"));
      setValue(text);
    } finally {
      setSending(false);
    }
  }, [value, sending, id, user, addOptimistic, confirmOptimistic, failOptimistic, t]);

  const title = useMemo(() => {
    if (!detail?.conversation) return t("mobileMessages.title", "Beskeder");
    const c = detail.conversation as any;
    if (c.subject) return c.subject as string;
    if (c.kind === "support") return t("mobileMessages.supportTitle", "Support");
    return t("mobileMessages.defaultTitle", "Samtale");
  }, [detail, t]);

  return (
    <MobileAppShell
      appBar={{
        title,
        onBack: () => navigate("/inbox"),
        backLabel: t("actions.back", "Tilbage"),
      }}
      contentClassName="flex flex-col"
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3"
        data-testid="mobile-conversation-scroller"
      >
        {loading ? (
          <div className="flex justify-center pt-8">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-[hsl(var(--mkt-border))] p-4 text-sm">
            {t("mobileMessages.error", "Kunne ikke hente beskeder.")}
          </div>
        ) : (
          <ul className="space-y-2">
            {(detail?.messages ?? []).map((m) => {
              const mine = m.sender_user_id === user?.id;
              // Labelling is driven by the persisted sender_type only.
              const ai = isAiGenerated(m);
              const automated = !ai && isAutomatedSystemMessage(m);
              const handedOver = !!(handover?.human_takeover_at ?? (detail?.conversation as any)?.human_takeover_at);
              return (
                <li
                  key={m.id}
                  data-sender-type={ai ? "ai_assistant" : automated ? "system" : undefined}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={
                      "max-w-[78%] min-w-0 rounded-2xl px-3 py-2 text-sm break-words " +
                      (mine
                        ? "bg-[hsl(var(--mkt-brand))] text-white"
                        : "bg-[hsl(var(--mkt-surface))] text-[hsl(var(--mkt-ink))] border border-[hsl(var(--mkt-border))]")
                    }
                  >
                    {automated ? (
                      <span className="mb-1 block text-[11px] font-semibold text-[hsl(var(--mkt-ink-muted))]">
                        {tAi("system.automated")}
                      </span>
                    ) : null}
                    {m.body ?? ""}
                    {m._failed ? (
                      <span className="ml-2 text-[11px] opacity-80">
                        {t("mobileMessages.failed", "Kunne ikke sendes")}
                      </span>
                    ) : null}
                    <span className={"ml-2 text-[10px] opacity-70"}>
                      {formatTimestamp(m.created_at, i18n.language)}
                    </span>
                    {ai ? (
                      <AiDisclosure
                        showAction={!handedOver}
                        pending={handoverPending}
                        onTalkToHuman={() => void requestHuman()}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
            {(handover?.human_takeover_at ?? (detail?.conversation as any)?.human_takeover_at) ? (
              <li>
                <HumanTakeoverNotice
                  firstName={handover?.agent_first_name ?? null}
                  expectedResponseMinutes={handover?.expected_response_minutes ?? null}
                />
              </li>
            ) : null}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="sticky bottom-0 border-t border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/95 px-3 py-2 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
      >
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="mobile-composer">
            {t("mobileMessages.composerLabel", "Skriv en besked")}
          </label>
          <textarea
            id="mobile-composer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("mobileMessages.placeholder", "Skriv en besked…")}
            rows={1}
            className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-2xl border border-[hsl(var(--mkt-border))] bg-white px-3 py-2 text-sm text-[hsl(var(--mkt-ink))] outline-none focus:border-[hsl(var(--mkt-brand))]"
          />
          <button
            type="submit"
            aria-label={t("mobileMessages.send", "Send")}
            disabled={!value.trim() || sending}
            className="tap-target flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </form>
    </MobileAppShell>
  );
}

export default function MobileMessages() {
  const { id } = useParams<{ id?: string }>();
  const { user, loading } = useAuth();
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <MobileAppShell appBar={{ title: t("mobileMessages.title", "Beskeder") }}>
        <div className="flex justify-center pt-10">
          <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
        </div>
      </MobileAppShell>
    );
  }
  if (!user) {
    return (
      <MobileAppShell appBar={{ title: t("mobileMessages.title", "Beskeder") }}>
        <div
          data-testid="mobile-messages-signedout"
          className="flex flex-col items-center gap-3 px-6 pt-12 text-center"
        >
          <MessageCircle className="h-8 w-8 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
          <p className="text-sm text-[hsl(var(--mkt-ink))]">
            {t("mobileMessages.signedOut", "Log ind for at se dine beskeder.")}
          </p>
          <a
            href={loginPathWithRedirect(localize, "/inbox")}
            className="tap-target inline-flex min-h-[44px] items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 text-sm font-semibold text-white"
          >
            {t("mobileMessages.signIn", "Log ind")}
          </a>
        </div>
      </MobileAppShell>
    );
  }
  return id ? <MobileConversationView /> : <MobileInboxList />;
}
