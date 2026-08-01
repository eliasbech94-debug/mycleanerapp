import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck, Camera, CheckCircle2, CircleAlert, Clock, CreditCard,
  FileText, GraduationCap, Loader2, RefreshCw, ShieldCheck, Tag, UserRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useProviderApprovalStatus } from "@/hooks/useProviderApprovalStatus";
import type { GateKey } from "@/lib/providerApproval/gates";

interface GateMeta {
  key: GateKey;
  icon: typeof ShieldCheck;
  title: string;
  help: string;
  to?: string;
}

// `to` must point at a route that exists in App.tsx. Onboarding steps live on
// /bliv-cleaner (the canonical provider onboarding route) — /provider/onboarding,
// /provider/documents and /provider/payouts were dead links.
const GATES: GateMeta[] = [
  { key: "identity", icon: ShieldCheck, title: "Identitetsverifikation", help: "Gennemfør ID-verifikationen. Vi godkender først, når verifikationen er fuldført.", to: "/verify-identity" },
  { key: "photo", icon: Camera, title: "Profilbillede", help: "Upload et tydeligt billede af dit ansigt i god belysning — ingen gruppebilleder, logoer eller skærmbilleder.", to: "/provider/profile" },
  { key: "profile", icon: UserRound, title: "Profiloplysninger", help: "Navn, fødselsdato (18+), adresse, verificeret telefon og e-mail, sprog og en bio på mindst 40 tegn.", to: "/provider/profile" },
  { key: "services", icon: Tag, title: "Aktiv service og pris", help: "Mindst én aktiv service med en pris på eller over landets minimumssats.", to: "/provider/pricing" },
  { key: "quiz", icon: GraduationCap, title: "MyCleaner-test", help: "Bestå den korte test om regler, sikkerhed og god adfærd.", to: "/bliv-cleaner" },
  { key: "documents", icon: FileText, title: "Forsikring og dokumenter", help: "Upload gyldig forsikringsdokumentation med policenummer og udløbsdato.", to: "/bliv-cleaner" },
  { key: "stripe", icon: CreditCard, title: "Udbetalinger (Stripe)", help: "Fuldfør Stripe-onboarding, så udbetalinger og betalinger er aktive uden åbne krav.", to: "/provider/finance" },
];

const STATE_LABEL: Record<string, string> = {
  incomplete: "Ikke færdig",
  awaiting_identity: "Afventer identitetsverifikation",
  identity_in_review: "Identitet under behandling",
  awaiting_profile_photo: "Afventer profilbillede",
  photo_in_review: "Profilbillede under vurdering",
  awaiting_profile_completion: "Afventer profiloplysninger",
  awaiting_documents: "Afventer dokumenter",
  awaiting_stripe: "Afventer udbetalingsopsætning",
  manual_review: "Under manuel gennemgang",
  approved: "Godkendt",
  rejected: "Afvist",
  suspended: "Suspenderet",
};

const PHOTO_REASONS: Record<string, string> = {
  no_face: "Vi kunne ikke se et ansigt på billedet.",
  multiple_faces: "Der er flere personer på billedet.",
  face_not_clear: "Ansigtet er ikke tydeligt nok.",
  too_dark: "Billedet er for mørkt.",
  blurry: "Billedet er uskarpt.",
  low_resolution: "Billedet har for lav opløsning.",
  sunglasses_or_covered: "Ansigtet er delvist dækket.",
  screenshot: "Billedet ser ud til at være et skærmbillede.",
  avatar_or_illustration: "Billedet er en avatar eller tegning.",
  logo_or_text: "Billedet indeholder logo eller tekst.",
  advertising: "Billedet indeholder reklame.",
  violence: "Billedet indeholder voldsomt indhold.",
  sexual_content: "Billedet indeholder seksuelt indhold.",
  hate_symbol: "Billedet indeholder stødende symboler.",
  likely_ai_generated: "Billedet ser kunstigt genereret ud.",
  not_a_photo_of_a_person: "Billedet viser ikke en person.",
};

export function ProviderApprovalChecklist({ className }: { className?: string }) {
  const { status, gates, loading, error, refresh } = useProviderApprovalStatus();

  const passed = useMemo(
    () => (gates ? GATES.filter((g) => gates[g.key]).length : 0),
    [gates],
  );
  const percent = Math.round((passed / GATES.length) * 100);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Henter din godkendelsesstatus…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !gates) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col gap-3 py-8">
          <p className="text-sm text-muted-foreground">
            Vi kunne ikke hente din godkendelsesstatus lige nu.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refresh()} className="self-start">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Prøv igen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const state = status?.state ?? "incomplete";
  const approved = state === "approved";

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Godkendelse
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={approved ? "default" : "secondary"}>
              {STATE_LABEL[state] ?? state}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              aria-label="Opdater godkendelsesstatus"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="space-y-1 pt-2">
          <Progress value={percent} aria-label={`Godkendelse ${percent} procent gennemført`} />
          <p className="text-xs text-muted-foreground">
            {passed} af {GATES.length} krav opfyldt
            {status?.is_bookable ? " · din profil er bookbar" : " · din profil er endnu ikke bookbar"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {GATES.map((g) => {
          const ok = gates[g.key];
          const inReview =
            (g.key === "identity" && gates.identity_in_review) ||
            (g.key === "photo" && gates.photo_in_review);
          const Icon = g.icon;
          return (
            <div
              key={g.key}
              className="flex items-start gap-3 rounded-lg border border-border/60 p-3"
            >
              <span className="mt-0.5" aria-hidden="true">
                {ok ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : inReview ? (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <CircleAlert className="h-5 w-5 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium">{g.title}</p>
                  {inReview && (
                    <Badge variant="outline" className="text-xs">Under behandling</Badge>
                  )}
                </div>
                {!ok && (
                  <p className="mt-1 text-sm text-muted-foreground">{g.help}</p>
                )}
                {g.key === "photo" && !ok && gates.photo_reason_codes?.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                    {gates.photo_reason_codes.map((c) => (
                      <li key={c}>{PHOTO_REASONS[c] ?? c}</li>
                    ))}
                  </ul>
                )}
                {!ok && !inReview && g.to && (
                  <Button asChild variant="link" size="sm" className="h-auto px-0">
                    <Link to={g.to}>Gør det færdigt</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {gates.production && gates.sandbox_identity === true && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Din verifikation blev gennemført i testmiljøet og kan derfor ikke bruges til
            godkendelse. Gennemfør verifikationen igen.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ProviderApprovalChecklist;
