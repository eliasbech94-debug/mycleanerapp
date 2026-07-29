/**
 * Public provider profile (/p/:slug).
 *
 * Layout follows the MyCleaner app design; ALL content is loaded from the
 * database at runtime — no provider names, prices, ratings, dates, cities or
 * images are hardcoded. Sections are modular and self-hiding, so future
 * blocks (MyCleaner Score, certifications, portfolio, career timeline,
 * achievements, response time, cancellation rate) can be added without a
 * redesign.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EARLY_ACCESS_MODE, isBookingLocked } from "@/config/launch";
import { BookingsOpenSoonDialog } from "@/components/launch/BookingsOpenSoonDialog";
import { useAuth } from "@/hooks/useAuth";
import { useAppContext, type AcquisitionSource } from "@/context/AppContext";
import BackButton from "@/components/BackButton";
import { usePublicProviderProfileData } from "@/hooks/usePublicProviderProfile";
import ProviderProfileView from "@/components/provider/public/ProviderProfileView";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

const KNOWN_SOURCES: AcquisitionSource[] = [
  "provider_direct_link",
  "provider_qr",
  "provider_social_share",
  "provider_embedded_widget",
  "marketplace_pick",
];

function parseSource(v: string | null): AcquisitionSource {
  if (v && (KNOWN_SOURCES as string[]).includes(v)) return v as AcquisitionSource;
  return "provider_direct_link";
}

export default function PublicProviderProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setProviderLock, setProviderHint, clearProviderLock, campaign } = useAppContext();

  const [resolved, setResolved] = useState<"pending" | "ok" | "not_found">("pending");
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [showAltDialog, setShowAltDialog] = useState(false);
  const [showBookingLocked, setShowBookingLocked] = useState(false);

  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const source = parseSource(search.get("src"));
  const ref = search.get("ref");

  const data = usePublicProviderProfileData(slug, resolved === "ok");
  const { profile, workHistory, slots, nextSlot, isFav, distanceKm, availabilityStatus, presenceStatus, reviews } = data;

  // Attribution capture the moment we land on a /p/:slug URL.
  useEffect(() => {
    if (!slug) return;
    setProviderLock({
      slug,
      source,
      ref,
      campaign,
      landingUrl: window.location.href,
      firstSeenAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Slug resolution owns navigation, so it stays in the page.
  useEffect(() => {
    if (!slug) return;
    setResolved("pending");
    (async () => {
      const { data: res } = await rpc("resolve_slug_v1", { _slug: slug });
      const r = Array.isArray(res) ? res[0] : res;
      if (r?.status === "redirect" && r?.slug && r.slug !== slug) {
        navigate(`/p/${r.slug}${location.search}`, { replace: true });
        return;
      }
      if (r?.status === "not_found") {
        setResolved("not_found");
        return;
      }
      setResolved("ok");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (profile && slug) setProviderHint(slug, profile.display_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.display_name, slug]);

  // Distance requires the customer's live position; denial degrades to city only.
  useEffect(() => {
    if (resolved === "ok") data.requestCustomerLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  function bookDirect(prefillDate?: string, prefillSlot?: string) {
    if (!slug) return;
    if (isBookingLocked()) {
      setShowBookingLocked(true);
      return;
    }
    const qs = new URLSearchParams({ provider: slug, src: source });
    if (prefillDate) qs.set("date", prefillDate);
    if (prefillSlot) qs.set("slot", prefillSlot);
    navigate(`/book?${qs.toString()}`);
  }

  async function onFollow() {
    const res = await data.toggleFollow();
    if (!res.ok && res.reason === "signed-out") toast.info("Log ind for at følge cleaners");
    if (!res.ok && res.reason === "error") toast.error(res.message ?? "Kunne ikke opdatere");
  }

  function confirmSeeAlternatives() {
    clearProviderLock();
    setShowAltDialog(false);
    navigate("/find-cleaner");
  }

  if (resolved === "not_found" || profile === null) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-serif">Provider ikke fundet</h1>
          <p className="mt-2 text-muted-foreground">Profilen findes ikke, eller er ikke offentlig.</p>
          <Button asChild className="mt-4"><Link to="/marketplace">Tilbage til marketplace</Link></Button>
        </div>
      </main>
    );
  }

  if (resolved === "pending" || profile === undefined) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  const firstName = profile.display_name.split(" ")[0];

  return (
    <main className="min-h-screen bg-[hsl(210_60%_98%)]">
      <ProviderProfileView
        profile={profile}
        workHistory={workHistory}
        slots={slots}
        nextSlot={nextSlot}
        reviews={reviews}
        availabilityStatus={availabilityStatus}
        presenceStatus={presenceStatus}
        distanceKm={distanceKm}
        earlyAccess={EARLY_ACCESS_MODE}
        bookingLocked={isBookingLocked()}
        isFollowing={isFav}
        notifyRequested={notifyRequested}
        header={<BackButton />}
        onPickSlot={(d, sl) => bookDirect(d, sl)}
        onRequestOther={() => bookDirect()}
        onNotify={() => {
          setNotifyRequested(true);
          toast.success("Vi giver besked, når der åbner en ny tid.");
        }}
        onSeeAlternatives={() => setShowAltDialog(true)}
        onBook={() => bookDirect()}
        onFollow={onFollow}
        onLoadReviews={data.loadReviews}
      />

      <AlertDialog open={showAltDialog} onOpenChange={setShowAltDialog}>
        <AlertDialogContent data-testid="see-alternatives-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Skift til andre cleaners?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er ved at booke <strong>{profile.display_name}</strong>. Vil du se andre cleaners i stedet?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bliv hos {firstName}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSeeAlternatives} data-testid="see-alternatives-confirm">
              Ja, vis andre cleaners
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingsOpenSoonDialog open={showBookingLocked} onOpenChange={setShowBookingLocked} />
      {/* user is referenced by the follow flow via the hook */}
      <span hidden data-signed-in={user ? "1" : "0"} />
    </main>
  );
}
