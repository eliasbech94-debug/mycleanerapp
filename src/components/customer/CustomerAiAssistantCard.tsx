import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  getCustomerAiSuggestions,
  trackCustomerIntent,
  type CustomerAiSuggestion,
} from "@/lib/customerIntent";

const C = {
  ink: "#0a3d3a",
  orange: "#ff6b35",
  cream: "#f5f0e0",
  teal: "#168a7a",
};

export function CustomerAiAssistantCard() {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<CustomerAiSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    getCustomerAiSuggestions()
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestion = suggestions.find((item) => !dismissed.has(item.suggestion_key));

  if (loading) {
    return (
      <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
        <div className="flex items-center gap-2 text-xs opacity-60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finder relevante forslag…
        </div>
      </div>
    );
  }

  if (!suggestion) return null;

  const dismiss = () => {
    setDismissed((previous) => new Set(previous).add(suggestion.suggestion_key));
    void trackCustomerIntent({
      eventType: "suggestion_dismissed",
      metadata: {
        suggestion_key: suggestion.suggestion_key,
        suggestion_type: suggestion.suggestion_type,
      },
    });
  };

  return (
    <section
      aria-label="Personligt forslag fra MyCleaner"
      className="relative overflow-hidden rounded-2xl border-2 p-6"
      style={{ borderColor: C.ink, background: C.cream }}
    >
      <button
        type="button"
        aria-label="Skjul forslag"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-2 transition hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full" style={{ background: C.teal }}>
          <Sparkles className="h-5 w-5" style={{ color: C.cream }} />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">
            Forslag til dig
          </div>
          <h2 className="mt-1 font-display text-xl" style={{ color: C.ink }}>
            {suggestion.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-75">
            {suggestion.body}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to={suggestion.action_href}
          onClick={() => {
            void trackCustomerIntent({
              eventType: "suggestion_opened",
              metadata: {
                suggestion_key: suggestion.suggestion_key,
                suggestion_type: suggestion.suggestion_type,
              },
            });
          }}
          className="rounded-full border-2 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ background: C.orange, borderColor: C.ink, color: C.ink }}
        >
          {suggestion.action_label}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs font-semibold underline underline-offset-4 opacity-65"
        >
          Ikke lige nu
        </button>
      </div>

      <p className="mt-4 text-[11px] opacity-55">
        Forslaget bygger kun på aktivitet, du har tilladt MyCleaner at bruge. Du kan ændre det under privatlivsindstillinger.
      </p>
    </section>
  );
}
