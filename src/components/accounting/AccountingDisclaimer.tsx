import { useTranslation } from "react-i18next";

export default function AccountingDisclaimer({ extra }: { extra?: string[] }) {
  const { t } = useTranslation("finance");
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p>{t("ui.disclaimer.p1")}</p>
      <p className="mt-2">{t("ui.disclaimer.p2")}</p>
      <p className="mt-2 font-medium text-foreground">{t("ui.disclaimer.p3")}</p>
      {extra?.map((line) => (
        <p key={line} className="mt-2">
          {line}
        </p>
      ))}
    </div>
  );
}
