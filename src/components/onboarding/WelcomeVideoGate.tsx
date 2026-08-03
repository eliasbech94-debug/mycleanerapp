import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import WelcomeVideoDialog from "./WelcomeVideoDialog";
import {
  isWelcomeVideoEligible,
  resolveWelcomeVideoAudience,
  welcomeVideoCtaRoute,
  type WelcomeVideoAudience,
} from "./welcomeVideoEligibility";

/**
 * Mounts the post-signup welcome video popup.
 *
 * Eligibility is decided from the database (`profiles.welcome_video_seen_at`)
 * plus the auth account age, so a refresh, a second device or a later login
 * never re-opens it. Marking as seen goes through the idempotent, race-safe
 * `mark_welcome_video_seen()` RPC.
 */
export function WelcomeVideoGate() {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<WelcomeVideoAudience>("customer");
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) {
      checkedFor.current = null;
      setOpen(false);
      return;
    }
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("welcome_video_seen_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || error) return;
      const seenAt = (data as { welcome_video_seen_at: string | null } | null)?.welcome_video_seen_at ?? null;
      if (!isWelcomeVideoEligible({ seenAt, userCreatedAt: user.created_at })) return;
      setAudience(resolveWelcomeVideoAudience(roles));
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, roles, rolesLoading]);

  const handleClose = useCallback(
    async (reason: "close" | "skip" | "cta") => {
      setOpen(false);
      try {
        await supabase.rpc("mark_welcome_video_seen");
      } catch {
        /* non-fatal: the popup is already closed for this session */
      }
      if (reason === "cta") navigate(welcomeVideoCtaRoute(audience));
    },
    [audience, navigate],
  );

  if (!open) return null;
  return <WelcomeVideoDialog open={open} audience={audience} onClose={(r) => void handleClose(r)} />;
}

export default WelcomeVideoGate;
