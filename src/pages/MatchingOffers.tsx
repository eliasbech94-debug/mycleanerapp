import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Shield, Clock, Sparkles, Zap, MessageCircle } from "lucide-react";

const mockOffers = [
  {
    id: 1, name: "Maria Jensen", avatar: "MJ", rating: 4.9, reviews: 127, verified: true,
    price: 420, estimatedHours: 3, distance: "2.3 km",
    specialties: ["Hjemmerengøring", "Dybrengøring"], bio: "15 års erfaring med professionel rengøring. Grundig og pålidelig.",
    aiMatch: 98, responseTime: "< 1 time", boosted: true,
  },
  {
    id: 2, name: "Anders Sørensen", avatar: "AS", rating: 4.7, reviews: 84, verified: true,
    price: 380, estimatedHours: 3, distance: "4.1 km",
    specialties: ["Hjemmerengøring", "Vinduespudsning"], bio: "Erfaren rengøringsassistent med fokus på kvalitet og kundetilfredshed.",
    aiMatch: 92, responseTime: "< 2 timer", boosted: false,
  },
  {
    id: 3, name: "CleanPro ApS", avatar: "CP", rating: 4.8, reviews: 312, verified: true,
    price: 450, estimatedHours: 3, distance: "5.8 km",
    specialties: ["Erhvervsrengøring", "Hjemmerengøring", "Flytterengøring"], bio: "Professionel rengøringsvirksomhed med certificerede medarbejdere.",
    aiMatch: 89, responseTime: "< 30 min", boosted: false, isBusiness: true,
  },
];

const MatchingOffers = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-narrow py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="font-heading text-3xl font-bold mb-2">Dine tilbud</h1>
            <p className="text-muted-foreground">3 fagfolk matcher din opgave — sorteret efter AI-match</p>
          </div>

          <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">AI-matchede tilbud</p>
              <p className="text-sm text-muted-foreground">Priserne er beregnet ud fra opgavens omfang, markedspriser og gældende overenskomster. Ingen budkrig — fair priser for alle.</p>
            </div>
          </div>

          <div className="space-y-4">
            {mockOffers.map((offer) => (
              <div key={offer.id} className={`glass-card p-6 transition-all hover:shadow-lg ${offer.boosted ? "ring-2 ring-accent/50" : ""}`}>
                {offer.boosted && (
                  <div className="flex items-center gap-1.5 text-accent text-xs font-medium mb-3">
                    <Zap className="h-3.5 w-3.5" /> Boosted profil
                  </div>
                )}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-primary-foreground font-heading font-bold text-lg flex-shrink-0">
                    {offer.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-lg">{offer.name}</h3>
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
                  <div className="text-right flex-shrink-0">
                    <div className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-2">
                      <Sparkles className="h-3 w-3" /> {offer.aiMatch}% match
                    </div>
                    <div className="font-heading text-2xl font-bold">{offer.price} kr</div>
                    <div className="text-xs text-muted-foreground">~{offer.estimatedHours} timer</div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline"><MessageCircle className="h-4 w-4" /></Button>
                      <Button size="sm">Vælg</Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchingOffers;
