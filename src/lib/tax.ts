/**
 * Tax validation + Danish municipality list.
 * - validateCPR: format DDMMYY-XXXX with valid calendar date. (Mod-11 is officially
 *   discontinued by CPR-kontoret and NOT a reliability check anymore.)
 * - validateCVR: 8 digits, mod-11 with weights 2,7,6,5,4,3,2,1.
 */

export const DK_MUNICIPALITIES = [
  "Albertslund","Allerød","Assens","Ballerup","Billund","Bornholm","Brøndby","Brønderslev",
  "Dragør","Egedal","Esbjerg","Fanø","Favrskov","Faxe","Fredensborg","Fredericia",
  "Frederiksberg","Frederikshavn","Frederikssund","Furesø","Faaborg-Midtfyn","Gentofte",
  "Gladsaxe","Glostrup","Greve","Gribskov","Guldborgsund","Haderslev","Halsnæs","Hedensted",
  "Helsingør","Herlev","Herning","Hillerød","Hjørring","Holbæk","Holstebro","Horsens",
  "Hvidovre","Høje-Taastrup","Hørsholm","Ikast-Brande","Ishøj","Jammerbugt","Kalundborg",
  "Kerteminde","Kolding","København","Køge","Langeland","Lejre","Lemvig","Lolland",
  "Lyngby-Taarbæk","Læsø","Mariagerfjord","Middelfart","Morsø","Norddjurs","Nordfyns",
  "Nyborg","Næstved","Odder","Odense","Odsherred","Randers","Rebild","Ringkøbing-Skjern",
  "Ringsted","Roskilde","Rudersdal","Rødovre","Samsø","Silkeborg","Skanderborg","Skive",
  "Slagelse","Solrød","Sorø","Stevns","Struer","Svendborg","Syddjurs","Sønderborg",
  "Thisted","Tønder","Tårnby","Vallensbæk","Varde","Vejen","Vejle","Vesthimmerlands",
  "Viborg","Vordingborg","Ærø","Aabenraa","Aalborg","Aarhus",
];

export const normalizeDigits = (s: string) => (s || "").replace(/\D+/g, "");

export function validateCPR(raw: string): { ok: boolean; error?: string; normalized?: string } {
  const digits = normalizeDigits(raw);
  if (digits.length !== 10) return { ok: false, error: "CPR skal være 10 cifre (DDMMÅÅ-XXXX)" };
  const dd = +digits.slice(0, 2);
  const mm = +digits.slice(2, 4);
  const yy = +digits.slice(4, 6);
  const seq = +digits.slice(6, 10);
  if (mm < 1 || mm > 12) return { ok: false, error: "Ugyldig måned i CPR" };
  if (dd < 1 || dd > 31) return { ok: false, error: "Ugyldig dag i CPR" };
  // 7. ciffer + årstal bestemmer århundrede (CPR-kontorets tabel)
  const c7 = Math.floor(seq / 1000);
  let century = 1900;
  if (c7 <= 3) century = 1900;
  else if (c7 === 4 || c7 === 9) century = yy <= 36 ? 2000 : 1900;
  else century = yy <= 57 ? 2000 : 1800;
  const year = century + yy;
  const d = new Date(year, mm - 1, dd);
  if (d.getFullYear() !== year || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return { ok: false, error: "CPR indeholder en ugyldig dato" };
  }
  const normalized = `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return { ok: true, normalized };
}

export function validateCVR(raw: string): { ok: boolean; error?: string; normalized?: string } {
  const digits = normalizeDigits(raw);
  if (digits.length !== 8) return { ok: false, error: "CVR skal være 8 cifre" };
  if (digits[0] === "0") return { ok: false, error: "CVR må ikke starte med 0" };
  const weights = [2, 7, 6, 5, 4, 3, 2, 1];
  const sum = weights.reduce((acc, w, i) => acc + w * +digits[i], 0);
  if (sum % 11 !== 0) return { ok: false, error: "CVR-nummeret er ikke gyldigt (modulus 11)" };
  return { ok: true, normalized: digits };
}

export function maskTaxId(kind: "private" | "business", encoded: string | null | undefined): string {
  if (!encoded) return "";
  try {
    const raw = decodeURIComponent(escape(atob(encoded)));
    const digits = normalizeDigits(raw);
    if (kind === "private" && digits.length >= 10) return `${digits.slice(0, 6)}-••••`;
    if (kind === "business" && digits.length >= 8) return `••••${digits.slice(-4)}`;
    return "••••••";
  } catch {
    return "••••••";
  }
}

export const encodeTaxId = (raw: string) => btoa(unescape(encodeURIComponent(raw)));
