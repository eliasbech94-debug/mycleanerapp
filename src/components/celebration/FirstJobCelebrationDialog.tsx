import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import videoAsset from "@/assets/mycleaner-first-job.mp4.asset.json";
import posterAsset from "@/assets/mycleaner-first-job-poster.jpg.asset.json";
import CelebrationConfetti from "./CelebrationConfetti";

export type FirstJobCloseReason = "close" | "dashboard";

export type FirstJobCelebrationDialogProps = {
  open: boolean;
  bookingId?: string | null;
  onClose: (reason: FirstJobCloseReason) => void;
};

/**
 * Provider celebration popup shown exactly once, after the first completed and
 * paid booking. Radix Dialog gives focus trapping, ESC-to-close and correct
 * ARIA wiring out of the box.
 */
export function FirstJobCelebrationDialog({ open, bookingId, onClose }: FirstJobCelebrationDialogProps) {
  const { t } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    trackEvent("first_job_popup_opened", { booking_id: bookingId ?? null });
  }, [open, bookingId]);

  // Autoplay muted; always stop and reset when the popup closes/unmounts.
  useEffect(() => {
    const el = videoRef.current;
    if (!open || !el) return;
    el.muted = true;
    void el.play().catch(() => {
      /* Safari/iOS may refuse — poster + replay button stay available */
    });
    return () => {
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
    trackEvent("first_job_video_started", { booking_id: bookingId ?? null });
  }, [bookingId]);

  const handleEnded = useCallback(() => {
    setEnded(true);
    trackEvent("first_job_video_completed", { booking_id: bookingId ?? null });
  }, [bookingId]);

  const replay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setEnded(false);
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, []);

  const close = useCallback(
    (reason: FirstJobCloseReason) => {
      const el = videoRef.current;
      try {
        el?.pause();
      } catch {
        /* noop */
      }
      trackEvent(reason === "dashboard" ? "first_job_dashboard_clicked" : "first_job_popup_closed", {
        booking_id: bookingId ?? null,
      });
      onClose(reason);
    },
    [bookingId, onClose],
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close("close");
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-labelledby="first-job-title"
          aria-describedby="first-job-desc"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden bg-card text-card-foreground shadow-2xl",
            // Mobile: near fullscreen. Desktop: narrow modal with vertical video.
            "h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] rounded-3xl border border-border",
            "sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[min(100vw-2rem,26rem)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          {open && <CelebrationConfetti />}

          <DialogPrimitive.Close
            aria-label={t("first_job_popup.close", "Luk")}
            onClick={() => close("close")}
            className="absolute right-3 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm ring-offset-background transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>

          {!failed && (
            <div className="relative aspect-[9/16] max-h-[46dvh] w-full shrink-0 overflow-hidden bg-muted">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                src={videoAsset.url}
                poster={posterAsset.url}
                preload="metadata"
                muted
                playsInline
                loop={false}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
                onError={() => setFailed(true)}
                aria-label={t("first_job_popup.video_label", "MyCleaner fejringsvideo")}
              />
              {ended && (
                <button
                  type="button"
                  onClick={replay}
                  className="absolute bottom-3 left-3 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-background/85 px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t("first_job_popup.replay", "Se igen")}
                </button>
              )}
            </div>
          )}

          <div className="relative z-30 flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            <DialogPrimitive.Title id="first-job-title" className="text-xl font-bold tracking-tight">
              {t("first_job_popup.title", "🎉 Tillykke!")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="first-job-desc" className="text-sm leading-relaxed text-muted-foreground">
              {t("first_job_popup.body")}
            </DialogPrimitive.Description>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("first_job_popup.support")}</p>
            <p className="text-sm font-medium leading-relaxed">{t("first_job_popup.thanks")}</p>

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button size="lg" className="w-full rounded-full" onClick={() => close("dashboard")}>
                {t("first_job_popup.cta_dashboard", "Fortsæt til dashboard")}
              </Button>
              <Button
                variant="ghost"
                className="w-full rounded-full text-muted-foreground"
                onClick={() => close("close")}
              >
                {t("first_job_popup.close", "Luk")}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default FirstJobCelebrationDialog;
