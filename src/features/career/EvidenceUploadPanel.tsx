import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  careerDb,
  CareerEvidenceDocument,
  CareerEvidenceType,
  isAllowedEvidenceFile,
} from "@/features/career/careerClient";

interface Props {
  evidenceType: CareerEvidenceType;
  recordId: string;
  /** verified records are locked — no delete without a request flow */
  recordVerified: boolean;
}

function statusLabel(status: CareerEvidenceDocument["status"]) {
  switch (status) {
    case "verified":
      return { label: "Godkendt", tone: "bg-emerald-100 text-emerald-800" };
    case "rejected":
      return { label: "Afvist", tone: "bg-red-100 text-red-800" };
    case "under_review":
      return { label: "Under review", tone: "bg-amber-100 text-amber-800" };
    case "more_information_required":
      return { label: "Mere info kræves", tone: "bg-orange-100 text-orange-800" };
    case "expired":
      return { label: "Udløbet", tone: "bg-slate-100 text-slate-700" };
    default:
      return { label: "Afventer", tone: "bg-slate-100 text-slate-700" };
  }
}

export default function EvidenceUploadPanel({ evidenceType, recordId, recordVerified }: Props) {
  const [docs, setDocs] = useState<CareerEvidenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const column = evidenceType === "work_history" ? "work_history_id" : "certification_id";
    const { data, error } = await careerDb
      .from("career_evidence_documents")
      .select(
        "id,user_id,work_history_id,certification_id,storage_path,original_filename,mime_type,size_bytes,evidence_type,status,uploaded_at,reviewed_at,rejection_reason",
      )
      .eq(column, recordId)
      .order("uploaded_at", { ascending: false });
    if (error) toast.error("Kunne ikke hente dokumenter");
    setDocs((data ?? []) as CareerEvidenceDocument[]);
    setLoading(false);
  }, [evidenceType, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file: File) => {
    const check = isAllowedEvidenceFile(file);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    setUploading(true);
    try {
      const initBody: Record<string, unknown> = {
        step: "init",
        mime_type: file.type,
        size_bytes: file.size,
        original_filename: file.name.slice(0, 200),
        evidence_type: evidenceType,
      };
      if (evidenceType === "work_history") initBody.work_history_id = recordId;
      else initBody.certification_id = recordId;

      const { data: init, error: initErr } = await careerDb.functions.invoke(
        "career-evidence-upload",
        { body: initBody },
      );
      if (initErr || !init?.upload_url) {
        throw new Error(initErr?.message ?? init?.error ?? "upload_init_failed");
      }

      const putRes = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`upload_failed_${putRes.status}`);

      const finalizeBody: Record<string, unknown> = {
        step: "finalize",
        storage_path: init.storage_path,
        mime_type: file.type,
        size_bytes: file.size,
        original_filename: file.name.slice(0, 200),
        evidence_type: evidenceType,
      };
      if (evidenceType === "work_history") finalizeBody.work_history_id = recordId;
      else finalizeBody.certification_id = recordId;

      const { error: finErr } = await careerDb.functions.invoke(
        "career-evidence-upload",
        { body: finalizeBody },
      );
      if (finErr) throw new Error(finErr.message);

      toast.success("Dokument uploadet");
      await load();
    } catch (e) {
      toast.error("Upload fejlede", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: CareerEvidenceDocument) => {
    if (doc.status === "verified" || doc.status === "under_review") {
      toast.error("Dokumentet er låst efter review");
      return;
    }
    const { error } = await careerDb
      .from("career_evidence_documents")
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast.error("Kunne ikke slette");
      return;
    }
    setDocs((current) => current.filter((d) => d.id !== doc.id));
  };

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Dokumentation bruges kun til kontrol og vises aldrig offentligt.
        </p>
        <label className="inline-flex">
          <input
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading || recordVerified}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleUpload(f);
            }}
          />
          <span
            className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium ${
              recordVerified ? "cursor-not-allowed opacity-50" : "hover:bg-background"
            }`}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-2 h-3.5 w-3.5" />
            )}
            Upload dokumentation
          </span>
        </label>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Indlæser…
          </div>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen dokumenter uploadet.</p>
        ) : (
          docs.map((d) => {
            const st = statusLabel(d.status);
            const canDelete = d.status !== "verified" && d.status !== "under_review";
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {d.original_filename ?? "Dokument"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.uploaded_at).toLocaleString("da-DK")} ·{" "}
                      {(d.size_bytes / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${st.tone}`}>{st.label}</span>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Fjern dokument"
                      onClick={() => removeDoc(d)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
