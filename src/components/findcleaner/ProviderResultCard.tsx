import { forwardRef } from "react";
import { Star, ShieldCheck, Clock, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/countries";
import { getCountry } from "@/lib/providers";
import type { PublicProvider } from "@/lib/providerSearch";
import ProviderStatusPill from "@/components/provider/status/ProviderStatusPill";
import type { ProviderLiveStatus } from "@/lib/providerStatus";

type Props = {
  provider: PublicProvider;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  /** Resolved by the parent list via `useProviderLiveStatuses`. */
  liveStatus?: ProviderLiveStatus | null;
};

/**
 * Result card. Shows only public location data — city/area and the distance
 * from the customer's chosen cleaning location, never a street address.
 */
export const ProviderResultCard = forwardRef<HTMLButtonElement, Props>(function ProviderResultCard(
  { provider, selected, hovered, onSelect, onHover, liveStatus = null },
  ref,
) {
  const initials = provider.displayName.slice(0, 2).toUpperCase();
  return (
    <button
      ref={ref}
      type="button"
      data-testid={`provider-card-${provider.userId}`}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
          : hovered
            ? "border-primary/50 bg-muted/50"
            : "border-border bg-background hover:bg-muted/40"
      }`}
    >
      <Avatar className="h-16 w-16 rounded-xl">
        <AvatarImage src={provider.avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="rounded-xl">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{provider.displayName}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {provider.publicArea ?? provider.countryCode} · {provider.distanceKm.toFixed(1)} km
            </p>
          </div>
          {provider.priceFrom != null && (
            <p className="whitespace-nowrap text-sm font-semibold">
              {formatPrice(provider.priceFrom, getCountry(provider.countryCode))}
              <span className="text-xs font-normal text-muted-foreground">/t</span>
            </p>
          )}
        </div>
        {liveStatus && <ProviderStatusPill status={liveStatus} size="sm" className="mt-1.5" />}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-hidden="true" />
            {provider.rating.toFixed(2)}
            <span className="text-muted-foreground">({provider.reviews})</span>
          </span>
          {provider.verified && (
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verificeret
            </Badge>
          )}
          {provider.avgResponseMinutes != null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {provider.avgResponseMinutes} min
            </span>
          )}
          {provider.coversLocation && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              Dækker din adresse
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
});

export default ProviderResultCard;
