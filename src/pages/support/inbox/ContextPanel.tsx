import { format } from "date-fns";
import { da } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ConversationDetail } from "@/hooks/useConversationDetail";

async function invoke<T>(fn: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params);
  const { data, error } = await supabase.functions.invoke(`${fn}?${q}`, { method: "GET" });
  if (error) throw error;
  return data as T;
}

interface CustomerFields {
  full_name?: string | null;
  phone?: string | null;
  country_code?: string | null;
  open_cases?: number | null;
}
type CustomerSummary = CustomerFields & { customer?: CustomerFields | null };

interface ProviderFields {
  full_name?: string | null;
  country_code?: string | null;
  stripe_ready?: boolean | null;
  disputes?: number | null;
}
type ProviderSummary = ProviderFields & { provider?: ProviderFields | null };

interface BookingFields {
  booking_date?: string | null;
  status?: string | null;
  customer_pays?: number | null;
  currency?: string | null;
  address_masked?: string | null;
  address?: string | null;
}
type BookingSummary = BookingFields & { booking?: BookingFields | null };

function useCustomerSummary(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["support", "ctx-customer", id],
    queryFn: () => invoke<CustomerSummary>("support-customer-summary", { user_id: id! }),
    staleTime: 30_000,
  });
}
function useProviderSummary(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["support", "ctx-provider", id],
    queryFn: () => invoke<ProviderSummary>("support-provider-summary", { provider_id: id! }),
    staleTime: 30_000,
  });
}
function useBookingSummary(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["support", "ctx-booking", id],
    queryFn: () => invoke<BookingSummary>("support-booking-summary", { booking_id: id! }),
    staleTime: 30_000,
  });
}

interface Props { detail: ConversationDetail | null; }

export function ContextPanel({ detail }: Props) {
  const conv = detail?.conversation;
  const customer = useCustomerSummary(conv?.customer_user_id ?? null);
  const provider = useProviderSummary(conv?.provider_user_id ?? null);
  const booking = useBookingSummary(conv?.booking_id ?? null);

  if (!detail) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Vælg en samtale for at se kontekst.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto">
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Samtale</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-1 text-sm">
          <Row label="Type" value={conv.kind} />
          <Row label="Status" value={conv.status} />
          <Row label="Prioritet" value={conv.priority ?? "—"} />
          <Row label="Tildelt" value={conv.assigned_support_id ? conv.assigned_support_id.slice(0, 8) + "…" : "Ingen"} />
          {conv.country_code && <Row label="Land" value={conv.country_code} />}
          {conv.tags?.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-1">
              {detail.tags.map((t) => (
                <Badge key={t.tag_id} variant="secondary" className="text-[10px]">
                  {t.conversation_tags?.name ?? t.conversation_tags?.slug}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {conv.customer_user_id && (
        <ContextCard title="Kunde" loading={customer.isLoading} error={customer.error as Error | null}>
          {(() => {
            const c = customer.data?.customer ?? customer.data ?? {};
            return (
              <>
                <Row label="Navn" value={c.full_name ?? "—"} />
                <Row label="Telefon" value={c.phone ?? "—"} />
                <Row label="Land" value={c.country_code ?? "—"} />
                <Row label="Åbne sager" value={String(c.open_cases ?? customer.data?.open_cases ?? 0)} />
              </>
            );
          })()}
        </ContextCard>
      )}

      {conv.provider_user_id && (
        <ContextCard title="Provider" loading={provider.isLoading} error={provider.error as Error | null}>
          {(() => {
            const p = provider.data?.provider ?? provider.data ?? {};
            return (
              <>
                <Row label="Navn" value={p.full_name ?? "—"} />
                <Row label="Land" value={p.country_code ?? "—"} />
                <Row label="Stripe klar" value={p.stripe_ready ? "Ja" : p.stripe_ready === false ? "Nej" : "—"} />
                <Row label="Tvister" value={String(p.disputes ?? provider.data?.disputes ?? 0)} />
              </>
            );
          })()}
        </ContextCard>
      )}

      {conv.booking_id && (
        <ContextCard title="Booking" loading={booking.isLoading} error={booking.error as Error | null}>
          {(() => {
            const b = booking.data?.booking ?? booking.data ?? {};
            return (
              <>
                <Row label="Dato" value={
                  b.booking_date
                    ? format(new Date(b.booking_date), "d. MMM yyyy HH:mm", { locale: da })
                    : "—"
                } />
                <Row label="Status" value={b.status ?? "—"} />
                <Row label="Beløb" value={
                  b.customer_pays != null
                    ? `${(b.customer_pays / 100).toFixed(2)} ${b.currency ?? ""}`
                    : "—"
                } />
                <Row label="Adresse" value={b.address_masked ?? b.address ?? "—"} />
              </>
            );
          })()}
        </ContextCard>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-right break-all">{value}</span>
    </div>
  );
}

function ContextCard({
  title, loading, error, children,
}: { title: string; loading: boolean; error: Error | null; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-1 text-sm">
        {loading && <Skeleton className="h-16 w-full" />}
        {error && <p className="text-xs text-destructive">{error.message}</p>}
        {!loading && !error && children}
      </CardContent>
    </Card>
  );
}
