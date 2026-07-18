// Minimal PDF renderer for platform-fee invoices and provider settlement
// statements. Uses pdf-lib (Deno-compatible via npm:) — small footprint,
// deterministic output, no headless-browser dependency.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;

function money(minor: number, currency: string) {
  const value = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

interface LineRow { label: string; value: string; bold?: boolean }

async function renderDoc(opts: {
  title: string;
  subtitle: string;
  disclaimer?: string;
  issuer: { name: string; address?: string; taxId?: string; country?: string };
  recipient: { name: string; address?: string; taxId?: string; vat?: string; country?: string };
  meta: LineRow[];
  lines: Array<{ description: string; amount: string }>;
  totals: LineRow[];
  footer: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.04, 0.24, 0.23);   // deep teal
  const muted = rgb(0.35, 0.35, 0.35);
  const rule = rgb(0.85, 0.85, 0.85);

  let y = A4.height - MARGIN;

  // Header
  page.drawText("MyCleaner", { x: MARGIN, y, size: 22, font: bold, color: ink });
  page.drawText(opts.title, { x: MARGIN, y: y - 22, size: 14, font: bold, color: ink });
  page.drawText(opts.subtitle, { x: MARGIN, y: y - 38, size: 10, font, color: muted });
  y -= 70;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: rule });
  y -= 20;

  // Issuer / Recipient two columns
  const colW = (A4.width - MARGIN * 2 - 20) / 2;
  const drawParty = (label: string, p: typeof opts.issuer, x: number) => {
    let yy = y;
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: muted });
    yy -= 12;
    page.drawText(p.name ?? "—", { x, y: yy, size: 10, font: bold, color: ink });
    yy -= 12;
    for (const line of [p.address, p.country, p.taxId ? `Tax ID: ${p.taxId}` : null].filter(Boolean) as string[]) {
      page.drawText(line, { x, y: yy, size: 9, font, color: ink });
      yy -= 11;
    }
    return yy;
  };
  const yLeft = drawParty("Udsteder", opts.issuer, MARGIN);
  const rRecipient = { ...opts.recipient };
  if (opts.recipient.vat) rRecipient.taxId = `VAT: ${opts.recipient.vat}`;
  const yRight = drawParty("Modtager", rRecipient as any, MARGIN + colW + 20);
  y = Math.min(yLeft, yRight) - 12;

  // Meta rows
  for (const m of opts.meta) {
    page.drawText(m.label, { x: MARGIN, y, size: 9, font, color: muted });
    page.drawText(m.value, { x: MARGIN + 140, y, size: 9, font: m.bold ? bold : font, color: ink });
    y -= 13;
  }

  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: rule });
  y -= 18;

  // Line items header
  page.drawText("Beskrivelse", { x: MARGIN, y, size: 9, font: bold, color: muted });
  page.drawText("Beløb", { x: A4.width - MARGIN - 100, y, size: 9, font: bold, color: muted });
  y -= 14;
  for (const line of opts.lines) {
    page.drawText(line.description, { x: MARGIN, y, size: 10, font, color: ink, maxWidth: 380 });
    page.drawText(line.amount, { x: A4.width - MARGIN - 100, y, size: 10, font, color: ink });
    y -= 16;
  }

  y -= 8;
  page.drawLine({ start: { x: A4.width - MARGIN - 220, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: rule });
  y -= 14;
  for (const t of opts.totals) {
    page.drawText(t.label, { x: A4.width - MARGIN - 220, y, size: 10, font: t.bold ? bold : font, color: ink });
    page.drawText(t.value, { x: A4.width - MARGIN - 100, y, size: 10, font: t.bold ? bold : font, color: ink });
    y -= 14;
  }

  // Disclaimer
  if (opts.disclaimer) {
    y -= 20;
    const lines = opts.disclaimer.split("\n");
    for (const l of lines) {
      page.drawText(l, { x: MARGIN, y, size: 8, font, color: muted, maxWidth: A4.width - MARGIN * 2 });
      y -= 11;
    }
  }

  // Footer
  page.drawText(opts.footer, {
    x: MARGIN, y: MARGIN - 12, size: 7, font, color: muted,
    maxWidth: A4.width - MARGIN * 2,
  });

  return await pdf.save();
}

export async function renderPlatformFeeInvoice(args: {
  invoice_number: string;
  issued_at: string;
  currency: string;
  subtotal: number;   // 28% platform fee, minor units
  vat_rate: number;
  vat_amount: number;
  total: number;
  vat_treatment: string;
  booking_ref: string;
  booking_id: string;
  booking_gross: number;
  commission_pct: number;
  issuer: { name: string; address?: string; taxId?: string; country: string };
  provider: { name: string; address?: string; vat?: string; taxId?: string; country: string };
}): Promise<Uint8Array> {
  const treatmentLabel = args.vat_treatment === "reverse_charge"
    ? "Reverse charge — modtager afregner moms (art. 196 EU-momsdir.)"
    : args.vat_treatment === "outside_scope"
    ? "Uden for EU-momsområdet"
    : args.vat_treatment === "exempt"
    ? "Momsfri"
    : `Standard moms ${args.vat_rate.toFixed(2)}%`;

  const disclaimer =
    "Dette er en platformgebyr-faktura fra MyCleaner til udbyderen for marketplace-kommission (28% af bookingens bruttobeløb). " +
    "Fakturaen omfatter IKKE selve rengøringsydelsen — udbyderen er selv ansvarlig for kundefakturering og momsafregning på leverancen.";

  return renderDoc({
    title: "Platform Fee Invoice",
    subtitle: "Platformgebyr — Marketplace kommission",
    disclaimer,
    issuer: args.issuer,
    recipient: { name: args.provider.name, address: args.provider.address, country: args.provider.country, vat: args.provider.vat, taxId: args.provider.taxId },
    meta: [
      { label: "Fakturanummer", value: args.invoice_number, bold: true },
      { label: "Udstedt", value: new Date(args.issued_at).toLocaleDateString("da-DK") },
      { label: "Booking reference", value: args.booking_ref },
      { label: "Booking ID", value: args.booking_id },
      { label: "Bookingens bruttobeløb", value: money(args.booking_gross, args.currency) },
      { label: "Kommission", value: `${args.commission_pct.toFixed(0)}%` },
      { label: "Momsbehandling", value: treatmentLabel },
    ],
    lines: [
      {
        description: `Platformgebyr ${args.commission_pct.toFixed(0)}% — booking ${args.booking_ref}`,
        amount: money(args.subtotal, args.currency),
      },
    ],
    totals: [
      { label: "Subtotal", value: money(args.subtotal, args.currency) },
      { label: `Moms (${args.vat_rate.toFixed(2)}%)`, value: money(args.vat_amount, args.currency) },
      { label: "Total", value: money(args.total, args.currency), bold: true },
    ],
    footer: `MyCleaner marketplace • Faktura ${args.invoice_number} • Booking ${args.booking_ref}`,
  });
}

export async function renderSettlementStatement(args: {
  statement_number: string;
  issued_at: string;
  currency: string;
  gross: number;
  refund: number;
  platform_fee: number;
  provider_net: number;
  booking_ref: string;
  booking_id: string;
  service_date: string | null;
  service_address: string | null;
  customer: string | null;
  payout_status: string;
  linked_transfer_id: string | null;
  linked_payout_id: string | null;
  issuer: { name: string; address?: string; country: string };
  provider: { name: string; address?: string; vat?: string; taxId?: string; country: string; type: string; vat_registered: boolean };
}): Promise<Uint8Array> {
  const netAfterRefund = Math.max(0, args.gross - args.refund);
  const disclaimer =
    "Provider Settlement Statement / Afregningsoversigt.\n" +
    "Dette dokument er en FINANSIEL AFREGNING mellem MyCleaner (platform) og udbyderen. " +
    "Det er IKKE en momsfaktura og IKKE en salgsfaktura udstedt af MyCleaner på vegne af udbyderen. " +
    "Udbyderen er selv ansvarlig for eventuel kundefakturering, moms- og skatteforpligtelser vedrørende den udførte ydelse.";

  const providerLine = `${args.provider.type === "business" ? "Erhverv" : "Privat"} • ${args.provider.vat_registered ? "Momsregistreret" : "Ikke momsregistreret"}`;

  return renderDoc({
    title: "Provider Settlement Statement",
    subtitle: "Afregningsoversigt — booking",
    disclaimer,
    issuer: args.issuer,
    recipient: {
      name: args.provider.name,
      address: args.provider.address,
      country: args.provider.country,
      vat: args.provider.vat,
      taxId: args.provider.taxId,
    },
    meta: [
      { label: "Statement nr.", value: args.statement_number, bold: true },
      { label: "Udstedt", value: new Date(args.issued_at).toLocaleDateString("da-DK") },
      { label: "Booking reference", value: args.booking_ref },
      { label: "Booking ID", value: args.booking_id },
      { label: "Servicedato", value: args.service_date ?? "—" },
      { label: "Serviceadresse", value: args.service_address ?? "—" },
      { label: "Kunde", value: args.customer ?? "—" },
      { label: "Udbyder-status", value: providerLine },
      { label: "Payout status", value: args.payout_status },
      { label: "Transfer ID", value: args.linked_transfer_id ?? "—" },
      { label: "Payout ID", value: args.linked_payout_id ?? "—" },
    ],
    lines: [
      { description: "Bruttobeløb faktureret kunden", amount: money(args.gross, args.currency) },
      { description: "Refunderet til kunden", amount: `- ${money(args.refund, args.currency)}` },
      { description: "Netto bookingværdi", amount: money(netAfterRefund, args.currency) },
      { description: "MyCleaner platformgebyr (28%)", amount: `- ${money(args.platform_fee, args.currency)}` },
    ],
    totals: [
      { label: "Udbyderens netto payout", value: money(args.provider_net, args.currency), bold: true },
    ],
    footer: `MyCleaner marketplace • Settlement ${args.statement_number} • Booking ${args.booking_ref} • Ikke en momsfaktura`,
  });
}

export async function renderCreditNote(args: {
  credit_note_number: string;
  original_invoice_number: string;
  issued_at: string;
  currency: string;
  reversed_subtotal: number;   // negative platform-fee portion, minor units, positive number
  vat_rate: number;
  reversed_vat_amount: number;
  reversed_total: number;
  vat_treatment: string;
  refund_type: "partial" | "full";
  booking_ref: string;
  booking_id: string;
  refund_amount: number;       // gross customer refund, minor units
  stripe_refund_id: string | null;
  issuer: { name: string; address?: string; taxId?: string; country: string };
  provider: { name: string; address?: string; vat?: string; taxId?: string; country: string };
}): Promise<Uint8Array> {
  const treatmentLabel = args.vat_treatment === "reverse_charge"
    ? "Reverse charge — modtager afregner moms (art. 196 EU-momsdir.)"
    : args.vat_treatment === "outside_scope"
    ? "Uden for EU-momsområdet"
    : args.vat_treatment === "exempt"
    ? "Momsfri"
    : `Standard moms ${args.vat_rate.toFixed(2)}%`;

  const disclaimer =
    `Kreditnota der ophæver ${args.refund_type === "full" ? "hele" : "en del af"} platformgebyrfakturaen ${args.original_invoice_number}. ` +
    "Beløbet krediteres udbyderen som følge af hel/delvis refusion af den underliggende booking. " +
    "Dette dokument dækker udelukkende MyCleaners platformkommission — det er ikke en kreditnota på selve rengøringsydelsen.";

  return renderDoc({
    title: "Credit Note",
    subtitle: `Kreditnota — refusion af platformgebyr (${args.refund_type === "full" ? "fuld" : "delvis"})`,
    disclaimer,
    issuer: args.issuer,
    recipient: { name: args.provider.name, address: args.provider.address, country: args.provider.country, vat: args.provider.vat, taxId: args.provider.taxId },
    meta: [
      { label: "Kreditnota nr.", value: args.credit_note_number, bold: true },
      { label: "Vedrører faktura", value: args.original_invoice_number, bold: true },
      { label: "Udstedt", value: new Date(args.issued_at).toLocaleDateString("da-DK") },
      { label: "Booking reference", value: args.booking_ref },
      { label: "Booking ID", value: args.booking_id },
      { label: "Kunderefusion (brutto)", value: money(args.refund_amount, args.currency) },
      { label: "Stripe refund ID", value: args.stripe_refund_id ?? "—" },
      { label: "Momsbehandling", value: treatmentLabel },
    ],
    lines: [
      {
        description: `Ophævelse af platformgebyr — booking ${args.booking_ref}`,
        amount: `- ${money(args.reversed_subtotal, args.currency)}`,
      },
    ],
    totals: [
      { label: "Krediteret subtotal", value: `- ${money(args.reversed_subtotal, args.currency)}` },
      { label: `Krediteret moms (${args.vat_rate.toFixed(2)}%)`, value: `- ${money(args.reversed_vat_amount, args.currency)}` },
      { label: "Krediteret total", value: `- ${money(args.reversed_total, args.currency)}`, bold: true },
    ],
    footer: `MyCleaner marketplace • Kreditnota ${args.credit_note_number} • Vedr. ${args.original_invoice_number}`,
  });
}
