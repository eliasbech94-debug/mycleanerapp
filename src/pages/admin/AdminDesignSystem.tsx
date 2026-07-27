// Internal design-system showcase. Admin-only route.
// Documents the tokens and shadcn primitives that the Campaign Engine reuses.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const tokens = [
  ["--primary", "bg-primary text-primary-foreground"],
  ["--secondary", "bg-secondary text-secondary-foreground"],
  ["--muted", "bg-muted text-muted-foreground"],
  ["--accent", "bg-accent text-accent-foreground"],
  ["--destructive", "bg-destructive text-destructive-foreground"],
  ["--card", "bg-card text-card-foreground border border-border"],
];

export default function AdminDesignSystem() {
  return (
    <main className="container py-10 space-y-8">
      <header>
        <h1 className="font-heading text-2xl">MyCleaner Design System</h1>
        <p className="text-sm text-muted-foreground">Intern reference for shared komponenter og tokens brugt af Campaign Engine.</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Farvetokens</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tokens.map(([name, cls]) => (
            <div key={name} className={`rounded-lg p-4 ${cls}`}>
              <div className="text-xs opacity-70">{name}</div>
              <div className="text-sm">Prøve</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Knapper</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Formularer</h2>
        <div className="max-w-sm space-y-2">
          <label className="text-sm">Label</label>
          <Input placeholder="Placeholder" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Cards</h2>
        <Card className="max-w-md">
          <CardHeader><CardTitle>Card titel</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Standard card layout brugt af alle kampagne blocks.</CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">Alerts</h2>
        <Alert><AlertDescription>Neutral information</AlertDescription></Alert>
        <Alert variant="destructive"><AlertDescription>Fejl / advarsel</AlertDescription></Alert>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg">Campaign block katalog</h2>
        <ul className="text-sm list-disc pl-5 space-y-1 text-muted-foreground">
          <li><code>hero</code>, <code>text</code>, <code>richtext</code>, <code>image</code></li>
          <li><code>benefits</code> — læser fra <code>campaign_benefits</code></li>
          <li><code>testimonials</code> — læser fra <code>campaign_testimonials</code></li>
          <li><code>faq</code> — læser fra <code>campaign_faq</code></li>
          <li><code>cta</code> — indlejrer <code>CampaignApplicationForm</code></li>
          <li><code>cards</code>, <code>countdown</code>, <code>counter</code></li>
        </ul>
      </section>
    </main>
  );
}
