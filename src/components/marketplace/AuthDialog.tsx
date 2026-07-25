/**
 * AuthDialog — accessible marketplace login modal.
 *
 * Uses the SAME sign-in primitives as the full-page /login (Turnstile +
 * captcha-verify edge function + supabase.auth.signInWithPassword) via
 * the shared helper in `src/lib/auth/signIn.ts`. No duplicate auth
 * implementation, no bypassed captcha, no separate session state.
 *
 * Sign-up and password reset intentionally route to the existing pages
 * (`/customer/register`, `/login?mode=forgot`) — this dialog only owns
 * the sign-in step, matching the "modal changes presentation only" rule.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Turnstile, { resetTurnstile } from "@/components/Turnstile";
import { performEmailSignIn } from "@/lib/auth/signIn";
import { readPendingAction, clearPendingAction } from "@/lib/pendingAction";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSwitchToRegister: () => void;
};

export function AuthDialog({ open, onOpenChange, onSwitchToRegister }: Props) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setEmail(""); setPassword(""); setCaptchaToken(null); setLoading(false);
      submittingRef.current = false;
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!captchaToken) {
      toast.error(t("auth.captcha_required", "Please complete the captcha challenge first"));
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    const result = await performEmailSignIn({ email, password, captchaToken });
    if (!result.ok) {
      const kind = result.kind;
      toast.error(
        kind === "captcha"
          ? t("auth.captcha_failed", "Captcha verification failed — please try again")
          : t("auth.invalid_credentials", "Invalid email or password"),
      );
      setCaptchaToken(null);
      resetTurnstile();
      setLoading(false);
      submittingRef.current = false;
      return;
    }
    // Resume the intended URL if one was recorded, otherwise stay put.
    const pending = readPendingAction();
    clearPendingAction();
    onOpenChange(false);
    if (pending?.href) navigate(pending.href);
    setLoading(false);
    submittingRef.current = false;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-surface="marketplace">
        <DialogHeader>
          <DialogTitle className="font-heading text-[22px] text-[hsl(var(--mkt-ink))]">
            {t("auth.welcome_back", "Welcome back")}
          </DialogTitle>
          <DialogDescription className="text-[hsl(var(--mkt-ink-muted))]">
            {t("auth.subtitle", "Log in to continue booking your cleaner.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          <div className="space-y-1.5">
            <Label htmlFor="mc-login-email">{t("auth.email", "Email")}</Label>
            <Input
              id="mc-login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-login-password">{t("auth.password", "Password")}</Label>
            <Input
              id="mc-login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <Turnstile onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} action="signin" theme="light" />

          <Button
            type="submit"
            disabled={loading || !captchaToken}
            className="w-full bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] hover:bg-[hsl(var(--mkt-brand-hover))]"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("auth.sign_in", "Log in")}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { onOpenChange(false); navigate("/login?mode=forgot"); }}
              className="text-[hsl(var(--mkt-brand))] hover:underline"
            >
              {t("auth.forgot", "Forgot password?")}
            </button>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-[hsl(var(--mkt-ink-muted))] hover:text-[hsl(var(--mkt-ink))] hover:underline"
            >
              {t("auth.no_account", "Create a profile")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
