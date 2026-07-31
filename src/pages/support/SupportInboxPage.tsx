import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SupportLayout } from "./SupportLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useSupportConversations, type SupportScope } from "@/hooks/useSupportConversations";
import { ConversationList } from "./inbox/ConversationList";
import { ConversationDetailView } from "./inbox/ConversationDetailView";
import { ContextPanel } from "./inbox/ContextPanel";
import type { ConversationDetail } from "@/hooks/useConversationDetail";
import { useTranslation } from "react-i18next";

const SCOPE_IDS: SupportScope[] = ["mine", "unassigned", "open", "escalated", "resolved", "all"];

/**
 * Support Inbox — three-column responsive helpdesk layout.
 * - Desktop (≥lg): list | detail | context
 * - Tablet   (md): list | detail (context via drawer/context tab hidden)
 * - Mobile   (<md): full-screen detail when :conversationId is set
 * Routing: /support/inbox and /support/inbox/:conversationId
 */
export default function SupportInboxPage() {
  const { t } = useTranslation("admin");
  const nav = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [scope, setScope] = useState<SupportScope>("mine");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeDetail, setActiveDetail] = useState<ConversationDetail | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft), 300);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const list = useSupportConversations(scope, search);

  const activeId = conversationId ?? null;
  const showListMobile = !activeId;
  const showDetailMobile = !!activeId;

  const onSelect = (id: string) => nav(`/support/inbox/${id}`);

  return (
    <SupportLayout title={t("support.inboxPage.title")} description={t("support.inboxPage.description")}>
      <div className="grid gap-0 border rounded-lg overflow-hidden bg-background h-[calc(100vh-260px)] min-h-[500px] grid-cols-1 md:grid-cols-[minmax(280px,340px)_1fr] lg:grid-cols-[minmax(280px,320px)_1fr_minmax(280px,340px)]">
        {/* ============= Column 1: List ============= */}
        <section
          aria-label={t("support.inboxPage.listAria")}
          className={cn(
            "flex flex-col min-h-0 border-r bg-muted/20",
            showDetailMobile && "hidden md:flex",
          )}
        >
          <div className="p-2 border-b bg-background space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={t("support.inboxPage.searchPlaceholder")}
                className="pl-8 h-8 text-sm"
                aria-label={t("support.inboxPage.searchAria")}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
              {SCOPE_IDS.map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant={scope === id ? "default" : "ghost"}
                  onClick={() => setScope(id)}
                  className="h-7 px-2 text-xs whitespace-nowrap"
                >
                  {t(`support.inboxPage.scope.${id}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <ConversationList
              rows={list.rows}
              activeId={activeId}
              onSelect={onSelect}
              loading={list.isLoading}
              error={(list.error as Error) ?? null}
              hasNextPage={!!list.hasNextPage}
              isFetchingNextPage={list.isFetchingNextPage}
              fetchNextPage={list.fetchNextPage}
            />
          </div>
        </section>

        {/* ============= Column 2: Detail ============= */}
        <section
          aria-label={t("support.inboxPage.detailAria")}
          className={cn(
            "flex flex-col min-h-0 min-w-0 bg-background",
            showListMobile && "hidden md:flex",
          )}
        >
          <ConversationDetailView
            conversationId={activeId}
            onDetail={setActiveDetail}
            showBack
          />
        </section>

        {/* ============= Column 3: Context (lg+) ============= */}
        <aside
          aria-label={t("support.inboxPage.contextAria")}
          className="hidden lg:flex flex-col min-h-0 border-l bg-muted/20"
        >
          <ContextPanel detail={activeDetail} />
        </aside>
      </div>
    </SupportLayout>
  );
}
