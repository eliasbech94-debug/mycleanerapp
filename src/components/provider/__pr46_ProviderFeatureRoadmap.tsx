import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import {
  FEATURE_STATUS_COPY,
  PROVIDER_FEATURE_ROADMAP,
  type ProviderRoadmapFeature,
} from "@/config/__pr46_roadmap";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_CLASS = {
  available: "bg-emerald-100 text-emerald-900",
  early_access: "bg-orange-100 text-orange-900",
  coming_soon: "bg-slate-100 text-slate-700",
  development: "bg-amber-100 text-amber-900",
} as const;

export function ProviderFeatureRoadmap() {
  const [selected, setSelected] = useState<ProviderRoadmapFeature | null>(null);

  return (
    <section className="border-t border-border/60 bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Dit MyCleaner-værktøj
          </p>
          <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            Funktioner på vej til dig
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Se både de funktioner, du kan bruge nu, og det vi bygger som næste del af din professionelle MyCleaner-profil.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDER_FEATURE_ROADMAP.map((feature) => {
            const status = FEATURE_STATUS_COPY[feature.status];
            const Icon = feature.icon;
            const cardClass =
              "group relative min-h-[210px] overflow-hidden rounded-3xl border bg-card p-5 text-left shadow-sm transition duration-200";

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

                <h3 className="mt-5 font-display text-xl text-card-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {feature.description}
                </p>

                <div className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {status.locked ? (
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

                {status.locked && (
                  <div className="pointer-events-none absolute inset-0 bg-background/10" aria-hidden="true" />
                )}
              </>
            );

            if (!status.locked && feature.route) {
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
                className={`${cardClass} hover:border-primary/30 hover:shadow-md`}
                aria-label={`${feature.title}: ${status.label}`}
              >
                {content}
              </button>
            );
          })}
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
                <DialogDescription className="leading-6">
                  {selected.description}
                </DialogDescription>
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
