/**
 * "Mød din cleaner" — play trigger rendered on top of the provider photo.
 * Only rendered when an approved intro video exists (caller decides).
 */
import type { RefObject } from "react";
import { Play } from "lucide-react";
import { formatVideoDuration, type ProviderIntroVideo } from "./providerIntroVideoTypes";

type Props = {
  video: ProviderIntroVideo;
  providerName: string;
  onOpen: () => void;
  triggerRef?: RefObject<HTMLButtonElement>;
};

export function ProviderIntroVideoTrigger({ video, providerName, onOpen, triggerRef }: Props) {
  const firstName = providerName.split(" ")[0] || providerName;
  const duration = formatVideoDuration(video.durationSeconds);

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onOpen}
      data-testid="intro-video-trigger"
      aria-label={`Afspil introduktionsvideo for ${firstName}`}
      className="absolute inset-x-3 bottom-3 z-10 flex min-h-11 items-center gap-2.5 rounded-full bg-white/95 px-3 py-2 text-left shadow-[0_8px_20px_-12px_hsl(222_88%_20%/0.6)] backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(222_88%_42%)] text-white">
        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[hsl(224_72%_18%)]">
        Mød din cleaner
      </span>
      {duration && (
        <span className="shrink-0 text-xs font-medium tabular-nums text-[hsl(224_20%_45%)]">
          {duration}
        </span>
      )}
    </button>
  );
}

export default ProviderIntroVideoTrigger;
