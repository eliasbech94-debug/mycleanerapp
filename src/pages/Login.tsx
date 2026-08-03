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
  AuthCheckbox,
  AuthNotice,
  GoogleButton,
  AuthTrustNote,
} from "@/components/auth/AuthFields";
import { friendlyAuthError, authErrorField } from "@/lib/auth/authErrors";
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
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [resetSent, setResetSent] = useState(false);
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
    setEmailError(undefined);
    setPasswordError(undefined);
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
        toast.success("Hvis kontoen findes, sender vi et gendannelseslink til din e-mail");
        setResetSent(true);
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
      // Never surface raw provider messages — always calm Danish copy.
      const friendly = friendlyAuthError(err, mode);
      const field = authErrorField(err);
      toast.error(friendly);
      if (field === "email") setEmailError(friendly);
      else if (field === "password") setPasswordError(friendly);
      else setFormError(friendly);
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

  // Provider applicants arrive here from /bliv-cleaner — give them copy that
  // matches their intent instead of the generic customer wording.
  const providerIntent =
    params.get("role") === "provider" || !!explicitRedirect?.includes("bliv-cleaner");
  const title =
    mode === "signin"
      ? "Velkommen tilbage"
      : mode === "signup"
        ? providerIntent
          ? "Opret din cleaner-profil"
          : "Opret din MyCleaner-konto"
        : "Glemt adgangskode";
  const subtitle =
    mode === "signin"
      ? explicitRedirect?.includes("bliv-cleaner")
        ? "Log ind og fortsæt din provider-ansøgning."
        : "Log ind og fortsæt på MyCleaner."
      : mode === "signup"
        ? providerIntent
          ? "Første skridt mod at arbejde som selvstændig cleaner. Det tager kun et øjeblik."
          : "Bliv en af de første på platformen – det tager kun et øjeblik."
        : "Vi sender et gendannelseslink til din e-mail.";

  function switchMode(next: "signin" | "signup" | "forgot") {
    setFormError(null);
    setEmailError(undefined);
    setPasswordError(undefined);
    setResetSent(false);
    setMode(next);
  }

  return (
    <AuthShell>
      <AuthCard>
        <EarlyAccessChip />
        <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[hsl(224_20%_42%)]">{subtitle}</p>

        {mode === "forgot" && resetSent ? (
          <div className="mt-5 space-y-4">
            <AuthNotice tone="success" title="Tjek din indbakke">
              Hvis der findes en konto på <span className="font-medium break-all">{email}</span>, har vi sendt et
              gendannelseslink. Linket udløber efter 60 minutter.
            </AuthNotice>
            <p className="text-sm text-[hsl(224_20%_42%)]">
              Kan du ikke finde mailen? Se i spam-mappen, eller{" "}
              <button
                type="button"
                onClick={() => setResetSent(false)}
                className="font-semibold text-[hsl(222_88%_42%)] underline underline-offset-2"
              >
                prøv igen
              </button>
              .
            </p>
          </div>
        ) : (
          <>
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
              autoCapitalize="words"
              placeholder="Fx Mette Jensen"
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
            autoCorrect="off"
            spellCheck={false}
            placeholder="din@email.dk"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(undefined); }}
            disabled={loading}
            error={emailError}
          />
          {mode !== "forgot" && (
            <AuthPasswordField
              label="Adgangskode"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(undefined); }}
              disabled={loading}
              error={passwordError}
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

              <AuthCheckbox
                required
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                disabled={loading}
              >
                Jeg accepterer{" "}
                <Link to="/regler" target="_blank" className="font-medium text-[hsl(222_88%_42%)] underline underline-offset-2">
                  vilkårene
                </Link>{" "}
                og{" "}
                <Link to="/privatliv" target="_blank" className="font-medium text-[hsl(222_88%_42%)] underline underline-offset-2">
                  privatlivspolitikken
                </Link>
                {requiredDocs.length > 0 && (
                  <span className="mt-1 block text-[11px] text-[hsl(222_15%_58%)]">
                    {requiredDocs.map((d) => `${d.kind}@${d.version}`).join(", ")}
                  </span>
                )}
              </AuthCheckbox>
              {legalStatus === "unavailable" && (
                <AuthNotice tone="warning" title="Vilkår ikke tilgængelige">
                  Vilkårene for {country} kan ikke hentes lige nu. Vælg et andet land eller prøv igen om lidt.
                </AuthNotice>
              )}
            </>
          )}

          <Turnstile
            action={mode}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />

          {formError && (
            <p role="alert" aria-live="polite" className="rounded-xl bg-[hsl(0_72%_97%)] px-3.5 py-3 text-sm font-medium text-[hsl(0_72%_40%)]">
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
            onClick={() => switchMode("forgot")}
            className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg text-sm font-medium text-[hsl(222_88%_42%)] transition-colors hover:bg-[hsl(222_88%_42%/0.06)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
          >
            Glemt adgangskode?
          </button>
        )}
        </>
        )}

        <button
          type="button"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
          className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg text-sm text-[hsl(224_20%_42%)] transition-colors hover:bg-[hsl(222_88%_42%/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
        >
          {mode === "signin" && (
            <>{t("ui.login.newHere")}&nbsp;<span className="font-semibold text-[hsl(222_88%_42%)]">{t("ui.login.createAccount")}</span></>
          )}
          {mode === "signup" && (
            <>{t("ui.login.alreadyHaveAccount")}&nbsp;<span className="font-semibold text-[hsl(222_88%_42%)]">{t("ui.login.signIn")}</span></>
          )}
          {mode === "forgot" && "Tilbage til login"}
        </button>

        {mode !== "forgot" && !providerIntent && (
          <div className="mt-4 rounded-xl border border-[hsl(222_40%_90%)] bg-[hsl(210_60%_98%)] p-3.5 text-sm">
            <p className="font-semibold text-[hsl(224_45%_16%)]">Vil du arbejde som cleaner?</p>
            <p className="mt-0.5 text-[hsl(224_20%_42%)]">
              Kunder opretter sig her.{" "}
              <Link
                to="/bliv-cleaner"
                className="font-semibold text-[hsl(222_88%_42%)] underline underline-offset-2"
              >
                Ansøg som cleaner i stedet
              </Link>
              .
            </p>
          </div>
        )}


        {mode === "signup" && <AuthTrustNote />}
      </AuthCard>
    </AuthShell>
  );
}
