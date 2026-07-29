// Email verification result page. Consumes ?token=…&aid=… from the
// verification email and displays a status message. No enumeration:
// invalid/expired/already-verified all render as non-specific outcomes.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { verifyCampaignEmail } from "@/lib/campaigns/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type Result = "loading" | "ok" | "already" | "invalid";

export default function CampaignVerify() {
  const [params] = useSearchParams();
  const [result, setResult] = useState<Result>("loading");

  useEffect(() => {
    const token = params.get("token");
    const aid = params.get("aid");
    if (!token || !aid) { setResult("invalid"); return; }
    (async () => {
      try {
        const r = await verifyCampaignEmail(aid, token);
        setResult(r.status === "already_verified" ? "already" : "ok");
      } catch {
        setResult("invalid");
      }
    })();
  }, [params]);

  return (
    <main className="container mx-auto py-16 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>E-mail verifikation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {result === "loading" && (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verificerer…</span>
          )}
          {result === "ok" && "Tak — din e-mail er nu bekræftet. Vi vender tilbage til dig snarest."}
          {result === "already" && "Denne ansøgning er allerede bekræftet."}
          {result === "invalid" && "Linket er ugyldigt eller udløbet. Anmod om et nyt fra ansøgningsformularen."}
        </CardContent>
      </Card>
    </main>
  );
}
