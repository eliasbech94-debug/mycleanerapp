import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, Download, QrCode, Share2, Loader2, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateSlugFormat, normalizeSlug, slugReasonLabel } from "@/lib/slug";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

type Props = {
  slug: string;
  isPublic: boolean;
  onRenamed?: (newSlug: string) => void;
};

function publicOrigin(): string {
  // Prefer canonical production origin when running on Lovable preview;
  // otherwise use the current origin.
  if (typeof window === "undefined") return "https://www.mycleaner.dk";
  const o = window.location.origin;
  return o.replace(/\/$/, "");
}

export function providerShareUrl(slug: string, src: "provider_direct_link" | "provider_qr" = "provider_direct_link") {
  return `${publicOrigin()}/p/${slug}?src=${src}`;
}

export default function ProviderShareCard({ slug, isPublic, onRenamed }: Props) {
  const shareUrl = useMemo(() => providerShareUrl(slug, "provider_direct_link"), [slug]);
  const qrUrl = useMemo(() => providerShareUrl(slug, "provider_qr"), [slug]);

  const [qrSvg, setQrSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; reason: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // Generate SVG QR
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "H", margin: 1, width: 320 })
      .then((svg) => { if (!cancelled) setQrSvg(svg); })
      .catch(() => { if (!cancelled) setQrSvg(""); });
    return () => { cancelled = true; };
  }, [qrUrl]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link kopieret");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  }, [shareUrl]);

  const shareNative = useCallback(async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "MyCleaner", url: shareUrl });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  }, [shareUrl, copyLink]);

  const downloadSvg = useCallback(() => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `mycleaner-${slug}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [qrSvg, slug]);

  const downloadPng = useCallback(async () => {
    try {
      const dataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: "H", margin: 1, width: 1024,
      });
      triggerDownload(dataUrl, `mycleaner-${slug}.png`);
    } catch {
      toast.error("Kunne ikke lave PNG");
    }
  }, [qrUrl, slug]);

  // Rename flow
  useEffect(() => {
    setAvailability(null);
    if (!renameOpen || !candidate) return;
    const norm = normalizeSlug(candidate);
    const fmt = validateSlugFormat(norm);
    if (fmt.ok === false) {
      setAvailability({ available: false, reason: fmt.reason });
      return;
    }
    if (norm === normalizeSlug(slug)) {
      setAvailability({ available: true, reason: "current" });
      return;
    }
    const handle = setTimeout(async () => {
      setChecking(true);
      const { data, error } = await rpc("check_slug_availability_v1", { _slug: norm });
      setChecking(false);
      if (error) { setAvailability({ available: false, reason: "unknown" }); return; }
      const row = Array.isArray(data) ? data[0] : data;
      setAvailability(row ?? { available: false, reason: "unknown" });
    }, 350);
    return () => clearTimeout(handle);
  }, [candidate, renameOpen, slug]);

  async function submitRename() {
    const norm = normalizeSlug(candidate);
    const fmt = validateSlugFormat(norm);
    if (fmt.ok === false) { toast.error(slugReasonLabel(fmt.reason)); return; }
    setRenaming(true);
    const { data, error } = await rpc("rename_provider_slug_v1", { _new_slug: norm });
    setRenaming(false);
    setConfirmOpen(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("rename_rate_limited")) toast.error("Du kan kun ændre link-navn én gang hver 90. dag.");
      else if (m.includes("slug_unavailable")) toast.error("Navnet er ikke tilgængeligt.");
      else if (m.includes("permission_denied")) toast.error("Du har ikke tilladelse.");
      else toast.error(m || "Kunne ikke omdøbe");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const newSlug = row?.new_slug || norm;
    toast.success("Link-navn opdateret. Det gamle link videresender automatisk.");
    setRenameOpen(false);
    setCandidate("");
    onRenamed?.(newSlug);
  }

  const canSubmit = !!availability?.available && availability.reason !== "current" && !renaming;

  return (
    <Card data-testid="provider-share-card">
      <CardContent className="p-6 space-y-6">
        <div>
          <h3 className="font-serif text-xl">Del din profil</h3>
          <p className="text-sm text-muted-foreground">
            Send dit personlige link til kunder — de kan booke direkte hos dig.
          </p>
        </div>

        {!isPublic && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            Din profil er ikke offentlig endnu. Publicér den i indstillingerne for at kunne dele linket.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="share-link">Dit link</Label>
          <div className="flex gap-2">
            <Input id="share-link" readOnly value={shareUrl} className="font-mono text-xs" />
            <Button type="button" variant="secondary" onClick={copyLink} aria-label="Kopiér link">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="outline" asChild aria-label="Åbn link">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={shareNative}>
              <Share2 className="mr-2 h-4 w-4" />Del
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenameOpen((v) => !v)}>
              Skift link-navn
            </Button>
          </div>
        </div>

        {renameOpen && (
          <div className="rounded-lg border p-4 space-y-3" data-testid="rename-panel">
            <div>
              <Label htmlFor="new-slug">Nyt link-navn</Label>
              <Input
                id="new-slug"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="fx marie-cleans"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Forhåndsvisning: {publicOrigin()}/p/<span className="font-mono">{normalizeSlug(candidate) || "…"}</span>
              </p>
              <div className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite">
                {checking && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Tjekker…</span>}
                {!checking && availability && (
                  availability.available
                    ? <span className="text-green-700">{availability.reason === "current" ? "Dit nuværende navn." : "Ledigt ✓"}</span>
                    : <span className="text-red-600">{slugReasonLabel(availability.reason as never)}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
                    Skift link-navn
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skift dit offentlige link-navn?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dit nuværende link vil videresende automatisk i det uendelige, men trykt materiale (fx QR-koder) bør opdateres. Du kan først skifte igen om 90 dage.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Fortryd</AlertDialogCancel>
                    <AlertDialogAction onClick={submitRename} disabled={renaming}>
                      {renaming ? "Skifter…" : "Ja, skift navn"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" variant="ghost" onClick={() => { setRenameOpen(false); setCandidate(""); }}>
                Annullér
              </Button>
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <div className="flex items-start gap-4">
            <div
              className="h-40 w-40 flex-shrink-0 rounded-md border bg-white p-2"
              aria-label="QR-kode til din offentlige profil"
              data-testid="qr-svg-wrap"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: qrSvg || "" }}
            />
            <div className="flex-1 space-y-2">
              <div className="inline-flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" />QR-kode
              </div>
              <p className="text-xs text-muted-foreground">
                Print eller del billedet — når nogen scanner den, lander de på din profil.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={downloadPng}>
                  <Download className="mr-2 h-4 w-4" />PNG
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={downloadSvg} disabled={!qrSvg}>
                  <Download className="mr-2 h-4 w-4" />SVG
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
