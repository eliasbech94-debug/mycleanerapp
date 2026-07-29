/** Experience & background — verified employers and self-reported years/languages. */
import { Briefcase, Building2, Globe } from "lucide-react";
import type { PublicProviderProfile, PublicWorkHistoryEntry } from "./types";
import { formatPeriod, languageLabel } from "./format";

type Props = { profile: PublicProviderProfile; workHistory: PublicWorkHistoryEntry[] };

export function ProviderExperience({ profile, workHistory }: Props) {
  const languages = profile.languages ?? [];
  const hasYears = profile.years_experience != null && profile.years_experience > 0;
  if (!hasYears && languages.length === 0 && workHistory.length === 0) return null;

  return (
    <section data-testid="provider-experience" className="space-y-3">
      <h2 className="text-xl font-bold text-[hsl(224_72%_18%)]">Erfaring og baggrund</h2>
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
