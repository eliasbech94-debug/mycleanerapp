import { ReactNode, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MissionControlSidebar } from "./MissionControlSidebar";
import { MissionControlTopBar } from "./MissionControlTopBar";
import { CommandPalette } from "./CommandPalette";

interface Props {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Mission Control shell: permanent dark navigation rail + light content area.
 *
 * Mission Control renders without the public site header, so the shell owns the
 * full viewport height and the nav panel sticks to the top of the window.
 */
export const MissionControlLayout = ({ title, actions, children }: Props) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid min-h-[100svh] w-full min-w-0 grid-cols-1 bg-[hsl(var(--mission-canvas))] md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden md:block">
        <div className="sticky top-0 h-[100svh]">
          <MissionControlSidebar />
        </div>
      </aside>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="w-72 border-0 p-0 md:hidden [&>button]:right-3 [&>button]:top-4 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-lg [&>button]:text-white [&>button]:opacity-90"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Mission Control navigation</SheetTitle>
          </SheetHeader>
          <MissionControlSidebar onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <MissionControlTopBar
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="min-w-0 flex-1">
          {(title || actions) && (
            <div className="flex flex-wrap items-center gap-3 px-4 pt-6 sm:px-8">
              {title && (
                <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
};
