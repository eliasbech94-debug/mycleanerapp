export default function AccountingDisclaimer({ extra }: { extra?: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p>
        Denne oversigt er et hjælpemiddel baseret på dine registrerede oplysninger, bilag og den
        regelversion, MyCleaner har tilgængelig for dit land.
      </p>
      <p className="mt-2">
        Den er ikke en automatisk skatteindberetning og erstatter ikke rådgivning fra den relevante
        skattemyndighed, en revisor eller anden kvalificeret rådgiver.
      </p>
      <p className="mt-2 font-medium text-foreground">
        Regler kan ændre sig. Kontrollér altid oplysningerne før indberetning.
      </p>
      {extra?.map((line) => (
        <p key={line} className="mt-2">
          {line}
        </p>
      ))}
    </div>
  );
}
