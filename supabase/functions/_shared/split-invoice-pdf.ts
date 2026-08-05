import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency })
    .format((minor ?? 0) / 100);
}

interface Party {
  name: string;
  address?: string | null;
  taxId?: string | null;
  vat?: string | null;
  country?: string | null;
}

async function renderInvoice(args: {
  title: string;
  subtitle: string;
  invoiceNumber: string;
  issuedAt: string;
  bookingRef: string;
  currency: string;
  issuer: Party;
  recipient: Party;
  description: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  note: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.04, 0.24, 0.23);
  const muted = rgb(0.35, 0.35, 0.35);
  const rule = rgb(0.85, 0.85, 0.85);
  let y = PAGE.height - MARGIN;

  page.drawText("MyCleaner", { x: MARGIN, y, size: 22, font: bold, color: ink });
  page.drawText(args.title, { x: MARGIN, y: y - 24, size: 14, font: bold, color: ink });
  page.drawText(args.subtitle, { x: MARGIN, y: y - 40, size: 9, font, color: muted });
  y -= 72;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.5, color: rule });
  y -= 22;

  const drawParty = (label: string, party: Party, x: number) => {
    let yy = y;
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: muted });
    yy -= 14;
    page.drawText(party.name || "—", { x, y: yy, size: 10, font: bold, color: ink, maxWidth: 220 });
    for (const line of [party.address, party.country, party.vat ? `VAT: ${party.vat}` : null, party.taxId ? `Tax ID: ${party.taxId}` : null].filter(Boolean) as string[]) {
      yy -= 12;
      page.drawText(line, { x, y: yy, size: 8.5, font, color: ink, maxWidth: 220 });
    }
    return yy;
  };

  const leftY = drawParty("Udsteder", args.issuer, MARGIN);
  const rightY = drawParty("Modtager", args.recipient, PAGE.width / 2 + 10);
  y = Math.min(leftY, rightY) - 28;

  const meta = [
    ["Fakturanummer", args.invoiceNumber],
    ["Udstedt", new Date(args.issuedAt).toLocaleDateString("da-DK")],
    ["Booking reference", args.bookingRef],
  ];
  for (const [label, value] of meta) {
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: muted });
    page.drawText(value, { x: MARGIN + 140, y, size: 9, font: label === "Fakturanummer" ? bold : font, color: ink });
    y -= 14;
  }

  y -= 12;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.5, color: rule });
  y -= 20;
  page.drawText("Beskrivelse", { x: MARGIN, y, size: 9, font: bold, color: muted });
  page.drawText("Beløb", { x: PAGE.width - MARGIN - 95, y, size: 9, font: bold, color: muted });
  y -= 18;
  page.drawText(args.description, { x: MARGIN, y, size: 10, font, color: ink, maxWidth: 370 });
  page.drawText(money(args.subtotal, args.currency), { x: PAGE.width - MARGIN - 95, y, size: 10, font, color: ink });
  y -= 30;

  const totals = [
    ["Subtotal", money(args.subtotal, args.currency)],
    [`Moms (${args.vatRate.toFixed(2)}%)`, money(args.vatAmount, args.currency)],
    ["Total", money(args.total, args.currency)],
  ];
  for (const [label, value] of totals) {
    const isTotal = label === "Total";
    page.drawText(label, { x: PAGE.width - MARGIN - 220, y, size: 10, font: isTotal ? bold : font, color: ink });
    page.drawText(value, { x: PAGE.width - MARGIN - 95, y, size: 10, font: isTotal ? bold : font, color: ink });
    y -= 15;
  }

  y -= 24;
  page.drawText(args.note, { x: MARGIN, y, size: 8, font, color: muted, maxWidth: PAGE.width - MARGIN * 2, lineHeight: 11 });
  page.drawText(`MyCleaner • ${args.invoiceNumber} • ${args.bookingRef}`, {
    x: MARGIN, y: MARGIN - 12, size: 7, font, color: muted,
  });

  return pdf.save();
}

export function renderCustomerPlatformFeeInvoice(args: {
  invoiceNumber: string; issuedAt: string; bookingRef: string; currency: string;
  subtotal: number; vatRate: number; vatAmount: number; total: number;
  platform: Party; customer: Party;
}): Promise<Uint8Array> {
  return renderInvoice({
    title: "Platformgebyr-faktura",
    subtitle: "MyCleaner kundeservice- og bookinggebyr",
    invoiceNumber: args.invoiceNumber,
    issuedAt: args.issuedAt,
    bookingRef: args.bookingRef,
    currency: args.currency,
    issuer: args.platform,
    recipient: args.customer,
    description: `Kundeplatformgebyr 14% — booking ${args.bookingRef}`,
    subtotal: args.subtotal,
    vatRate: args.vatRate,
    vatAmount: args.vatAmount,
    total: args.total,
    note: "Denne faktura dækker alene MyCleaners platform-, betalings- og bookingservice. Selve rengøringsydelsen faktureres separat af provideren.",
  });
}

export function renderProviderServiceInvoice(args: {
  invoiceNumber: string; issuedAt: string; bookingRef: string; currency: string;
  subtotal: number; vatRate: number; vatAmount: number; total: number;
  provider: Party; customer: Party; service: string;
}): Promise<Uint8Array> {
  return renderInvoice({
    title: "Faktura for rengøringsydelse",
    subtitle: "Udstedt i providerens navn via MyCleaner",
    invoiceNumber: args.invoiceNumber,
    issuedAt: args.issuedAt,
    bookingRef: args.bookingRef,
    currency: args.currency,
    issuer: args.provider,
    recipient: args.customer,
    description: `${args.service || "Rengøringsydelse"} — booking ${args.bookingRef}`,
    subtotal: args.subtotal,
    vatRate: args.vatRate,
    vatAmount: args.vatAmount,
    total: args.total,
    note: "MyCleaner har teknisk genereret og distribueret dokumentet på providerens vegne. Provideren er den juridiske leverandør af rengøringsydelsen.",
  });
}
