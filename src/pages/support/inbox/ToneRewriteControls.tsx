import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type MyCleanerTone =
  | "standard"
  | "friendly"
  | "empathetic"
  | "professional"
  | "enthusiastic"
  | "legal";

const TONES: Array<{ value: MyCleanerTone; label: string }> = [
  { value: "standard", label: "MyCleaner" },
  { value: "friendly", label: "Venlig" },
  { value: "empathetic", label: "Empatisk" },
  { value: "professional", label: "Professionel" },
  { value: "enthusiastic", label: "Positiv" },
  { value: "legal", label: "Juridisk" },
];

interface Props {
  value: string;
  disabled?: boolean;
  onRewrite: (text: string) => void;
}

export function ToneRewriteControls({ value, disabled, onRewrite }: Props) {
  const [tone, setTone] = useState<MyCleanerTone>("standard");
  const [rewriting, setRewriting] = useState(false);

  const rewrite = async () => {
    const text = value.trim();
    if (!text || disabled || rewriting) return;

    setRewriting(true);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-my-cleaner-tone", {
        body: { text, tone, language: "samme sprog som originalen" },
      });
      if (error) throw error;
      const rewritten = (data as { text?: string })?.text?.trim();
      if (!rewritten) throw new Error("Tomt svar fra tonefunktionen");
      onRewrite(rewritten);
      toast.success("Teksten er rettet til MyCleaner-stil ✨");
    } catch (error) {
      toast.error("Vi kunne ikke forbedre teksten lige nu. Prøv igen.");
      console.error("tone rewrite failed", error);
    } finally {
      setRewriting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        MyCleaner-stil
      </div>
      <select
        value={tone}
        onChange={(event) => setTone(event.target.value as MyCleanerTone)}
        disabled={disabled || rewriting}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        aria-label="Vælg tone"
      >
        {TONES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={rewrite}
        disabled={disabled || rewriting || !value.trim()}
        className="h-8"
      >
        {rewriting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
        {rewriting ? "Retter teksten…" : "Ret til MyCleaner-stil"}
      </Button>
      <span className="text-[10px] text-muted-foreground">
        Gennemlæs altid teksten før afsendelse.
      </span>
    </div>
  );
}
