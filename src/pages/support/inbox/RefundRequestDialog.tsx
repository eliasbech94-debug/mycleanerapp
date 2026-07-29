import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Banknote, Loader2 } from "lucide-react";

interface Props {
  conversation: { id: string; booking_id?: string | null };
}

interface RefundRow {
  id: string;
  booking_id: string | null;
  requested_amount: number;
  currency: string;
  status: string;
  reason: string;
  created_at: string;
  decided_at: string | null;
}

const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: "Afventer admin",
  approved: "Godkendt",
  rejected: "Afvist",
  executed: "Udført",
  cancelled: "Annulleret",
};

/**
 * Refund request panel. Support agents can only REQUEST refunds —
 * approval and execution stay with admin (backend enforced by RLS
 * `refund_v2_update_admin`).
 */
export function RefundRequestDialog({ conversation }: Props) {
  const qc = useQueryClient();
  const convId = conversation.id;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("DKK");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: refunds, isLoading } = useQuery({
    queryKey: ["support", "refund-requests", convId],
    queryFn: async (): Promise<RefundRow[]> => {
      const { data, error } = await supabase.functions.invoke(
        `support-list-refund-requests?conversation_id=${convId}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { refund_requests?: RefundRow[] })?.refund_requests ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const submit = async () => {
    // Early Access: block before any refund network call.
    if (guardFinancialAction(() => setLockOpen(true))) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Beløbet skal være større end 0.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("conversation-request-refund", {
        body: {
          conversation_id: convId,
          booking_id: conversation.booking_id ?? null,
          requested_amount: cents,
          currency: currency.trim().toUpperCase(),
          reason: reason.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      toast.success("Refunderings-anmodning oprettet. Admin gennemgår den.");
      setAmount(""); setReason("");
      qc.invalidateQueries({ queryKey: ["support", "refund-requests", convId] });
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke oprette anmodning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Banknote className="h-3.5 w-3.5 mr-1" />
          Refundering
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Anmod om refundering</DialogTitle>
          <DialogDescription>
            Support opretter kun en anmodning. Admin gennemgår og udfører den
            faktiske refundering via Stripe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="rf-amount">Beløb</Label>
            <Input
              id="rf-amount" type="number" step="0.01" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rf-currency">Valuta</Label>
            <Input
              id="rf-currency" maxLength={3} value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rf-reason">Årsag <span className="text-destructive">*</span></Label>
          <Textarea
            id="rf-reason" rows={3} maxLength={1000}
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Fx. Provider mødte ikke op, kundeklage godkendt af QA."
          />
        </div>

        <div className="border-t pt-3">
          <h4 className="text-sm font-medium mb-2">Tidligere anmodninger</h4>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Henter…
            </div>
          ) : (refunds?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">Ingen anmodninger endnu.</p>
          ) : (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto text-sm">
              {refunds!.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="tabular-nums">
                      {(r.requested_amount / 100).toFixed(2)} {r.currency}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={r.reason}>
                      {r.reason}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {REFUND_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Luk
          </Button>
          <Button onClick={submit} disabled={busy || reason.trim().length < 3 || !amount}>
            {busy ? "Sender…" : "Opret anmodning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
