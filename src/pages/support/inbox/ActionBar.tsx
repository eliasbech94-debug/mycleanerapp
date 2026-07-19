import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  allowedTransitions, PRIORITY_LABEL_DA, PRIORITY_ORDER,
  reasonRequired, STATUS_LABEL_DA,
} from "@/lib/support/labels";
import { AlertTriangle, ChevronDown, Tag as TagIcon, User } from "lucide-react";

interface Props {
  conversation: any;
  isAdmin: boolean;
  currentUserId: string;
}

async function invoke(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data;
}

export function ActionBar({ conversation, isAdmin, currentUserId }: Props) {
  const qc = useQueryClient();
  const convId: string = conversation.id;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["support", "conversations"] });
    qc.invalidateQueries({ queryKey: ["support", "counters"] });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
      <StatusMenu conversation={conversation} onDone={refresh} />
      <PriorityMenu conversation={conversation} onDone={refresh} />
      <AssignMenu
        conversation={conversation}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        onDone={refresh}
      />
      <TagsMenu conversationId={convId} onDone={refresh} />
    </div>
  );
}

/* ---------------- Status ---------------- */
function StatusMenu({ conversation, onDone }: { conversation: any; onDone: () => void }) {
  const from = String(conversation.status);
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const transitions = allowedTransitions(from);

  const submit = async (to: string, reasonValue?: string) => {
    setBusy(true);
    try {
      await invoke("conversation-update-status", {
        conversation_id: conversation.id,
        status: to,
        reason: reasonValue,
      });
      toast.success(`Status: ${STATUS_LABEL_DA[to] ?? to}`);
      setPending(null);
      setReason("");
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "Statusskift afvist");
    } finally {
      setBusy(false);
    }
  };

  const handleClick = (to: string) => {
    if (reasonRequired(from, to)) {
      setPending(to);
      setReason("");
    } else {
      submit(to);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            Status: {STATUS_LABEL_DA[from] ?? from}
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Skift status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {transitions.length === 0 && (
            <DropdownMenuItem disabled>Ingen tilgængelige</DropdownMenuItem>
          )}
          {transitions.map((to) => (
            <DropdownMenuItem key={to} onClick={() => handleClick(to)}>
              {STATUS_LABEL_DA[to] ?? to}
              {reasonRequired(from, to) && (
                <span className="ml-auto text-[10px] text-muted-foreground">Kræver årsag</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Skift status til {pending ? STATUS_LABEL_DA[pending] ?? pending : ""}
            </DialogTitle>
            <DialogDescription>
              Angiv en kort årsag. Denne noteres i sagens tidslinje.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Årsag…"
            rows={3}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Annuller</Button>
            <Button
              onClick={() => pending && submit(pending, reason.trim())}
              disabled={busy || reason.trim().length < 3}
            >
              Bekræft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Priority ---------------- */
function PriorityMenu({ conversation, onDone }: { conversation: any; onDone: () => void }) {
  const current = conversation.priority ?? "normal";
  const [busy, setBusy] = useState(false);
  const submit = async (priority: string) => {
    if (priority === current) return;
    setBusy(true);
    try {
      await invoke("conversation-update-priority", {
        conversation_id: conversation.id, priority,
      });
      toast.success(`Prioritet: ${PRIORITY_LABEL_DA[priority] ?? priority}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={busy}>
          {current === "urgent" && <AlertTriangle className="h-3.5 w-3.5 mr-1 text-destructive" />}
          Prioritet: {PRIORITY_LABEL_DA[current] ?? current}
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {PRIORITY_ORDER.map((p) => (
          <DropdownMenuItem key={p} onClick={() => submit(p)}>
            {PRIORITY_LABEL_DA[p]}
            {p === current && <span className="ml-auto text-[10px]">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------- Assign ---------------- */
interface Assignee { user_id: string; full_name: string; roles: string[]; }

function AssignMenu({
  conversation, isAdmin, currentUserId, onDone,
}: { conversation: any; isAdmin: boolean; currentUserId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const { data: assignees, isLoading } = useQuery({
    queryKey: ["support", "assignees"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("support-list-assignees", { method: "GET" });
      if (error) throw error;
      return ((data as { assignees?: Assignee[] })?.assignees ?? []) as Assignee[];
    },
    staleTime: 60_000,
  });
  const currentId: string | null = conversation.assigned_support_id ?? null;
  const currentName =
    currentId
      ? (assignees?.find((a) => a.user_id === currentId)?.full_name ?? currentId.slice(0, 8) + "…")
      : "Ingen";

  const submit = async (assignee_user_id: string | null) => {
    setBusy(true);
    try {
      await invoke("conversation-assign", {
        conversation_id: conversation.id, assignee_user_id,
      });
      toast.success(assignee_user_id ? "Tildelt" : "Fjernet tildeling");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={busy}>
          <User className="h-3.5 w-3.5 mr-1" />
          {currentName}
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Tildel til</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => submit(currentUserId)}>
          Mig
        </DropdownMenuItem>
        {currentId && (
          <DropdownMenuItem onClick={() => submit(null)}>
            Fjern tildeling
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {isLoading && <DropdownMenuItem disabled>Henter…</DropdownMenuItem>}
        {!isAdmin && (
          <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
            Kun admin kan tildele andre
          </DropdownMenuLabel>
        )}
        {isAdmin && (assignees ?? []).map((a) => (
          <DropdownMenuItem key={a.user_id} onClick={() => submit(a.user_id)}>
            {a.full_name}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {a.roles.includes("admin") || a.roles.includes("super_admin") ? "Admin" : "Support"}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------- Tags ---------------- */
interface Tag { id: string; slug: string; name: string; }

function TagsMenu({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: tags, isLoading } = useQuery({
    queryKey: ["support", "tags-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_tags")
        .select("id, slug, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: assigned = [] } = useQuery({
    queryKey: ["support", "tags-assigned", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_tag_assignments")
        .select("tag_id, conversation_tags(id, slug, name)")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.conversation_tags as Tag).filter(Boolean);
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`tags:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_tag_assignments", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["support", "tags-assigned", conversationId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  const toggle = async (tag: Tag, isOn: boolean) => {
    setBusy(true);
    try {
      await invoke("conversation-add-tag", {
        conversation_id: conversationId,
        tag_slug: tag.slug,
        remove: isOn,
      });
      qc.invalidateQueries({ queryKey: ["support", "tags-assigned", conversationId] });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isAssigned = (id: string) => assigned.some((a) => a.id === id);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {assigned.map((t) => (
        <Badge key={t.id} variant="secondary" className="text-[11px]">
          <TagIcon className="h-3 w-3 mr-1" />{t.name}
        </Badge>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2" disabled={busy}>
            <TagIcon className="h-3.5 w-3.5 mr-1" /> Tags
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Sagstags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading && <DropdownMenuItem disabled>Henter…</DropdownMenuItem>}
          {!isLoading && (tags ?? []).length === 0 && (
            <DropdownMenuItem disabled>Ingen tags i systemet</DropdownMenuItem>
          )}
          {(tags ?? []).map((t) => {
            const on = isAssigned(t.id);
            return (
              <DropdownMenuItem key={t.id} onClick={() => toggle(t, on)}>
                {t.name}
                <span className="ml-auto text-[11px]">{on ? "✓" : "+"}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
