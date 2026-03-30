export interface Country {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  flag: string;
  minHourlyRate: number; // Minimum hourly rate in local currency
  vatRate: number;
  laborAgreement: string;
}

export const countries: Country[] = [
  { code: "DK", name: "Danmark", currency: "DKK", currencySymbol: "kr", locale: "da-DK", flag: "🇩🇰", minHourlyRate: 140, vatRate: 0.25, laborAgreement: "Dansk overenskomst" },
  { code: "SE", name: "Sverige", currency: "SEK", currencySymbol: "kr", locale: "sv-SE", flag: "🇸🇪", minHourlyRate: 135, vatRate: 0.25, laborAgreement: "Svensk kollektivavtal" },
  { code: "NO", name: "Norge", currency: "NOK", currencySymbol: "kr", locale: "nb-NO", flag: "🇳🇴", minHourlyRate: 175, vatRate: 0.25, laborAgreement: "Norsk tariffavtale" },
  { code: "DE", name: "Deutschland", currency: "EUR", currencySymbol: "€", locale: "de-DE", flag: "🇩🇪", minHourlyRate: 12, vatRate: 0.19, laborAgreement: "Mindestlohngesetz" },
  { code: "NL", name: "Nederland", currency: "EUR", currencySymbol: "€", locale: "nl-NL", flag: "🇳🇱", minHourlyRate: 13, vatRate: 0.21, laborAgreement: "CAO" },
  { code: "FR", name: "France", currency: "EUR", currencySymbol: "€", locale: "fr-FR", flag: "🇫🇷", minHourlyRate: 12, vatRate: 0.20, laborAgreement: "SMIC" },
  { code: "ES", name: "España", currency: "EUR", currencySymbol: "€", locale: "es-ES", flag: "🇪🇸", minHourlyRate: 8, vatRate: 0.21, laborAgreement: "Convenio colectivo" },
  { code: "IT", name: "Italia", currency: "EUR", currencySymbol: "€", locale: "it-IT", flag: "🇮🇹", minHourlyRate: 9, vatRate: 0.22, laborAgreement: "CCNL" },
  { code: "UK", name: "United Kingdom", currency: "GBP", currencySymbol: "£", locale: "en-GB", flag: "🇬🇧", minHourlyRate: 11, vatRate: 0.20, laborAgreement: "National Minimum Wage" },
  { code: "FI", name: "Suomi", currency: "EUR", currencySymbol: "€", locale: "fi-FI", flag: "🇫🇮", minHourlyRate: 11, vatRate: 0.24, laborAgreement: "TES" },
  { code: "PL", name: "Polska", currency: "PLN", currencySymbol: "zł", locale: "pl-PL", flag: "🇵🇱", minHourlyRate: 28, vatRate: 0.23, laborAgreement: "Ustawa o min. wynagrodzeniu" },
  { code: "AT", name: "Österreich", currency: "EUR", currencySymbol: "€", locale: "de-AT", flag: "🇦🇹", minHourlyRate: 12, vatRate: 0.20, laborAgreement: "Kollektivvertrag" },
];

export const serviceCategories = [
  {
    id: "cleaning",
    name: "Rengøring",
    icon: "✨",
    description: "Hjemmerengøring, erhvervsrengøring, vinduespudsning",
    subcategories: ["Hjemmerengøring", "Erhvervsrengøring", "Vinduespudsning", "Dybrengøring", "Flytterengøring"],
  },
  {
    id: "handyman",
    name: "Håndværk",
    icon: "🔧",
    description: "Maler, tømrer, VVS, elektriker",
    subcategories: ["Malerarbejde", "Tømrerarbejde", "VVS", "Elektriker", "Gulvlægning", "Flisearbejde"],
  },
  {
    id: "garden",
    name: "Have & udendørs",
    icon: "🌿",
    description: "Havearbejde, plæneklipning, snerydning",
    subcategories: ["Plæneklipning", "Hækklipning", "Haveanlæg", "Snerydning", "Terrasse & fliser"],
  },
  {
    id: "moving",
    name: "Flytning & transport",
    icon: "📦",
    description: "Flyttehjælp, møbelsamling, transport",
    subcategories: ["Boligflytning", "Kontorflytning", "Møbelsamling", "Bortskaffelse", "Piano/tungt gods"],
  },
];

export const formatPrice = (amount: number, country: Country): string => {
  return new Intl.NumberFormat(country.locale, {
    style: "currency",
    currency: country.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};
