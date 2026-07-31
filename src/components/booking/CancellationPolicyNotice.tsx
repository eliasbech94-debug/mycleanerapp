/**
 * Shows the concrete cancellation ladder for one booking, including the exact
 * instants at which the refund level changes. Reads the canonical policy from
 * `src/lib/cancellationPolicy.ts` — never hardcode the numbers here.
 */
import { cancellationDeadlines } from "@/lib/cancellationPolicy";

const dtf = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function label(percent: number) {
  if (percent >= 100) return "Fuld refundering";
  if (percent <= 0) return "Ingen refundering";
  return `${percent}% refundering`;
}

export function CancellationPolicyNotice({
  serviceStart,
  className,
}: {
  serviceStart: Date | string | number;
  className?: string;
}) {
  const start = new Date(serviceStart);
  if (Number.isNaN(start.getTime())) return null;
  const tiers = cancellationDeadlines(start);

  return (
    <section className={className} aria-labelledby="cancellation-policy-heading">
      <h2 id="cancellation-policy-heading" className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
        Afbestilling
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {tiers.map(({ tier, until }) => (
          <li key={tier.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-semibold">{label(tier.refundPercent)}</span>
            <span className="opacity-70">
              {until
                ? `hvis du afbestiller senest ${dtf.format(until)}`
                : `hvis du afbestiller efter ${dtf.format(new Date(start.getTime() - tiers[tiers.length - 2].tier.minHoursBeforeStart * 3_600_000))}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs opacity-60">
        Tidspunkterne er beregnet ud fra bookingens start {dtf.format(start)}. Er beløbet endnu ikke hævet,
        annulleres reservationen i stedet, og der opkræves intet. Klager skal indgives senest 48 timer efter
        opgavens planlagte eller registrerede afslutning.
      </p>
    </section>
  );
}
