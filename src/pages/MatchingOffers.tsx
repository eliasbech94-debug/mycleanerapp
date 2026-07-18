import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Shield, Clock, Sparkles, Zap, MessageCircle, ArrowRight, Heart } from "lucide-react";
import { toast } from "sonner";

const mockOffers = [
  {
    id: "p_002", name: "Maria Jensen", avatar: "MJ", rating: 4.9, reviews: 127, verified: true,
    price: 420, estimatedHours: 3, distance: "2.3 km",
    specialties: ["Hjemmerengøring", "Dybrengøring"], bio: "15 års erfaring med professionel rengøring. Grundig og pålidelig.",
    aiMatch: 98, responseTime: "< 1 time", boosted: true,
  },
  {
    id: "p_003", name: "Anders Sørensen", avatar: "AS", rating: 4.7, reviews: 84, verified: true,
    price: 380, estimatedHours: 3, distance: "4.1 km",
    specialties: ["Hjemmerengøring", "Vinduespudsning"], bio: "Erfaren rengøringsassistent med fokus på kvalitet og kundetilfredshed.",
    aiMatch: 92, responseTime: "< 2 timer", boosted: false,
  },
  {
    id: "p_004", name: "CleanPro ApS", avatar: "CP", rating: 4.8, reviews: 312, verified: true,
    price: 450, estimatedHours: 3, distance: "5.8 km",
    specialties: ["Erhvervsrengøring", "Hjemmerengøring", "Flytterengøring"], bio: "Professionel rengøringsvirksomhed med certificerede medarbejdere.",
    aiMatch: 89, responseTime: "< 30 min", boosted: false, isBusiness: true,
  },
];

const FAV_KEY = "mycleaner:favorites";
const LEGACY_FAV_KEY = "homehero:favorites";

const loadFavorites = (): string[] => {
  try {
    let raw = localStorage.getItem(FAV_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_FAV_KEY);
      if (legacy) {
        localStorage.setItem(FAV_KEY, legacy);
        localStorage.removeItem(LEGACY_FAV_KEY);
        raw = legacy;
      }
    }
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const MatchingOffers = () => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showOnlyFavs, setShowOnlyFavs] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const toggleFavorite = (id: string, name: string) => {
    setFavorites((prev) => {
      const isFav = prev.includes(id);
      const next = isFav ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {}
      toast(isFav ? `${name} fjernet fra favoritter` : `${name} gemt som favorit`);
      return next;
    });
  };

  const visibleOffers = showOnlyFavs
    ? mockOffers.filter((o) => favorites.includes(o.id))
    : mockOffers;

  return (
    <div className="min-h-screen bg-background">
      <div className="container-narrow py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-3xl font-bold mb-2">Dine tilbud</h1>
              <p className="text-muted-foreground">3 fagfolk matcher din opgave — sorteret efter AI-match</p>
            </div>
            <Button
              variant={showOnlyFavs ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyFavs((v) => !v)}
              className="flex-shrink-0"
            >
              <Heart className={`h-4 w-4 ${showOnlyFavs ? "fill-current" : ""}`} />
              Favoritter ({favorites.length})
            </Button>
          </div>

          <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">AI-matchede tilbud</p>
              <p className="text-sm text-muted-foreground">Priserne er beregnet ud fra opgavens omfang, markedspriser og gældende overenskomster. Ingen budkrig — fair priser for alle.</p>
            </div>
          </div>

          {visibleOffers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Heart className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Du har ingen favoritter endnu. Tryk på hjertet for at gemme en provider.</p>
            </div>
          )}

          <div className="space-y-4">
            {visibleOffers.map((offer) => {
              const isFav = favorites.includes(offer.id);
              return (
              <div key={offer.id} className={`glass-card p-6 transition-all hover:shadow-lg relative ${offer.boosted ? "ring-2 ring-accent/50" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggleFavorite(offer.id, offer.name)}
                  aria-label={isFav ? "Fjern fra favoritter" : "Gem som favorit"}
                  aria-pressed={isFav}
                  className={`absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center transition-all border ${
                    isFav
                      ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : "bg-background border-border text-muted-foreground hover:text-destructive hover:border-destructive/30"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
                </button>
                {offer.boosted && (
                  <div className="flex items-center gap-1.5 text-accent text-xs font-medium mb-3">
                    <Zap className="h-3.5 w-3.5" /> Boosted profil
                  </div>
                )}
                <div className="flex items-start gap-4">
                  <Link to={`/provider/${offer.id}`} className="shrink-0">
                    <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-primary-foreground font-heading font-bold text-lg flex-shrink-0 hover:opacity-90 transition-opacity">
                      {offer.avatar}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap pr-10">
                      <Link to={`/provider/${offer.id}`} className="hover:text-primary transition-colors">
                        <h3 className="font-heading font-semibold text-lg">{offer.name}</h3>
                      </Link>
                      {offer.verified && <Shield className="h-4 w-4 text-primary" />}
                      {offer.isBusiness && <Badge variant="secondary" className="text-xs">Virksomhed</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-warning text-warning" /> {offer.rating} ({offer.reviews})</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {offer.distance}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {offer.responseTime}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{offer.bio}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {offer.specialties.map((s) => (
                        <span key={s} className="bg-secondary text-secondary-foreground text-xs px-2.5 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mt-8">
                    <div className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-2">
                      <Sparkles className="h-3 w-3" /> {offer.aiMatch}% match
                    </div>
                    <div className="font-heading text-2xl font-bold">{offer.price} kr</div>
                    <div className="text-xs text-muted-foreground">~{offer.estimatedHours} timer</div>
                    <div className="flex flex-col gap-2 mt-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline"><MessageCircle className="h-4 w-4" /></Button>
                        <Button size="sm">Vælg</Button>
                      </div>
                      <Link to={`/provider/${offer.id}`} className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                        Se profil <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchingOffers;
