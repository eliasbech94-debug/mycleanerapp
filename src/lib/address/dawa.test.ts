import { describe, it, expect } from "vitest";
import { parseDawaFull } from "./dawa";

// Minimal DAWA `/adresser/{id}` fixtures — one per sample address the user
// listed. Only the fields our parser reads are populated; DAWA returns much
// more but we don't depend on it.
function fx(opts: {
  id?: string;
  vejnavn: string;
  husnr: string;
  etage?: string | null;
  dør?: string | null;
  postnr: string;
  by: string;
  kommune?: string;
  lng: number;
  lat: number;
  display: string;
}) {
  return {
    id: opts.id ?? "00000000-0000-0000-0000-000000000000",
    adressebetegnelse: opts.display,
    etage: opts.etage ?? null,
    dør: opts.dør ?? null,
    adgangsadresse: {
      vejstykke: { navn: opts.vejnavn },
      husnr: opts.husnr,
      postnummer: { nr: opts.postnr, navn: opts.by },
      kommune: { kode: "0101", navn: opts.kommune ?? "København" },
      adgangspunkt: { koordinater: [opts.lng, opts.lat] as [number, number] },
    },
  };
}

describe("parseDawaFull — six sample addresses", () => {
  it("Sønder Boulevard 18", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Sønder Boulevard",
        husnr: "18",
        postnr: "1720",
        by: "København V",
        lng: 12.549,
        lat: 55.669,
        display: "Sønder Boulevard 18, 1720 København V",
      }),
    );
    expect(r.street).toBe("Sønder Boulevard");
    expect(r.houseNumber).toBe("18");
    expect(r.letter).toBeUndefined();
    expect(r.floor).toBeUndefined();
    expect(r.postalCode).toBe("1720");
    expect(r.city).toBe("København V");
    expect(r.countryCode).toBe("DK");
    expect(r.lat).toBe(55.669);
    expect(r.lng).toBe(12.549);
  });

  it("Sønder Boulevard 18, 1. tv", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Sønder Boulevard",
        husnr: "18",
        etage: "1",
        dør: "tv",
        postnr: "1720",
        by: "København V",
        lng: 12.549,
        lat: 55.669,
        display: "Sønder Boulevard 18, 1. tv, 1720 København V",
      }),
    );
    expect(r.floor).toBe("1");
    expect(r.door).toBe("tv");
    expect(r.side).toBe("tv");
  });

  it("Sønder Boulevard 18A", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Sønder Boulevard",
        husnr: "18A",
        postnr: "1720",
        by: "København V",
        lng: 12.549,
        lat: 55.669,
        display: "Sønder Boulevard 18A, 1720 København V",
      }),
    );
    expect(r.houseNumber).toBe("18");
    expect(r.letter).toBe("A");
  });

  it("Birkeparken 11", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Birkeparken",
        husnr: "11",
        postnr: "5240",
        by: "Odense NØ",
        kommune: "Odense",
        lng: 10.44,
        lat: 55.42,
        display: "Birkeparken 11, 5240 Odense NØ",
      }),
    );
    expect(r.street).toBe("Birkeparken");
    expect(r.houseNumber).toBe("11");
    expect(r.municipality).toBe("Odense");
  });

  it("Tingbjerg Ås 26", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Tingbjerg Ås",
        husnr: "26",
        postnr: "2700",
        by: "Brønshøj",
        lng: 12.489,
        lat: 55.72,
        display: "Tingbjerg Ås 26, 2700 Brønshøj",
      }),
    );
    expect(r.street).toBe("Tingbjerg Ås");
    expect(r.normalized).toContain("tingbjerg aas 26");
  });

  it("Østerbrogade 52, 4. mf", () => {
    const r = parseDawaFull(
      fx({
        vejnavn: "Østerbrogade",
        husnr: "52",
        etage: "4",
        dør: "mf",
        postnr: "2100",
        by: "København Ø",
        lng: 12.577,
        lat: 55.702,
        display: "Østerbrogade 52, 4. mf, 2100 København Ø",
      }),
    );
    expect(r.floor).toBe("4");
    expect(r.side).toBe("mf");
    expect(r.normalized).toContain("oesterbrogade 52 4 mf");
  });
});
