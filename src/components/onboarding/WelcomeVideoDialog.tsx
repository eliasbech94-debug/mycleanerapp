import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Volume2, VolumeX, RotateCcw } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import videoAsset from "@/assets/mycleaner-welcome.mp4.asset.json";
import posterAsset from "@/assets/mycleaner-welcome-poster.jpg.asset.json";
import type { WelcomeVideoAudience } from "./welcomeVideoEligibility";

export type WelcomeVideoDialogProps = {
  open: boolean;
  audience: WelcomeVideoAudience;
  /** Called with the reason the dialog closed; always marks the video as seen. */
  onClose: (reason: "close" | "skip" | "cta") => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WelcomeVideoDialog({ open, audience, onClose }: WelcomeVideoDialogProps) {
  const { t } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    trackEvent("welcome_video_opened", { audience });
  }, [open, audience]);

  // Autoplay muted (never with sound), unless the user asked for reduced motion.
  useEffect(() => {
    const el = videoRef.current;
    if (!open || !el) return;
    el.muted = true;
    if (!prefersReducedMotion()) {
      void el.play().catch(() => {
        /* iOS/Safari may still refuse — poster + replay button remain usable */
      });
    }
    return () => {
      // Stop and reset on unmount/close so no audio keeps playing.
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* noop */
      }
    };
  }, [open]);

  const handlePlaying = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("welcome_video_started", { audience });
  }, [audience]);

  const handleEnded = useCallback(() => {
    setEnded(true);
    trackEvent("welcome_video_completed", { audience });
  }, [audience]);

  const replay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setEnded(false);
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, []);

  const toggleMuted = useCallback(() => {
    const el = videoRef.current;
    setMuted((prev) => {
      const next = !prev;
      if (el) el.muted = next;
      return next;
    });
  }, []);

  const close = useCallback(
    (reason: "close" | "skip" | "cta") => {
      trackEvent(
        reason === "cta"
          ? "welcome_video_cta_clicked"
          : reason === "skip"
            ? "welcome_video_skipped"
            : "welcome_video_closed",
        { audience },
      );
      onClose(reason);
    },
    [audience, onClose],
  );

  const bodyKey = audience === "provider" ? "body_provider" : "body_customer";
  const ctaKey = audience === "provider" ? "cta_provider" : "cta_customer";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close("close"); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby="welcome-video-desc"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[min(100vw-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl",
            "max-h-[calc(100dvh-1.5rem)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <DialogPrimitive.Close
            aria-label={t("welcome_video.close", "Luk")}
            onClick={() => close("close")}
            className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm ring-offset-background transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>

          {/* Video — fixed 9:16 box, so no layout shift while loading. */}
          {!failed && (
            <div className="relative aspect-[9/16] max-h-[52dvh] w-full shrink-0 overflow-hidden bg-muted">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                src={videoAsset.url}
                poster={posterAsset.url}
                preload="metadata"
                muted={muted}
                playsInline
                autoPlay={false}
                loop={false}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
                onError={() => setFailed(true)}
                aria-label={t("welcome_video.video_label", "MyCleaner velkomstvideo")}
              />

              <button
                type="button"
                onClick={toggleMuted}
                aria-pressed={!muted}
                aria-label={
                  muted
                    ? t("welcome_video.unmute", "Slå lyd til")
                    : t("welcome_video.mute", "Slå lyd fra")
                }
                className="absolute bottom-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
              </button>

              {ended && (
                <button
                  type="button"
                  onClick={replay}
                  className="absolute bottom-3 left-3 inline-flex h-11 items-center gap-2 rounded-full bg-background/85 px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t("welcome_video.replay", "Se igen")}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 overflow-y-auto p-5">
            <DialogPrimitive.Title id="welcome-video-title" className="text-xl font-bold tracking-tight">
              {t("welcome_video.title", "Velkommen til MyCleaner 🎉")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="welcome-video-desc" className="text-sm leading-relaxed text-muted-foreground">
              {t(`welcome_video.${bodyKey}`)}
            </DialogPrimitive.Description>
            <Button size="lg" className="w-full rounded-full" onClick={() => close("cta")}>
              {t(`welcome_video.${ctaKey}`)}
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-full text-muted-foreground"
              onClick={() => close("skip")}
            >
              {t("welcome_video.skip", "Spring over")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default WelcomeVideoDialog;
