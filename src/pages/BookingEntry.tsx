import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Map as MapIcon, ArrowRight, Zap, ShieldCheck, Clock, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/AppContext";

/**
 * Marketplace entry point. Customer chooses between:
 *  1. "Find best cleaner for me" — algorithmic match (posts a task).
 *  2. "Choose my own cleaner"    — browse map + profiles + calendar.
 *
 * When the visitor arrived via a provider-specific link (/p/:slug), we short-
 * circuit selection and jump straight into the locked booking flow for that
 * provider. The slug is the only authoritative signal — payment/booking still
 * re-derive the provider server-side against the quote.
 */
const BookingEntry = () => {
  const navigate = useNavigate();
  const { providerLock } = useAppContext();

  useEffect(() => {
    if (providerLock?.slug) {
      navigate(`/book?provider=${encodeURIComponent(providerLock.slug)}&src=${encodeURIComponent(providerLock.source)}`, { replace: true });
    }
  }, [providerLock, navigate]);


  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container-narrow w-full max-w-full px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <Badge variant="secondary" className="mb-3">Book en cleaner</Badge>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold mb-3">
              Hvordan vil du booke?
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Lad MyCleaner finde det bedste match for dig — eller vælg selv en cleaner du kan lide.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {/* Option 1 — AI match */}
            <button
              type="button"
              onClick={() => navigate("/task/create")}
              className="glass-card p-6 sm:p-7 text-left rounded-3xl transition-all hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary group"
              aria-label="Lad platformen finde den bedste cleaner"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <Badge className="bg-primary/10 text-primary border-0">Anbefalet</Badge>
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold mb-2">
                Find den bedste cleaner til mig
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Beskriv opgaven. Vi matcher automatisk baseret på afstand,
                ledig kalender, kompetencer, rating, serviceområde og responstid.
              </p>

              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Kun verificerede cleaners nær dig</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>AI-match på minutter — ingen budkrig</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Bekræftet booking i din foretrukne tid</span>
                </li>
              </ul>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">~2 min · gratis</span>
                <span className="inline-flex items-center gap-1 text-primary font-semibold text-sm group-hover:gap-2 transition-all">
                  Kom i gang <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </button>

            {/* Option 2 — Choose manually */}
            <button
              type="button"
              onClick={() => navigate("/find-cleaner")}
              className="glass-card p-6 sm:p-7 text-left rounded-3xl transition-all hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary group"
              aria-label="Vælg selv en cleaner på kortet"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-2xl bg-accent/10 text-accent grid place-items-center">
                  <MapIcon className="h-5 w-5" />
                </div>
                <Badge variant="outline">Fuld kontrol</Badge>
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold mb-2">
                Vælg selv din cleaner
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Se cleaners nær dig på kortet. Filtrér efter pris, rating,
                sprog og services. Book direkte i kalenderen.
              </p>

              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-start gap-2">
                  <MapIcon className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Interaktivt kort med serviceområder</span>
                </li>
                <li className="flex items-start gap-2">
                  <Star className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Profiler, anmeldelser og responstid</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Instant Book hos udvalgte cleaners</span>
                </li>
              </ul>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Book direkte i kalenderen</span>
                <span className="inline-flex items-center gap-1 text-accent font-semibold text-sm group-hover:gap-2 transition-all">
                  Åbn kortet <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </button>
          </div>

          <div className="text-center mt-8">
            <p className="text-xs text-muted-foreground">
              Alle bookinger er dækket af MyCleaner-garantien og betalingssikring via Stripe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingEntry;
