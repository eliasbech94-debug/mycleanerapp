import { Star, ShieldCheck, Clock, MapPin, X, CalendarCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/countries";
import { getCountry } from "@/lib/providers";
import type { PublicProvider } from "@/lib/providerSearch";

type Props = {
  provider: PublicProvider;
  /** Next available slot label, already localised by the caller. */
  nextAvailable?: string | null;
  onClose: () => void;
  onViewProfile: () => void;
  onRequestBooking: () => void;
};

/**
 * Airbnb-style map preview. Contains public marketing data only — never the
 * provider's private address or exact coordinates.
 */
export function ProviderMapPreview({
  provider,
  nextAvailable,
  onClose,
  onViewProfile,
  onRequestBooking,
}: Props) {
  return (
    <div
      data-testid="provider-map-preview"
      className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-4 shadow-2xl"
      role="dialog"
      aria-label={provider.displayName}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-16 w-16 rounded-xl">
          <AvatarImage src={provider.avatarUrl ?? undefined} alt="" />
          <AvatarFallback className="rounded-xl">
            {provider.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{provider.displayName}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {provider.publicArea ?? provider.countryCode} · {provider.distanceKm.toFixed(1)} km fra
            din opgave
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-hidden="true" />
              {provider.rating.toFixed(2)}
              <span className="text-muted-foreground">({provider.reviews})</span>
            </span>
            {provider.priceFrom != null && (
              <span className="font-semibold">
                {formatPrice(provider.priceFrom, getCountry(provider.countryCode))}/t
              </span>
            )}
            {provider.verified && (
              <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verificeret
              </Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Luk"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {nextAvailable && (
          <span className="flex items-center gap-1">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /> {nextAvailable}
          </span>
        )}
        {provider.avgResponseMinutes != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Svarer på ca.{" "}
            {provider.avgResponseMinutes} min
          </span>
        )}
      </div>

      {provider.serviceCategories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {provider.serviceCategories.slice(0, 4).map((s) => (
            <Badge key={s} variant="outline" className="px-2 py-0 text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onViewProfile}>
          Se profil
        </Button>
        <Button className="flex-1" onClick={onRequestBooking}>
          Anmod om booking
        </Button>
      </div>
    </div>
  );
}

export default ProviderMapPreview;
