import { useMemo } from "react";

const CALLING_CODES: Record<string, { code: string; flag: string; label: string }> = {
  DK: { code: "+45", flag: "🇩🇰", label: "Danmark" },
  SE: { code: "+46", flag: "🇸🇪", label: "Sverige" },
  ES: { code: "+34", flag: "🇪🇸", label: "España" },
  UK: { code: "+44", flag: "🇬🇧", label: "United Kingdom" },
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function toE164(countryCode: string, localValue: string): string {
  const selected = CALLING_CODES[countryCode] ?? CALLING_CODES.DK;
  const raw = localValue.trim();
  if (raw.startsWith("+")) return `+${digits(raw)}`;
  return `${selected.code}${digits(raw).replace(/^0+/, "")}`;
}

export function InternationalPhoneInput({
  countryCode,
  value,
  onChange,
  onBlur,
}: {
  countryCode: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const selected = CALLING_CODES[countryCode] ?? CALLING_CODES.DK;
  const local = useMemo(() => {
    if (!value) return "";
    return value.startsWith(selected.code) ? value.slice(selected.code.length) : value;
  }, [value, selected.code]);

  return (
    <div className="flex overflow-hidden rounded-lg border bg-white focus-within:ring-2 focus-within:ring-[#168a7a]/30">
      <div className="flex min-w-[92px] items-center gap-2 border-r bg-black/[0.03] px-3 text-sm font-semibold" aria-label={selected.label}>
        <span aria-hidden>{selected.flag}</span>
        <span>{selected.code}</span>
      </div>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="min-h-11 min-w-0 flex-1 bg-transparent px-3 py-2 outline-none"
        value={local}
        placeholder="Telefonnummer"
        onChange={(event) => onChange(toE164(countryCode, event.target.value))}
        onBlur={onBlur}
        aria-label="Telefonnummer"
      />
    </div>
  );
}
