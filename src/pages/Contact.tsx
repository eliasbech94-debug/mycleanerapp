import { Link } from "react-router-dom";
import { Mail, MessageCircle, HelpCircle, ArrowLeft } from "lucide-react";

/**
 * Simple MyCleaner contact page. No backend calls — routes users to the
 * appropriate channel (support email, help center, inbox).
 */
const Contact = () => {
  return (
    <main className="relative min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Tilbage til forsiden
        </Link>

        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
          Kontakt MyCleaner
        </h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          Vi er her for at hjælpe — vælg den kanal, der passer bedst til dig.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href="mailto:support@mycleaner.app"
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-secondary transition-colors"
          >
            <Mail className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">Send os en e-mail</span>
            <span className="text-sm text-muted-foreground">
              support@mycleaner.app — vi svarer normalt inden for 24 timer.
            </span>
          </a>

          <Link
            to="/inbox"
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-secondary transition-colors"
          >
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">Chat med support</span>
            <span className="text-sm text-muted-foreground">
              Log ind og åbn din indbakke for direkte samtale.
            </span>
          </Link>

          <Link
            to="/faq"
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-secondary transition-colors sm:col-span-2"
          >
            <HelpCircle className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">Se ofte stillede spørgsmål</span>
            <span className="text-sm text-muted-foreground">
              De fleste svar findes allerede i vores hjælpecenter.
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
};

export default Contact;
