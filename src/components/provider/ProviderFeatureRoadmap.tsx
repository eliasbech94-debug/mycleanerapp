import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import {
  FEATURE_STATUS_COPY,
  PROVIDER_FEATURE_ROADMAP,
  type ProviderRoadmapFeature,
} from "@/config/provider-feature-roadmap";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_CLASS = {
  available: "bg-primary/10 text-primary",
  early_access: "bg-accent text-accent-foreground",
  coming_soon: "bg-muted text-muted-foreground",
  development: "bg-secondary text-secondary-foreground",
} as const;

export function ProviderFeatureRoadmap() {
  const [selected, setSelected] = useState<ProviderRoadmapFeature | null>(null);
  const headingId = useId();
  const activeFeatures = PROVIDER_FEATURE_ROADMAP.filter((feature) => Boolean(feature.route));
  const upcomingFeatures = PROVIDER_FEATURE_ROADMAP.filter((feature) => !feature.route);

  const renderFeature = (feature: ProviderRoadmapFeature) => {
    const status = FEATURE_STATUS_COPY[feature.status];
    const Icon = feature.icon;
    const locked = !feature.route;
    const cardClass =
      "group relative min-h-[210px] overflow-hidden rounded-3xl border border-border bg-background p-5 text-left text-foreground shadow-sm transition duration-200";

    const content = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${STATUS_CLASS[feature.status]}`}>
            {status.label}
          </span>
        </div>

        <h3 className="mt-5 font-display text-xl text-foreground">{feature.title}</h3>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{feature.description}</p>

        <div className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
          {locked ? (
            <>
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Se status
            </>
          ) : (
            <>
              Åbn funktion
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </>
          )}
        </div>
      </>
    );

    if (feature.route) {
      return (
        <Link
          key={feature.key}
          to={feature.route}
          className={`${cardClass} hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={feature.key}
        type="button"
        onClick={() => setSelected(feature)}
        className={`${cardClass} opacity-80 hover:border-primary/30 hover:opacity-100 hover:shadow-md`}
        aria-label={`${feature.title}: ${status.label}`}
        aria-haspopup="dialog"
        aria-expanded={selected?.key === feature.key}
      >
        {content}
      </button>
    );
  };

  return (
    <section
      className="mt-2 border-t border-border/60 pt-8 text-foreground"
      aria-labelledby={headingId}
    >
      <div className="w-full min-w-0">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Dit MyCleaner-værktøj</p>
          <h2 id={headingId} className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            Nu og næste på MyCleaner
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Brug de funktioner, der er åbne nu, og se hvad vi arbejder på som næste del af din professionelle platform.
          </p>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">Klar til brug</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeFeatures.map(renderFeature)}
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">På vej</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Under udvikling betyder aktivt byggeri. Kommer snart betyder, at funktionen er planlagt i roadmapet.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcomingFeatures.map(renderFeature)}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <selected.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <DialogTitle className="font-display text-2xl">{selected.title}</DialogTitle>
                <DialogDescription className="leading-6">{selected.description}</DialogDescription>
              </DialogHeader>
              <div className="rounded-2xl border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <LockKeyhole className="h-4 w-4 text-primary" aria-hidden="true" />
                  {FEATURE_STATUS_COPY[selected.status].label}
                </div>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {FEATURE_STATUS_COPY[selected.status].description}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
