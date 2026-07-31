/**
 * LocationPicker — manual area selection. Options come exclusively from
 * `market_places` for the active market; nothing is hardcoded.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation } from "@/context/LocationContext";

interface Props {
  className?: string;
  /** Renders a compact trigger for headers / toolbars. */
  compact?: boolean;
}

export function LocationPicker({ className, compact }: Props) {
  const { t } = useTranslation();
  const { location, placesForActiveMarket, setPlace, loading } = useLocation();

  const options = useMemo(
    () => [...placesForActiveMarket].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [placesForActiveMarket],
  );

  const label = t("location.picker.label", { defaultValue: "Area" });

  return (
    <div className={className}>
      {!compact && (
        <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="location-picker">
          {label}
        </label>
      )}
      <Select
        value={location.citySlug ?? ""}
        disabled={loading || options.length === 0}
        onValueChange={(slug) => {
          const place = options.find((p) => p.slug === slug);
          if (place) setPlace(place);
        }}
      >
        <SelectTrigger id="location-picker" aria-label={label} className={compact ? "h-9 gap-2" : undefined}>
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue
            placeholder={t("location.picker.placeholder", { defaultValue: "Choose your area" })}
          />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((place) => (
            <SelectItem key={place.id} value={place.slug}>
              {place.name}
              {place.municipality && place.municipality !== place.name ? (
                <span className="text-muted-foreground"> · {place.municipality}</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default LocationPicker;
