/** Experience & background — verified employers and self-reported years/languages. */
import { Briefcase, Building2, Globe, Sparkles } from "lucide-react";
import type { PublicProviderProfile, PublicWorkHistoryEntry } from "./types";
import { formatPeriod, languageLabel, serviceLabel } from "./format";
import SectionHeading from "./SectionHeading";

type Props = {
  profile: PublicProviderProfile;
  workHistory: PublicWorkHistoryEntry[];
  /** "sidebar" renders the compact desktop right-column card. */
  variant?: "section" | "sidebar";
};

export function ProviderExperience({ profile, workHistory, variant = "section" }: Props) {
  const languages = profile.languages ?? [];
  const hasYears = profile.years_experience != null && profile.years_experience > 0;
  if (!hasYears && languages.length === 0 && workHistory.length === 0) return null;

  if (variant === "sidebar") {
    const specialties = (profile.service_categories ?? []).slice(0, 6);
    return (
      <section
        data-testid="provider-experience-sidebar"
        className="rounded-3xl bg-white p-6 ring-1 ring-[hsl(222_60%_92%)]"
      >
        <h2 className="text-base font-bold text-[hsl(224_72%_18%)]">Erfaring og baggrund</h2>

        <ul className="mt-3 space-y-2.5 text-sm text-[hsl(224_45%_20%)]">
          {hasYears && (
            <li className="flex items-start gap-2">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span>{profile.years_experience} års erfaring</span>
            </li>
          )}
          {workHistory.slice(0, 3).map((w, i) => (
            <li key={`${w.company_name}-${i}`} className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span className="min-w-0 break-words">
                <strong className="font-medium">{w.company_name}</strong>
                {w.role_title ? ` · ${w.role_title}` : ""}
                <span className="block text-xs text-[hsl(224_20%_45%)]">
                  {formatPeriod(w.started_on, w.ended_on, w.currently_employed)}
                  <span className="ml-1 text-emerald-600">· Verificeret</span>
                </span>
              </span>
            </li>
          ))}
          {languages.length > 0 && (
            <li className="flex items-start gap-2">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span className="min-w-0 break-words">{languages.map(languageLabel).join(" · ")}</span>
            </li>
          )}
        </ul>

        {specialties.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[hsl(224_20%_45%)]">
              Specialer
            </h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {specialties.map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(210_60%_97%)] px-2.5 py-1.5 text-xs font-medium text-[hsl(224_45%_20%)]"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
                  {serviceLabel(c)}
                </li>
              ))}
            </ul>
          </>
        )}

        {profile.headline && (
          <p className="mt-4 line-clamp-3 break-words border-t border-[hsl(222_60%_94%)] pt-3 text-sm text-[hsl(224_45%_25%)]">
            {profile.headline}
          </p>
        )}
      </section>
    );
  }

  return (
    <section data-testid="provider-experience" className="space-y-4">
      <SectionHeading icon={Briefcase} title="Erfaring og baggrund" tone="violet" />

      <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)] sm:grid-cols-2">
        <ul className="space-y-2 text-sm text-[hsl(224_45%_20%)]">
          {hasYears && (
            <li className="flex items-start gap-2">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span>{profile.years_experience} års erfaring</span>
            </li>
          )}
          {workHistory.map((w, i) => (
            <li key={`${w.company_name}-${i}`} className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span className="min-w-0 break-words">
                <strong className="font-medium">{w.company_name}</strong>
                {w.role_title ? ` · ${w.role_title}` : ""}
                {" · "}
                {formatPeriod(w.started_on, w.ended_on, w.currently_employed)}
                <span className="ml-1 text-xs text-emerald-600">· Verificeret</span>
              </span>
            </li>
          ))}
        </ul>

        {languages.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-[hsl(224_45%_20%)]">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-[hsl(224_20%_45%)]">Taler</div>
              <div className="break-words">{languages.map(languageLabel).join(" · ")}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default ProviderExperience;
