import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PROVIDER_QUIZ, PROVIDER_QUIZ_PASS_SCORE } from "@/data/providerQuiz";

interface Props {
  onPassed?: () => void;
  className?: string;
}

/** Mandatory provider quiz. Scoring happens server-side only. */
export function ProviderQuizCard({ onPassed, className }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; max: number; passed: boolean } | null>(null);

  const complete = PROVIDER_QUIZ.every((q) => answers[q.id]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-quiz-submit", {
        body: { answers },
      });
      if (error) throw error;
      setResult({ score: data.score, max: data.max, passed: data.passed });
      if (data.passed) {
        toast.success("Flot! Du bestod MyCleaner-testen.");
        onPassed?.();
      } else {
        toast.error(
          `Du fik ${data.score} af ${data.max} rigtige. Du skal have mindst ${PROVIDER_QUIZ_PASS_SCORE} for at bestå.`,
        );
      }
    } catch {
      toast.error("Vi kunne ikke indsende dine svar. Prøv igen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
          MyCleaner-testen
        </CardTitle>
        <CardDescription>
          Svar rigtigt på mindst {PROVIDER_QUIZ_PASS_SCORE} af {PROVIDER_QUIZ.length} spørgsmål.
          Du kan prøve igen, hvis det ikke lykkes første gang.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {PROVIDER_QUIZ.map((q, i) => (
          <fieldset key={q.id} className="space-y-2">
            <legend className="font-medium">
              {i + 1}. {q.question}
            </legend>
            <RadioGroup
              value={answers[q.id] ?? ""}
              onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            >
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <RadioGroupItem value={o.id} id={`${q.id}-${o.id}`} />
                  <Label htmlFor={`${q.id}-${o.id}`} className="font-normal">
                    {o.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        ))}

        {result && (
          <p
            role="status"
            className={`text-sm ${result.passed ? "text-primary" : "text-destructive"}`}
          >
            {result.passed
              ? `Bestået med ${result.score} af ${result.max} rigtige.`
              : `${result.score} af ${result.max} rigtige. Prøv igen.`}
          </p>
        )}

        <Button onClick={submit} disabled={!complete || submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Indsend svar
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProviderQuizCard;
