import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-secondary/50">
      <div className="container-wide section-padding">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="gradient-hero rounded-xl w-8 h-8 flex items-center justify-center">
                <span className="text-primary-foreground font-heading font-bold">H</span>
              </div>
              <span className="font-heading font-bold text-lg">HomeHero</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Europas smarteste platform for hjemmeservice. Find de bedste lokale fagfolk til enhver opgave.
            </p>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/services" className="hover:text-foreground transition-colors">Services</Link></li>
              <li><Link to="/how-it-works" className="hover:text-foreground transition-colors">Sådan virker det</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">Priser</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">For providere</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/provider/register" className="hover:text-foreground transition-colors">Bliv provider</Link></li>
              <li><Link to="/provider/business" className="hover:text-foreground transition-colors">Virksomhedsløsning</Link></li>
              <li><Link to="/provider/boost" className="hover:text-foreground transition-colors">Boost profil</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4 text-sm">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/help" className="hover:text-foreground transition-colors">Hjælpecenter</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-colors">Kontakt</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privatlivspolitik</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">© 2026 HomeHero. Alle rettigheder forbeholdes.</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>🇩🇰 🇸🇪 🇳🇴 🇩🇪 🇳🇱 🇫🇷 🇪🇸 🇮🇹 🇬🇧 🇫🇮 🇵🇱 🇦🇹</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
