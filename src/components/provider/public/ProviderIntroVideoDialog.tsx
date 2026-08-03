/**
 * Intro video dialog — centred modal on desktop, near-fullscreen sheet on
 * mobile. Uses the shared Radix dialog (focus trap, Escape, outside click and
 * focus restoration come from the primitive — nothing is rebuilt here).
 *
 * Never autoplays. Playback only starts from the user's own controls.
 */
import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import ProviderIntroVideoTrustSummary from "./ProviderIntroVideoTrustSummary";
import {
  PROVIDER_INTRO_VIDEO_EVENTS,
  trackIntroVideoEvent,
} from "./providerIntroVideoAnalytics";
import type { ProviderIntroVideo, ProviderIntroVideoTrust } from "./providerIntroVideoTypes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: ProviderIntroVideo;
  providerName: string;
  trust: ProviderIntroVideoTrust;
};

export function ProviderIntroVideoDialog({
  open,
  onOpenChange,
  video,
  providerName,
  trust,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(!video.videoUrl);
  const [loading, setLoading] = useState(!!video.videoUrl);
  const firstName = providerName.split(" ")[0] || providerName;

  // Pause + reset whenever the dialog closes so audio never keeps playing.
  useEffect(() => {
    if (open) {
      setFailed(!video.videoUrl);
      setLoading(!!video.videoUrl);
      trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.opened, { videoId: video.id });
      if (!video.videoUrl) {
        trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.failed, { videoId: video.id });
      }
      return;
    }
    const el = videoRef.current;
    if (el) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* jsdom / unsupported media */
      }
    }
  }, [open, video.id, video.videoUrl]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      const el = videoRef.current;
      el?.pause();
      trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.closed, { videoId: video.id });
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="intro-video-dialog"
        className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <DialogTitle className="pr-8 text-lg font-bold text-[hsl(224_72%_18%)]">
          Mød {firstName}
        </DialogTitle>
        <DialogDescription className="text-sm text-[hsl(224_20%_45%)]">
          En kort introduktion, som {firstName} selv har optaget.
        </DialogDescription>

        <div className="overflow-hidden rounded-xl bg-[hsl(224_45%_12%)]">
          {failed ? (
            <div
              data-testid="intro-video-fallback"
              className="flex aspect-video flex-col items-center justify-center gap-2 bg-[hsl(210_60%_96%)] p-6 text-center"
            >
              <VideoOff className="h-6 w-6 text-[hsl(224_20%_45%)]" aria-hidden="true" />
              <p className="text-sm font-semibold text-[hsl(224_72%_18%)]">
                Videoen kan ikke afspilles lige nu
              </p>
              <p className="text-xs text-[hsl(224_20%_45%)]">
                Du kan stadig se {firstName}s profil, priser og ledige tider.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              data-testid="intro-video-player"
              src={video.videoUrl}
              poster={video.thumbnailUrl}
              controls
              preload="metadata"
              playsInline
              className="aspect-video h-auto w-full bg-black"
              onLoadedMetadata={() => setLoading(false)}
              onPlay={() =>
                trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.started, { videoId: video.id })
              }
              onEnded={() =>
                trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.completed, { videoId: video.id })
              }
              onError={() => {
                setLoading(false);
                setFailed(true);
                trackIntroVideoEvent(PROVIDER_INTRO_VIDEO_EVENTS.failed, { videoId: video.id });
              }}
            >
              {video.transcript && <track kind="captions" label={video.language ?? "da"} />}
            </video>
          )}
        </div>

        {loading && !failed && (
          <p data-testid="intro-video-loading" className="text-xs text-[hsl(224_20%_45%)]">
            Indlæser video…
          </p>
        )}

        <ProviderIntroVideoTrustSummary trust={trust} video={video} />
      </DialogContent>
    </Dialog>
  );
}

export default ProviderIntroVideoDialog;
