import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCountryPath } from "@/lib/countryPath";
import { filterMissionNav } from "./nav";
import { useGlobalSearch } from "./useMissionControl";
import { Loader2, CalendarCheck, User, Briefcase, MessageSquare } from "lucide-react";

const HIT_ICON = {
  booking: CalendarCheck,
  customer: User,
  provider: Briefcase,
  conversation: MessageSquare,
} as const;

const HIT_GROUP = {
  booking: "Bookinger",
  provider: "Providere",
  customer: "Kunder",
  conversation: "Samtaler",
} as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global CMD/CTRL+K palette: navigation commands + live backend search. */
export const CommandPalette = ({ open, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const localize = useCountryPath();
  const { hasRole } = useUserRoles();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => filterMissionNav(hasRole), [hasRole]);
  const { data: hits, isFetching } = useGlobalSearch(debounced);

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof hits>>();
    for (const hit of hits ?? []) {
      const list = map.get(hit.type) ?? [];
      list.push(hit);
      map.set(hit.type, list);
    }
    return [...map.entries()];
  }, [hits]);

  const go = (url: string) => {
    onOpenChange(false);
    navigate(localize(url));
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Søg bookinger, kunder, providere, samtaler…"
      />
      <CommandList>
        <CommandEmpty>
          {isFetching ? (
            <span className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Søger…
            </span>
          ) : (
            "Ingen resultater."
          )}
        </CommandEmpty>

        {grouped.map(([type, items]) => {
          const Icon = HIT_ICON[type as keyof typeof HIT_ICON];
          return (
            <CommandGroup key={type} heading={HIT_GROUP[type as keyof typeof HIT_GROUP]}>
              {items.map((hit) => (
                <CommandItem key={`${type}-${hit.id}`} value={`${hit.title} ${hit.subtitle ?? ""} ${hit.id}`} onSelect={() => go(hit.href)}>
                  <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">
                      {hit.subtitle}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {grouped.length > 0 && <CommandSeparator />}

        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.url} value={`${item.title} ${item.url}`} onSelect={() => go(item.url)}>
                <item.icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
