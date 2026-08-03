import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { crispEmbedUrl, crispTokenId } from "@/lib/crisp";

/**
 * The embedded Crisp chatbox.
 *
 * Rendered inline inside MyCleaner's own Support Center — never as a floating
 * popup. The iframe reuses the user's Crisp session token so the conversation
 * is the same one agents see, with all metadata attached by `CrispProvider`.
 */
export function CrispChatPanel({ className }: { className?: string }) {
  const { user, profile } = useAuth();
  const { i18n, t } = useTranslation("common");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  const src = useMemo(
    () =>
      crispEmbedUrl({
        tokenId: crispTokenId(user?.id),
        email: user?.email ?? null,
        nickname: profile?.full_name ?? null,
        locale: i18n.language?.slice(0, 2) ?? "da",
      }),
    [user?.id, user?.email, profile?.full_name, i18n.language],
  );

  // Graceful degradation: if the chatbox has not loaded in 12s, offer email.
  useEffect(() => {
    setReady(false);
    setFailed(false);
    const timer = setTimeout(() => {
      setReady((loaded) => {
        if (!loaded) setFailed(true);
        return loaded;
      });
    }, 12_000);
    return () => clearTimeout(timer);
  }, [src, nonce]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-sm font-medium">
              {t("supportCenter.chat.title", { defaultValue: "MyCleaner Support" })}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {t("supportCenter.chat.secure", { defaultValue: "Sikker og krypteret" })}
          </span>
        </div>

        <div className="relative h-[560px] w-full bg-background">
          {!ready && !failed && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          )}

          {failed ? (
            <div className="absolute inset-0 grid place-content-center gap-3 px-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("supportCenter.chat.unavailable", {
                  defaultValue:
                    "Chatten kunne ikke indlæses lige nu. Prøv igen, eller skriv til os på support@mycleaner.dk.",
                })}
              </p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  {t("supportCenter.chat.retry", { defaultValue: "Prøv igen" })}
                </Button>
                <Button size="sm" asChild>
                  <a href="mailto:support@mycleaner.dk">
                    {t("supportCenter.chat.email", { defaultValue: "Send e-mail" })}
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <iframe
              key={`${src}-${nonce}`}
              src={src}
              title={t("supportCenter.chat.title", { defaultValue: "MyCleaner Support" })}
              className="h-full w-full border-0"
              allow="microphone; camera; autoplay; clipboard-write"
              onLoad={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default CrispChatPanel;
