import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import FirstJobCelebrationDialog, { type FirstJobCloseReason } from "./FirstJobCelebrationDialog";
import {
  FIRST_JOB_DASHBOARD_ROUTE,
  parseFirstJobPopupState,
  shouldShowFirstJobPopup,
} from "./firstJobPopupState";

/**
 * Mounts the provider "first completed job" celebration popup.
 *
 * The server RPC decides eligibility (first completed + captured booking and
 * `profiles.first_completed_job_popup_seen_at IS NULL`), and the seen marker is
 * persisted through an idempotent RPC — so the popup can never appear twice,
 * on any device.
 */
export function FirstJobCelebrationGate() {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || rolesLoading) return;
    if (!user) {
      checkedFor.current = null;
      setOpen(false);
      return;
    }
    const isProvider = roles.includes("provider");
    if (!isProvider) return;
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_first_completed_job_popup_state");
      if (cancelled || error) return;
      const state = parseFirstJobPopupState(data);
      if (!shouldShowFirstJobPopup(state, isProvider)) return;
      setBookingId(state.booking_id ?? null);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, roles, rolesLoading]);

  const handleClose = useCallback(
    async (reason: FirstJobCloseReason) => {
      setOpen(false);
      try {
        await supabase.rpc("mark_first_completed_job_popup_seen");
      } catch {
        /* non-fatal: the popup is already closed for this session */
      }
      if (reason === "dashboard") navigate(FIRST_JOB_DASHBOARD_ROUTE);
    },
    [navigate],
  );

  if (!open) return null;
  return (
    <FirstJobCelebrationDialog
      open={open}
      bookingId={bookingId}
      onClose={(reason) => void handleClose(reason)}
    />
  );
}

export default FirstJobCelebrationGate;
