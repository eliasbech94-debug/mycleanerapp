import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CalendarClock, Heart, RotateCcw } from "lucide-react";

/**
 * ReturningCustomerSection — Experience Engine surface for signed-in
 * customers. Purely presentational for now; a future Recommendation Engine
 * hook can hydrate `book_again` / `favorites` / `upcoming` with real data
 * without changing this component.
 */
export function ReturningCustomerSection() {
  const { t } = useTranslation("marketplace");
  const { user } = useAuth();
  const name = (user?.user_metadata?.first_name as string | undefined) ?? user?.email?.split("@")[0] ?? "";

  const tiles = [
    { key: "upcoming", href: "/my-bookings", Icon: CalendarClock },
    { key: "favorites", href: "/find-cleaner", Icon: Heart },
    { key: "book_again", href: "/find-cleaner", Icon: RotateCcw },
  ] as const;

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-10 lg:px-8" aria-labelledby="welcome-back-title">
      <div className="rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 shadow-[var(--mkt-shadow-soft)] sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
              {t("welcome_back.eyebrow", "Velkommen tilbage")}
            </p>
            <h2
              id="welcome-back-title"
              className="mt-1 font-serif text-[24px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[30px]"
            >
              {name
                ? t("welcome_back.heading_named", { name, defaultValue: `Hej {{name}} — fortsæt hvor du slap` })
                : t("welcome_back.heading", "Fortsæt hvor du slap")}
            </h2>
          </div>
        </div>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map(({ key, href, Icon }) => (
            <li key={key}>
              <Link
                to={href}
                className="group flex h-full min-h-16 items-center gap-4 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface-muted))] p-4 transition-colors hover:border-[hsl(var(--mkt-brand))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
                  <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
                    {t(`welcome_back.tiles.${key}.title`, key)}
                  </span>
                  <span className="block text-[13px] text-[hsl(var(--mkt-ink-muted))]">
                    {t(`welcome_back.tiles.${key}.body`, "")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
