import { useTranslation } from "react-i18next";
import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EARLY_ACCESS_COPY, canPerformFinancialAction, isBookingLocked } from "@/config/launch";

export function BookingsOpenSoonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bookings-open-soon-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{EARLY_ACCESS_COPY.lockedTitle}</DialogTitle>
          <DialogDescription>{EARLY_ACCESS_COPY.lockedBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("ui.understood")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Guards a booking CTA. When Early Access is active the dialog is shown
 * instead of running the booking action.
 */
export function useBookingLockDialog() {
  const [open, setOpen] = useState(false);

  const guard = useCallback((action: () => void) => {
    if (isBookingLocked()) {
      setOpen(true);
      return;
    }
    action();
  }, []);

  return { open, setOpen, guard, locked: isBookingLocked() };
}

/**
 * Programmatic guard for ANY financial action (checkout, PaymentIntent,
 * capture, refund, payout/transfer, funds release, booking accept).
 *
 * Returns `true` when the action was blocked. Call this FIRST in the handler,
 * before any fetch / Supabase RPC / edge-function call.
 */
export function guardFinancialAction(onBlocked: () => void): boolean {
  if (canPerformFinancialAction()) return false;
  onBlocked();
  return true;
}

/**
 * Hook variant: owns the shared "Bookinger åbner snart" dialog state and
 * blocks the wrapped financial action while Early Access is active.
 */
export function useFinancialActionLock() {
  const [open, setOpen] = useState(false);

  const guard = useCallback(<T,>(action: () => T): T | undefined => {
    if (guardFinancialAction(() => setOpen(true))) return undefined;
    return action();
  }, []);

  return { open, setOpen, guard, locked: !canPerformFinancialAction() };
}

export default BookingsOpenSoonDialog;
