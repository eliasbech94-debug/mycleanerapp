import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CalendarClock,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  ReceiptText,
  ShieldAlert,
  UserCog,
  Sparkles,
} from "lucide-react";
import { MarketSeo } from "@/components/seo/MarketSeo";
import { CrispChatPanel } from "@/components/support/CrispChatPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useCountryPath } from "@/lib/countryPath";
import { setCrispBookingContext, setCrispComposerText, setCrispTopic } from "@/lib/crisp";
import type { SupportTopic } from "@/hooks/useSupportCenter";

const TOPICS: Array<{ id: SupportTopic; icon: typeof LifeBuoy; label: string; hint: string }> = [
  { id: "booking", icon: CalendarClock, label: "Booking & ændringer", hint: "Flyt, afbestil eller ret en booking" },
  { id: "payment", icon: CreditCard, label: "Betaling & kort", hint: "Kort, betalinger og kvitteringer" },
  { id: "refund", icon: ReceiptText, label: "Refundering", hint: "Tilbagebetaling og kreditnotaer" },
  { id: "provider_issue", icon: ShieldAlert, label: "Problem med en cleaner", hint: "Kvalitet, no-show eller klage" },
  { id: "account", icon: UserCog, label: "Konto & profil", hint: "Login, oplysninger og notifikationer" },
  { id: "verification", icon: HelpCircle, label: "Verifikation", hint: "ID, telefon og godkendelse" },
];

/**
 * MyCleaner Support Center — the single customer-facing support surface.
 *
 * All live support runs through Crisp, but always embedded here inside our
 * own interface. There is no floating Crisp bubble anywhere on the site.
 */
export default function SupportCenterPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const cp = useCountryPath();
  const [params, setParams] = useSearchParams();

  const topic = (params.get("topic") as SupportTopic | null) ?? null;
  const bookingId = params.get("booking");
  const prefill = params.get("m");

  // Push deep-link context into the Crisp session before the user writes.
  useEffect(() => {
    if (topic) setCrispTopic(topic);
    if (bookingId) setCrispBookingContext({ bookingId });
    if (prefill) setCrispComposerText(prefill);
  }, [topic, bookingId, prefill]);

  const activeTopic = useMemo(() => TOPICS.find((x) => x.id === topic) ?? null, [topic]);

  return (
    <main className="min-h-screen bg-background">
      <MarketSeo titleKey="seo.contact.title" descriptionKey="seo.contact.description" />

      <div className="container-wide max-w-6xl py-10 sm:py-14">
        <header className="mb-8 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t("supportCenter.aiFirst", { defaultValue: "AI svarer først — mennesker overtager altid ved behov" })}
          </span>
          <h1 className="mt-4 font-heading text-3xl font-semibold sm:text-4xl">
            {t("supportCenter.title", { defaultValue: "Support Center" })}
          </h1>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            {t("supportCenter.subtitle", {
              defaultValue:
                "Få hjælp til bookinger, betalinger og din konto. Skriv til os her — vi svarer typisk inden for få minutter.",
            })}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* ---------- Topics + self-service ---------- */}
          <aside className="space-y-6">
            <section aria-labelledby="support-topics">
              <h2 id="support-topics" className="mb-3 text-sm font-medium text-muted-foreground">
                {t("supportCenter.topics", { defaultValue: "Hvad handler det om?" })}
              </h2>
              <div className="grid gap-2">
                {TOPICS.map((item) => {
                  const Icon = item.icon;
                  const active = topic === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        next.set("topic", item.id);
                        setParams(next, { replace: true });
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <span className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-muted-foreground">{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="support-self" className="rounded-xl border border-border bg-muted/30 p-4">
              <h2 id="support-self" className="mb-2 flex items-center gap-2 text-sm font-medium">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                {t("supportCenter.selfService", { defaultValue: "Klar dig selv" })}
              </h2>
              <ul className="space-y-1.5 text-sm">
                <li>
                  <Link className="text-primary hover:underline" to={cp("/faq")}>
                    {t("supportCenter.links.faq", { defaultValue: "Ofte stillede spørgsmål" })}
                  </Link>
                </li>
                <li>
                  <Link className="text-primary hover:underline" to={cp("/legal")}>
                    {t("supportCenter.links.legal", { defaultValue: "Vilkår, privatliv og afbestilling" })}
                  </Link>
                </li>
                <li>
                  <Link className="text-primary hover:underline" to={cp(user ? "/mine-bookinger" : "/login")}>
                    {t("supportCenter.links.bookings", { defaultValue: "Mine bookinger" })}
                  </Link>
                </li>
                <li>
                  <Link className="text-primary hover:underline" to={cp("/kontakt")}>
                    {t("supportCenter.links.contact", { defaultValue: "Kontaktoplysninger" })}
                  </Link>
                </li>
              </ul>
            </section>

            {!user && (
              <div className="rounded-xl border border-border p-4 text-sm">
                <p className="text-muted-foreground">
                  {t("supportCenter.signInHint", {
                    defaultValue:
                      "Log ind for at give supporten adgang til dine bookinger og betalinger — det gør svarene hurtigere.",
                  })}
                </p>
                <Button className="mt-3 w-full" asChild size="sm">
                  <Link to={cp("/login")}>{t("supportCenter.signIn", { defaultValue: "Log ind" })}</Link>
                </Button>
              </div>
            )}
          </aside>

          {/* ---------- Embedded Crisp chat ---------- */}
          <section aria-label={t("supportCenter.chat.title", { defaultValue: "MyCleaner Support" })}>
            {(activeTopic || bookingId) && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {activeTopic && <Badge variant="secondary">{activeTopic.label}</Badge>}
                {bookingId && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    Booking {bookingId.slice(0, 8)}
                  </Badge>
                )}
              </div>
            )}
            <CrispChatPanel />
            <p className="mt-3 text-xs text-muted-foreground">
              {t("supportCenter.privacy", {
                defaultValue:
                  "Vi bruger dine oplysninger til at hjælpe dig med din sag. Del aldrig kortnumre eller adgangskoder i chatten.",
              })}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
