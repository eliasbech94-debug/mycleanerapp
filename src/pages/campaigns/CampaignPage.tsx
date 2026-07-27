// Public campaign page. Schema-driven — renders whatever blocks the admin
// has configured. Feature-flag gated on `campaigns.public_ui`; when OFF the
// route falls back to NotFound so campaigns are not publicly discoverable.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { hasFlag } from "@/lib/featureFlags";
import { loadPublicCampaign, trackCampaignEvent, type CampaignFullPage } from "@/lib/campaigns/api";
import { BlockRenderer } from "@/components/campaigns/BlockRenderer";
import { useCountry } from "@/i18n/CountryContext";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/NotFound";

export default function CampaignPage() {
  const { slug = "" } = useParams();
  const { country } = useCountry();
  const iso = country?.iso ?? null;
  const [page, setPage] = useState<CampaignFullPage | null>(null);
  const [state, setState] = useState<"loading" | "gone" | "ready" | "disabled">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await hasFlag("campaigns.public_ui", {});
      if (cancelled) return;
      if (!enabled) { setState("disabled"); return; }
      const p = await loadPublicCampaign(slug, iso);
      if (cancelled) return;
      if (!p) { setState("gone"); return; }
      setPage(p);
      setState("ready");
      document.title = `${p.campaign.name} — MyCleaner`;
      trackCampaignEvent({
        campaign_slug: slug,
        event_type: "landing_viewed",
        country_code: iso,
      });
    })();
    return () => { cancelled = true; };
  }, [slug, iso]);

  if (state === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === "disabled" || state === "gone" || !page) return <NotFound />;

  return (
    <main className="container mx-auto py-8 md:py-12 space-y-10 md:space-y-14">
      {page.blocks.length === 0 ? (
        <BlockRenderer
          page={page}
          block={{ id: "auto-hero", block_type: "hero", position: 0, content: {}, country_scope: null, locale_scope: null }}
          countryIso={iso}
        />
      ) : (
        page.blocks.map((b) => (
          <BlockRenderer key={b.id} page={page} block={b} countryIso={iso} />
        ))
      )}
      <BlockRenderer
        page={page}
        block={{ id: "auto-cta", block_type: "cta", position: 999, content: {}, country_scope: null, locale_scope: null }}
        countryIso={iso}
      />
    </main>
  );
}
