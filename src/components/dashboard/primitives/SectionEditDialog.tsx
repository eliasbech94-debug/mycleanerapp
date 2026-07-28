import { ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * SectionEditDialog — shared inline-edit modal for V2 profile surfaces.
 *
 * - Body content is rendered by the caller (native editors).
 * - Save/Cancel actions are optional; when omitted the child form is
 *   assumed to own its own save UI (e.g. NotificationsTab autosaves).
 * - When `dirty` is true, Cancel and background dismiss ask for
 *   confirmation before discarding.
 * - Fully mobile-first: full-screen sheet under sm breakpoint via
 *   Radix Dialog's default responsive sizing.
 */
export interface SectionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Show Save/Cancel footer. Default true. */
  showFooter?: boolean;
  /** True when the form has unsaved edits. Controls discard confirmation. */
  dirty?: boolean;
  /** Called when the user clicks Save. */
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  /** Disable the Save button (e.g. validation errors). */
  saveDisabled?: boolean;
}

export function SectionEditDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  showFooter = true,
  dirty = false,
  onSave,
  saving = false,
  saveLabel = "Gem",
  cancelLabel = "Annullér",
  saveDisabled,
}: SectionEditDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDiscard(false);
  }, [open]);

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
          else onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{title}</DialogTitle>
            <DialogDescription>
              {description ?? "Redigér denne sektion. Ændringer gemmes til din profil."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">{children}</div>
          {showFooter && (
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={saving}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                onClick={() => void onSave?.()}
                disabled={saving || saveDisabled || !onSave}
              >
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {saveLabel}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kassér ændringer?</AlertDialogTitle>
            <AlertDialogDescription>
              Du har ugemte ændringer. Vil du kassere dem?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Kassér
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
