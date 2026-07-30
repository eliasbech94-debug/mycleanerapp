import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CASH_INCOME_WARNING,
  DUPLICATE_WARNING_TEXT,
  EXTERNAL_INCOME_PAYMENT_STATUS_LABELS,
  EXTERNAL_INCOME_RESPONSIBILITY_TEXT,
  EXTERNAL_INCOME_SOURCE_LABELS,
  findPossibleDuplicates,
  showIndirectTaxModule,
  validatePlatformPayout,
  type AccountingRulePack,
  type ExternalIncomeInput,
  type ExternalIncomePaymentMethod,
  type ExternalIncomePaymentStatus,
  type ExternalIncomeSourceType,
  type ProviderAccountingProfile,
} from "@/lib/accounting";
import { parseAmountToMinor } from "@/lib/accounting/externalIncomeImport";

export interface AddExternalIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderAccountingProfile;
  rulePack: AccountingRulePack | null;
  accountingCurrency: string | null;
  existing: ExternalIncomeInput[];
  onSubmit: (item: ExternalIncomeInput) => void;
}

/** UI suggestions only. No platform ever carries a tax rule of its own. */
const PLATFORM_SUGGESTIONS = ["Platform A", "Platform B", "Platform C"];

export default function AddExternalIncomeDialog({
  open,
  onOpenChange,
  provider,
  rulePack,
  accountingCurrency,
  existing,
  onSubmit,
}: AddExternalIncomeDialogProps) {
  const [sourceType, setSourceType] = useState<ExternalIncomeSourceType>("other_platform");
  const [platformName, setPlatformName] = useState("");
  const [customerReference, setCustomerReference] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [incomeDate, setIncomeDate] = useState("");
  const [serviceFrom, setServiceFrom] = useState("");
  const [serviceTo, setServiceTo] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(accountingCurrency ?? "");
  const [exchangeRate, setExchangeRate] = useState("");
  const [exchangeRateDate, setExchangeRateDate] = useState("");
  const [exchangeRateSource, setExchangeRateSource] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExternalIncomePaymentMethod>("bank_transfer");
  const [paymentStatus, setPaymentStatus] = useState<ExternalIncomePaymentStatus>("paid");
  const [hasDocumentation, setHasDocumentation] = useState(false);
  const [cashReviewed, setCashReviewed] = useState(false);
  const [notes, setNotes] = useState("");
  const [duplicateReason, setDuplicateReason] = useState("");

  // Platform payout breakdown
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("");
  const [taxWithheld, setTaxWithheld] = useState("");
  const [net, setNet] = useState("");
  const [payoutDate, setPayoutDate] = useState("");
  const [payoutReference, setPayoutReference] = useState("");

  const showTax = showIndirectTaxModule(rulePack, provider);
  const isPlatform = sourceType === "other_platform";
  const isCash = sourceType === "cash" || paymentMethod === "cash";
  const isOwnCustomer = sourceType === "own_customer" || sourceType === "invoice";
  const foreignCurrency = !!currency && !!accountingCurrency && currency !== accountingCurrency;

  const amountMinor = parseAmountToMinor(amount);

  const payout = useMemo(() => {
    if (!isPlatform) return null;
    const g = parseAmountToMinor(gross);
    const f = parseAmountToMinor(fee);
    const t = parseAmountToMinor(taxWithheld);
    const n = parseAmountToMinor(net);
    if (g == null || n == null) return null;
    return {
      payoutPeriodFrom: serviceFrom || null,
      payoutPeriodTo: serviceTo || null,
      payoutDate: payoutDate || null,
      payoutReference: payoutReference || null,
      grossIncomeMinor: g,
      platformFeeMinor: f ?? 0,
      taxWithheldMinor: t ?? 0,
      netPayoutMinor: n,
    };
  }, [isPlatform, gross, fee, taxWithheld, net, serviceFrom, serviceTo, payoutDate, payoutReference]);

  const payoutValidation = payout ? validatePlatformPayout(payout) : null;

  const draft: ExternalIncomeInput | null = useMemo(() => {
    if (!incomeDate || amountMinor == null || !currency) return null;
    return {
      id: `new-${incomeDate}-${amountMinor}`,
      incomeSourceType: sourceType,
      sourceName: platformName || null,
      platformName: isPlatform ? platformName || null : null,
      customerReference: customerReference || null,
      incomeDate,
      serviceDateFrom: serviceFrom || null,
      serviceDateTo: serviceTo || null,
      description: description || EXTERNAL_INCOME_SOURCE_LABELS[sourceType],
      originalAmountMinor: amountMinor,
      originalCurrency: currency.toUpperCase(),
      accountingAmountMinor: foreignCurrency ? null : amountMinor,
      accountingCurrency: foreignCurrency ? null : currency.toUpperCase(),
      exchangeRate: exchangeRate || null,
      exchangeRateDate: exchangeRateDate || null,
      exchangeRateSource: exchangeRateSource || null,
      indirectTaxIncluded: showTax ? true : null,
      taxRate: null,
      taxAmountMinor: null,
      taxCode: null,
      taxJurisdiction: null,
      taxTreatment: null,
      paymentMethod,
      paymentStatus,
      documentationStatus: hasDocumentation ? "uploaded" : "missing",
      notes: notes || null,
      recordStatus: "ready",
      reviewRequired: false,
      cashReviewedByProvider: isCash ? cashReviewed : undefined,
      invoiceNumber: invoiceNumber || null,
      documentHashes: [],
      payout,
    };
  }, [
    incomeDate,
    amountMinor,
    currency,
    sourceType,
    platformName,
    isPlatform,
    customerReference,
    serviceFrom,
    serviceTo,
    description,
    foreignCurrency,
    exchangeRate,
    exchangeRateDate,
    exchangeRateSource,
    showTax,
    paymentMethod,
    paymentStatus,
    hasDocumentation,
    notes,
    isCash,
    cashReviewed,
    invoiceNumber,
    payout,
  ]);

  const duplicates = draft ? findPossibleDuplicates(draft, existing) : [];
  const needsReason = duplicates.length > 0 && duplicateReason.trim().length === 0;
  const canSubmit = !!draft && !needsReason;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tilføj indkomst</DialogTitle>
          <DialogDescription>{EXTERNAL_INCOME_RESPONSIBILITY_TEXT}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Hvor kommer indkomsten fra?">
            <Select
              value={sourceType}
              onValueChange={(v) => setSourceType(v as ExternalIncomeSourceType)}
            >
              <SelectTrigger aria-label="Indkomstkilde">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXTERNAL_INCOME_SOURCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isCash && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{CASH_INCOME_WARNING}</span>
            </div>
          )}

          {isPlatform && (
            <Field label="Platformens navn" hint="Forslag — skriv gerne et andet navn.">
              <Input
                list="platform-suggestions"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
              />
              <datalist id="platform-suggestions">
                {PLATFORM_SUGGESTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          )}

          {(isOwnCustomer || isCash) && (
            <Field
              label="Kundereference"
              hint="Brug en intern reference frem for fuldt navn, når det er nok."
            >
              <Input
                value={customerReference}
                onChange={(e) => setCustomerReference(e.target.value)}
              />
            </Field>
          )}

          {isOwnCustomer && (
            <Field label="Fakturanummer">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Dato for indkomst">
              <Input
                type="date"
                value={incomeDate}
                onChange={(e) => setIncomeDate(e.target.value)}
              />
            </Field>
            <Field label="Udbetalingsdato">
              <Input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
              />
            </Field>
            <Field label="Serviceperiode fra">
              <Input
                type="date"
                value={serviceFrom}
                onChange={(e) => setServiceFrom(e.target.value)}
              />
            </Field>
            <Field label="Serviceperiode til">
              <Input type="date" value={serviceTo} onChange={(e) => setServiceTo(e.target.value)} />
            </Field>
          </div>

          <Field label="Beskrivelse">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Beløb">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Valuta">
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </Field>
          </div>

          {foreignCurrency && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Beløbet er i en anden valuta end dit regnskab ({accountingCurrency}). Uden kurs
                tæller posten ikke med i det endelige resultat.
              </p>
              <Field label="Kurs">
                <Input value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
              </Field>
              <Field label="Kursdato">
                <Input
                  type="date"
                  value={exchangeRateDate}
                  onChange={(e) => setExchangeRateDate(e.target.value)}
                />
              </Field>
              <Field label="Kurskilde">
                <Input
                  value={exchangeRateSource}
                  onChange={(e) => setExchangeRateSource(e.target.value)}
                />
              </Field>
            </div>
          )}

          {isPlatform && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">Udbetaling fra platformen</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bruttobeløb">
                  <Input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
                </Field>
                <Field label="Platformgebyr">
                  <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
                </Field>
                <Field label="Skat eller moms trukket">
                  <Input
                    inputMode="decimal"
                    value={taxWithheld}
                    onChange={(e) => setTaxWithheld(e.target.value)}
                  />
                </Field>
                <Field label="Nettobeløb modtaget">
                  <Input inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} />
                </Field>
              </div>
              <Field label="Payout-reference">
                <Input
                  value={payoutReference}
                  onChange={(e) => setPayoutReference(e.target.value)}
                />
              </Field>
              {payoutValidation && !payoutValidation.ok && (
                <p role="alert" className="text-sm text-destructive">
                  {payoutValidation.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Betalingsmetode">
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as ExternalIncomePaymentMethod)}
              >
                <SelectTrigger aria-label="Betalingsmetode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bankoverførsel</SelectItem>
                  <SelectItem value="cash">Kontant</SelectItem>
                  <SelectItem value="card">Kort</SelectItem>
                  <SelectItem value="platform_payout">Platformudbetaling</SelectItem>
                  <SelectItem value="invoice">Faktura</SelectItem>
                  <SelectItem value="other">Andet</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Betalingsstatus">
              <Select
                value={paymentStatus}
                onValueChange={(v) => setPaymentStatus(v as ExternalIncomePaymentStatus)}
              >
                <SelectTrigger aria-label="Betalingsstatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXTERNAL_INCOME_PAYMENT_STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={hasDocumentation}
              onCheckedChange={(v) => setHasDocumentation(v === true)}
            />
            Jeg har vedhæftet dokumentation (faktura, kvittering, bankbilag eller payout-oversigt)
          </label>

          {isCash && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={cashReviewed} onCheckedChange={(v) => setCashReviewed(v === true)} />
              Jeg har gennemgået den kontante post
            </label>
          )}

          <Field label="Noter">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>

          {duplicates.length > 0 && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              <p className="font-medium text-destructive">{DUPLICATE_WARNING_TEXT}</p>
              <p className="text-xs text-muted-foreground">
                Matcher på: {duplicates[0].matchedOn.join(", ")}
              </p>
              <Field label="Begrundelse for at fortsætte">
                <Input
                  value={duplicateReason}
                  onChange={(e) => setDuplicateReason(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (!draft) return;
              onSubmit({
                ...draft,
                duplicateOverrideReason: duplicateReason.trim() || null,
              });
            }}
          >
            Gem indkomst
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
