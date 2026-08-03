// Printer-friendly HTML/PDF export for legal documents.
// PDF uses the browser print dialog (no extra dependency, works offline).

export interface ExportDocumentMeta {
  title: string;
  version: string;
  docUid?: string | null;
  updatedAt?: string | null;
  hash?: string | null;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Minimal, dependency-free markdown → HTML for print/export output. */
export function markdownToHtml(md: string): string {
  const lines = (md ?? "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(4, heading[1].length);
      out.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${escapeHtml(ordered[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${escapeHtml(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

export function buildPrintableHtml(meta: ExportDocumentMeta, bodyMd: string): string {
  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)} — MyCleaner</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 44rem; margin: 3rem auto; padding: 0 1.5rem; color: #1a1a1a; line-height: 1.65; }
  h1 { font-size: 1.9rem; margin-bottom: .25rem; }
  h2 { font-size: 1.35rem; margin-top: 2.25rem; }
  h3 { font-size: 1.1rem; margin-top: 1.75rem; }
  .meta { color: #666; font-size: .85rem; margin-bottom: 2.5rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 1rem; }
  code, .hash { font-family: ui-monospace, monospace; font-size: .75rem; word-break: break-all; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(meta.title)}</h1>
<p class="meta">
  ${meta.docUid ? `Dokument-ID: ${escapeHtml(meta.docUid)} · ` : ""}Version ${escapeHtml(meta.version)}
  ${meta.updatedAt ? ` · Senest opdateret ${escapeHtml(new Date(meta.updatedAt).toLocaleDateString("da-DK"))}` : ""}
  ${meta.hash ? `<br /><span class="hash">SHA-256: ${escapeHtml(meta.hash)}</span>` : ""}
</p>
${markdownToHtml(bodyMd)}
</body>
</html>`;
}

export function downloadHtml(meta: ExportDocumentMeta, bodyMd: string, filename: string): void {
  const blob = new Blob([buildPrintableHtml(meta, bodyMd)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Opens a print window rendering the document (used for "Download PDF"). */
export function printAsPdf(meta: ExportDocumentMeta, bodyMd: string): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!win) return;
  win.document.write(buildPrintableHtml(meta, bodyMd));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
