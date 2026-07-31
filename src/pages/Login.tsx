import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { fetchActiveRequiredDocs, recordAcceptances, type ActiveLegalDoc } from "@/lib/legalAcceptance";
import Turnstile, { resetTurnstile } from "@/components/Turnstile";
import { AuthShell, AuthCard, EarlyAccessChip } from "@/components/auth/AuthShell";
import {
  AuthField,
  AuthPasswordField,
  AuthSelect,
  AuthSubmit,
  AuthDivider,
  GoogleButton,
  AuthTrustNote,
} from "@/components/auth/AuthFields";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(() =>
    new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("mode") === "signup"
      ? "signup"
      : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("DK");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [requiredDocs, setRequiredDocs] = useState<ActiveLegalDoc[]>([]);
  const [legalStatus, setLegalStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedRedirect = params.get("redirect") || params.get("next");
  const explicitRedirect = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : null;

  useEffect(() => {
    if (mode !== "signup") return;
    setLegalStatus("loading");
    const lang = (navigator.language || "da").slice(0, 2).toLowerCase();
    (async () => {
      try {
        let docs = await fetchActiveRequiredDocs(country, lang);
        if (!docs.length && lang !== "en") {
          docs = await fetchActiveRequiredDocs(country, "en");
        }
        setRequiredDocs(docs);
        setLegalStatus(docs.length ? "ready" : "unavailable");
      } catch (err) {
        console.error("legal_docs_fetch_failed", { country, lang, err });
        setRequiredDocs([]);
        setLegalStatus("unavailable");
      }
    })();
  }, [mode, country]);

  async function resolveDestination(): Promise<string> {
    if (explicitRedirect) return explicitRedirect;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "/customer";
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const r = (roles ?? []).map((x: any) => x.role);
    if (r.includes("super_admin") || r.includes("admin")) return "/admin";
    if (r.includes("employee")) return "/employee";
    if (r.includes("provider")) return "/provider-dashboard";
    return "/customer";
  }

  const callbackUrl = `${window.location.origin}/auth/callback${explicitRedirect ? `?next=${encodeURIComponent(explicitRedirect)}` : ""}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    if (!captchaToken) {
      toast.error("Bekræft venligst captcha-udfordringen først");
      setFormError("Bekræft venligst captcha-udfordringen først");
      return;
    }
    setLoading(true);
    const usedCaptcha = captchaToken;
    try {
      // Server-side Turnstile verification — we enforce it ourselves
      // instead of relying on Supabase's built-in provider setting.
      const { data: verify, error: verifyErr } = await supabase.functions.invoke("captcha-verify", {
        body: { token: usedCaptcha, action: mode },
      });
      if (verifyErr || !verify?.success) {
        toast.error("Captcha kunne ikke bekræftes — prøv igen");
        setFormError("Captcha kunne ikke bekræftes — prøv igen");
        setCaptchaToken(null);
        resetTurnstile();
        setLoading(false);
        return;
      }
      if (mode === "signup") {
        if (legalStatus !== "ready" || requiredDocs.length === 0) {
          toast.error("Vilkårene for det valgte land er ikke tilgængelige lige nu. Prøv igen senere eller kontakt support.");
          setLoading(false);
          return;
        }
        if (!acceptedLegal) {
          toast.error("Du skal acceptere vilkårene for at oprette en konto");
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callbackUrl,
            data: { full_name: fullName, country_code: country },
            captchaToken: usedCaptcha,
          },
        });
        if (error) throw error;
        const uid = data.session?.user?.id ?? data.user?.id ?? null;
        if (data.session && uid && requiredDocs.length) {
          try { await recordAcceptances(uid, requiredDocs); } catch { /* logged silently */ }
        } else if (uid && requiredDocs.length) {
          sessionStorage.setItem("pendingLegalAcceptances", JSON.stringify(requiredDocs));
        }
        toast.success("Konto oprettet");
        navigate(await resolveDestination(), { replace: true });
      } else if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
          captchaToken: usedCaptcha,
        });
        toast.success("Hvis kontoen findes, sender vi et gendannelseslink til din email");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: usedCaptcha },
        } as any);
        if (error) throw error;
        toast.success("Velkommen tilbage");
        navigate(await resolveDestination(), { replace: true });
      }
    } catch (err: any) {
      toast.error(err?.message || "Noget gik galt");
      setFormError(
        mode === "signin"
          ? "Vi kunne ikke logge dig ind. Tjek din email og adgangskode."
          : err?.message || "Noget gik galt. Prøv igen.",
      );
    } finally {
      setCaptchaToken(null);
      resetTurnstile();
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: callbackUrl,
    });
    if (result.error) {
      toast.error("Google login fejlede");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate(await resolveDestination(), { replace: true });
  }

  const title =
    mode === "signin" ? "Velkommen tilbage" : mode === "signup" ? "Opret din MyCleaner-konto" : "Glemt adgangskode";
  const subtitle =
    mode === "signin"
      ? explicitRedirect?.includes("bliv-cleaner")
        ? "Log ind og fortsæt din provider-ansøgning."
        : "Log ind og fortsæt på MyCleaner."
      : mode === "signup"
        ? "Bliv en af de første på platformen – det tager kun et øjeblik."
        : "Vi sender et gendannelseslink til din email.";

  return (
    <AuthShell>
      <AuthCard>
        <EarlyAccessChip />
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm text-[hsl(224_20%_42%)]">{subtitle}</p>

        {mode !== "forgot" && (
          <>
            <div className="mt-5">
              <GoogleButton onClick={handleGoogle} disabled={loading} />
            </div>
            <AuthDivider label={t("ui.login.continueWithEmail")} />
          </>
        )}

        <form onSubmit={handleSubmit} className={`space-y-4 ${mode === "forgot" ? "mt-5" : ""}`} noValidate={false}>
          {mode === "signup" && (
            <AuthField
              label={t("ui.login.fullName")}
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          )}
          <AuthField
            label="Email"
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          {mode !== "forgot" && (
            <AuthPasswordField
              label="Adgangskode"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              hint={mode === "signup" ? "Mindst 6 tegn." : undefined}
            />
          )}
          {mode === "signup" && (
            <>
              <AuthSelect
                label="Land"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={loading}
              >
                <option value="DK">Danmark</option>
                <option value="UK">{t("ui.login.countryUK")}</option>
                <option value="SE">Sverige</option>
                <option value="ES">Spanien</option>
              </AuthSelect>

              <label className="flex items-start gap-3 rounded-xl border border-[hsl(222_40%_88%)] p-3.5 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={acceptedLegal}
                  onChange={(e) => setAcceptedLegal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(222_88%_42%)]"
                />
                <span className="text-[hsl(224_25%_32%)]">
                  Jeg accepterer{" "}
                  <Link to="/regler" target="_blank" className="font-medium text-[hsl(222_88%_42%)] underline">
                    vilkårene
                  </Link>{" "}
                  og{" "}
                  <Link to="/privatliv" target="_blank" className="font-medium text-[hsl(222_88%_42%)] underline">
                    privatlivspolitikken
                  </Link>
                  {requiredDocs.length > 0 && (
                    <span className="mt-0.5 block text-[11px] text-[hsl(222_15%_58%)]">
                      {requiredDocs.map((d) => `${d.kind}@${d.version}`).join(", ")}
                    </span>
                  )}
                </span>
              </label>
              {legalStatus === "unavailable" && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  Vilkårene for {country} er ikke tilgængelige lige nu. Vælg et andet land eller prøv igen senere.
                </div>
              )}
            </>
          )}

          <Turnstile
            action={mode}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />

          {formError && (
            <p role="alert" className="text-sm font-medium text-[hsl(0_72%_45%)]">
              {formError}
            </p>
          )}

          <AuthSubmit
            loading={loading}
            disabled={
              loading ||
              !captchaToken ||
              (mode === "signup" && (!acceptedLegal || legalStatus !== "ready"))
            }
          >
            {mode === "signin" && "Log ind"}
            {mode === "signup" && "Opret konto"}
            {mode === "forgot" && "Send gendannelseslink"}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </AuthSubmit>
        </form>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => { setFormError(null); setMode("forgot"); }}
            className="mt-4 w-full text-center text-sm font-medium text-[hsl(222_88%_42%)] hover:underline"
          >
            Glemt adgangskode?
          </button>
        )}

        <button
          type="button"
          onClick={() => { setFormError(null); setMode(mode === "signin" ? "signup" : "signin"); }}
          className="mt-3 w-full text-center text-sm text-[hsl(224_20%_42%)]"
        >
          {mode === "signin" && (
            <>{t("ui.login.newHere")} <span className="font-semibold text-[hsl(222_88%_42%)]">{t("ui.login.createAccount")}</span></>
          )}
          {mode === "signup" && (
            <>{t("ui.login.alreadyHaveAccount")} <span className="font-semibold text-[hsl(222_88%_42%)]">{t("ui.login.signIn")}</span></>
          )}
          {mode === "forgot" && "Tilbage til login"}
        </button>

        {mode === "signup" && <AuthTrustNote />}
      </AuthCard>
    </AuthShell>
  );
}
