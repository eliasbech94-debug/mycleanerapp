/**
 * "Meet Your Cleaner" — frontend-only data model (Trust Engine Phase 1A).
 *
 * No Supabase calls, no migrations, no storage. The intro video is an optional
 * part of the existing public provider profile model, so components read it
 * through `profile.intro_video` and never hardcode a URL.
 */

export type ProviderIntroVideoStatus = "draft" | "pending" | "approved" | "rejected";

export type ProviderIntroVideo = {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  status: ProviderIntroVideoStatus;
  recordedInMyCleaner: boolean;
  identityVerified: boolean;
  approvedAt?: string;
  language?: string;
  transcript?: string;
};

/** Optional, fixture-backed trust datapoints shown under the video. */
export type ProviderIntroVideoTrust = {
  averageRating?: number | null;
  repeatBookingRate?: number | null;
  completedBookings?: number | null;
  recommended?: boolean | null;
};

/**
 * Public visibility rule: only an approved video may ever be shown to
 * customers. Any other status is development-preview information only.
 */
export function publicIntroVideo(
  video: ProviderIntroVideo | null | undefined,
): ProviderIntroVideo | null {
  if (!video) return null;
  return video.status === "approved" ? video : null;
}

/** The discreet badge requires BOTH an approved video and verified identity. */
export function showsVerifiedBadge(video: ProviderIntroVideo | null | undefined): boolean {
  const v = publicIntroVideo(video);
  return !!v && v.identityVerified === true;
}

export function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
