import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportLayout } from "./SupportLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

type Booking = {
  id: string;
  status: string;
  payment_status: string | null;
  booking_date: string | null;
  currency: string | null;
  country_code: string | null;
  provider_id: string | null;
  customer_pays: number | null;
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return "—";
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

export default function SupportBookingsPage() {
  const { t } = useTranslation("admin");
  const [q, setQ] = useState("");
  const [committed, setCommitted] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["support", "bookings", committed],
    queryFn: async (): Promise<Booking[]> => {
      const params = new URLSearchParams({ limit: "50" });
      if (committed) params.set("q", committed);
      const { data, error } = await supabase.functions.invoke(
        `support-booking-summary?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { bookings: Booking[] })?.bookings ?? [];
    },
  });

  return (
    <SupportLayout title={t("support.bookings.title")} description={t("support.bookings.description")}>
      <form
        onSubmit={(e) => { e.preventDefault(); setCommitted(q.trim()); }}
        className="flex gap-2 mb-4 max-w-lg"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("support.bookings.searchPlaceholder")}
            className="pl-9"
            aria-label={t("support.bookings.searchAria")}
          />
        </div>
        <Button type="submit" variant="outline">{t("support.bookings.searchButton")}</Button>
      </form>

      {isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
      {isError && <Card><CardContent className="p-6 text-sm text-destructive">{t("support.bookings.error", { message: (error as Error).message })}</CardContent></Card>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">{t("support.bookings.empty")}</CardContent></Card>
      )}

      <ul className="space-y-2" role="list">
        {(data ?? []).map((b) => (
          <li key={b.id}>
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}…</div>
                  <div className="text-sm">
                    {b.booking_date ? new Date(b.booking_date).toLocaleString() : t("support.bookings.noDate")}
                    {b.provider_id && <span className="ml-2 text-muted-foreground">• {t("support.bookings.providerLabel")} #{b.provider_id}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatAmount(b.customer_pays, b.currency)}
                    {b.country_code && ` • ${b.country_code}`}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary">{t(`support.bookings.status.${b.status}`, { defaultValue: b.status })}</Badge>
                  {b.payment_status && <Badge variant="outline" className="text-xs">{b.payment_status}</Badge>}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </SupportLayout>
  );
}
