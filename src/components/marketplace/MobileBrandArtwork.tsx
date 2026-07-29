import heroMobileAsset from "@/assets/hero-europe-mobile-v1.jpg.asset.json";

/**
 * MobileBrandArtwork — mobile-only supporting artwork (Europe map + cleaner).
 * Rendered AFTER the Popular Services grid so the booking-first hierarchy is
 * preserved: users see headline → booking card → trust → services within the
 * first viewport, and the brand illustration acts as premium supporting
 * artwork below it. Never renders on md+ (desktop hero owns that surface).
 */
export function MobileBrandArtwork() {
  return (
    <div className="md:hidden px-4 pt-2 pb-1" aria-hidden="true">
      <div
        className="relative isolate overflow-hidden rounded-[22px] shadow-[0_18px_40px_-20px_rgba(6,22,21,0.5)] ring-1 ring-[hsl(var(--mkt-border))]"
        style={{ height: "clamp(170px, 24vh, 210px)" }}
      >
        <img
          src={heroMobileAsset.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[50%_28%]"
          loading="lazy"
          decoding="async"
          width={768}
          height={1024}
        />
      </div>
    </div>
  );
}
