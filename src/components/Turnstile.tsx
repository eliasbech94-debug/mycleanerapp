import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = "0x4AAAAAAD5P-enOWji6xsqR";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

type Props = {
  onToken: (token: string) => void;
  onExpire?: () => void;
  action?: string;
  theme?: "light" | "dark" | "auto";
};

/**
 * Cloudflare Turnstile widget. Loads via the script tag in index.html.
 * Calls onToken(token) when the challenge is solved. Token is single-use;
 * pass it to supabase.auth.* as `captchaToken` and reset after submission.
 */
export default function Turnstile({ onToken, onExpire, action, theme = "light" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string | null>(null);
  const cbRef = useRef({ onToken, onExpire });
  cbRef.current = { onToken, onExpire };

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const mount = () => {
      if (cancelled || !ref.current) return;
      if (!window.turnstile) {
        if (attempts++ > 100) return;
        setTimeout(mount, 100);
        return;
      }
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        theme,
        callback: (t: string) => cbRef.current.onToken(t),
        "expired-callback": () => cbRef.current.onExpire?.(),
        "error-callback": () => cbRef.current.onExpire?.(),
      });
    };
    mount();
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) {
        try { window.turnstile.remove(idRef.current); } catch { /* noop */ }
      }
    };
  }, [action, theme]);

  return <div ref={ref} className="flex justify-center" />;
}

export function resetTurnstile() {
  try { window.turnstile?.reset(); } catch { /* noop */ }
}
