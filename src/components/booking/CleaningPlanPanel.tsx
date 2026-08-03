import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Home, Save, StickyNote, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/bookingTheme";

type Task = { label: string; checked: boolean };
type Room = { name: string; tasks: Task[] };
type Plan = {
  id: string;
  scope: "booking" | "property";
  rooms: Room[] | null;
  focus_areas: string[] | null;
  notes: string | null;
  updated_at: string;
};

export default function CleaningPlanPanel({
  bookingId,
  userId,
  addressPlaceId,
}: {
  bookingId: string;
  userId: string;
  addressPlaceId?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Prefer booking-specific plan
      const { data: bp } = await supabase
        .from("cleaning_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("booking_id", bookingId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let found: any = bp;
      if (!found && addressPlaceId) {
        const { data: addr } = await supabase
          .from("customer_addresses")
          .select("id")
          .eq("user_id", userId)
          .eq("address_place_id", addressPlaceId)
          .maybeSingle();
        if (addr) {
          const { data: pp } = await supabase
            .from("cleaning_plans")
            .select("*")
            .eq("user_id", userId)
            .eq("address_id", addr.id)
            .eq("scope", "property")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          found = pp;
        }
      }
      if (!cancelled) {
        setPlan(found as Plan | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId, userId, addressPlaceId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs opacity-70">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter rengøringsplan…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="rounded-xl border-2 border-dashed p-4 text-center" style={{ borderColor: `${C.ink}33` }}>
        <div className="text-sm">Ingen rengøringsplan endnu.</div>
        <Link
          to={`/booking/${bookingId}/plan`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ background: C.orange, color: C.ink }}
        >
          <Pencil className="h-3 w-3" /> Lav rengøringsplan
        </Link>
      </div>
    );
  }

  const activeRooms = (plan.rooms || []).map(r => ({
    ...r,
    tasks: (r.tasks || []).filter(t => t.checked),
  })).filter(r => r.tasks.length > 0);

  const focus = plan.focus_areas || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: C.teal }}>
          {plan.scope === "property" ? <Home className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          {plan.scope === "property" ? "Fast plan på boligen" : "Kun denne rengøring"}
        </div>
        <Link
          to={`/booking/${bookingId}/plan`}
          className="inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ borderColor: C.ink, color: C.ink }}
        >
          <Pencil className="h-3 w-3" /> Rediger
        </Link>
      </div>

      {focus.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">Fokusområder</div>
          <div className="flex flex-wrap gap-1.5">
            {focus.map(tag => (
              <span key={tag} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: C.mint, color: C.ink }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
          <ListChecks className="h-3 w-3" /> Rum & opgaver
        </div>
        {activeRooms.length === 0 ? (
          <div className="text-xs opacity-60">Ingen aktive opgaver.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {activeRooms.map((r, i) => (
              <div key={i} className="rounded-lg border-2 p-3" style={{ borderColor: `${C.ink}22` }}>
                <div className="mb-1.5 text-sm font-bold" style={{ color: C.ink }}>{r.name}</div>
                <ul className="space-y-0.5 text-xs opacity-80">
                  {r.tasks.map((t, j) => (
                    <li key={j} className="flex items-start gap-1.5">
                      <span aria-hidden style={{ color: C.teal }}>✓</span>{t.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {plan.notes?.trim() && (
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
            <StickyNote className="h-3 w-3" /> Noter
          </div>
          <div className="whitespace-pre-wrap rounded-lg border-2 border-dashed p-3 text-xs leading-relaxed" style={{ borderColor: `${C.ink}22` }}>
            {plan.notes}
          </div>
        </div>
      )}

      <div className="text-[10px] opacity-50">
        Senest opdateret {new Date(plan.updated_at).toLocaleString("da-DK")}
      </div>
    </div>
  );
}
