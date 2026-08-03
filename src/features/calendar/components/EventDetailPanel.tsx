import { useIsMobile } from "@/hooks/use-mobile";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CalendarEvent } from "../useProviderCalendar";
import { EventDetailBody } from "./EventDetailBody";

/**
 * Responsive detail surface: a right-side panel on desktop, a bottom sheet on
 * mobile. Both are Radix dialogs, so focus trapping and Escape come for free.
 */
export function EventDetailPanel({
  event,
  onOpenChange,
  onChanged,
}: {
  event: CalendarEvent | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const isMobile = useIsMobile();
  const open = event !== null;

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={event?.kind === "booking" ? "Bookingdetaljer" : "Detaljer"}
      >
        {event && (
          <EventDetailBody
            event={event}
            onChanged={onChanged}
            onClose={() => onOpenChange(false)}
          />
        )}
      </BottomSheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {event?.kind === "booking" ? "Bookingdetaljer" : "Detaljer"}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {event && (
            <EventDetailBody
              event={event}
              onChanged={onChanged}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default EventDetailPanel;
