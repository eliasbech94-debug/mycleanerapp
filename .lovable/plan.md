# Layout System — Komplet plan

Bygger et sammenh�ngende layout-system i tre lag, plus l�ser 3 sikkerhedsfund undervejs.

## 1. Design system foundation (`src/index.css` + `tailwind.config.ts`)

Udvider eksisterende tokens med et komplet layout-lag:

- **Spacing scale** (semantisk): `--space-section`, `--space-block`, `--space-stack`, `--space-inline`
- **Containere**: `.container-narrow` (640px), `.container-default` (1100px), `.container-wide` (1400px), `.container-full`
- **Section padding-varianter**: `.section-sm`, `.section-md`, `.section-lg`, `.section-xl`
- **Grid-utilities**: `.grid-bento`, `.grid-cards-2/3/4`, `.grid-split`, `.grid-sidebar`
- **Surface tokens**: `--surface-raised`, `--surface-sunken`, `--surface-overlay` + matching shadow tokens
- **Radius scale**: konsistent radius-system (`--radius-sm/md/lg/xl/2xl`)
- Alt bruger HSL og eksisterende brand-farver (deep teal, orange, cream, mint).

## 2. Layout-komponenter (`src/components/layout/`)

Genbrugelige React-komponenter der wrapper tokens:

- `<PageContainer width="narrow|default|wide|full">` � erstatter ad-hoc max-w divs
- `<Section padding="sm|md|lg|xl" background="default|cream|teal|gradient">` � semantisk side-section
- `<Stack gap="sm|md|lg">` og `<Cluster>` � vertikal/horisontal flow
- `<BentoGrid>` + `<BentoCard size="sm|md|lg|wide|tall">` � forside-grid
- `<SplitLayout left right ratio="50/50|60/40|40/60">` � to-kolonner hero/section
- `<CardGrid cols={2|3|4}>` � uniform kort-grid

## 3. Dashboard sidebar shell (`src/components/dashboard/`)

shadcn `Sidebar`-baseret app shell til admin/provider/employee:

- `<DashboardLayout role="admin|provider|employee">` med `SidebarProvider`
- `AppSidebar` med rolle-baserede navigation items, `collapsible="icon"`, `NavLink` med aktiv state
- `<DashboardHeader>` med `SidebarTrigger`, breadcrumbs, bruger-menu
- `<DashboardPage title description actions>` wrapper med konsistent header
- Routes wrapped via `<Outlet />`

## 4. Forside bento refactor (`src/pages/Index.tsx` + sections)

Eksisterende homepage-sektioner migreres til de nye komponenter:
- Hero �  `<SplitLayout>` med 60/40 ratio
- "Sådan virker det" � `<BentoGrid>` med blandede str�relser
- Service-kategorier � `<CardGrid cols={4}>`
- Beh�lder alle brand-farver, fonts, og indhold uændret � kun struktur swappes.

## 5. Sikkerhedsfund (mandatory, l�ses i samme migration)

- `access_attempts`: fjern anon INSERT, kun service_role m� skrive
- `realtime.messages`: tilf�j RLS policies scoped p� `auth.uid()` for booking/notification topics
- `stripe_webhook_events`: fjern �ben SELECT policy, begr�ns til admin-rolle via `has_role`

## Teknisk

```text
src/
  index.css                    � udvidet tokens + utilities
  tailwind.config.ts           � nye spacing/radius/grid keys
  components/
    layout/
      PageContainer.tsx
      Section.tsx
      Stack.tsx
      BentoGrid.tsx
      SplitLayout.tsx
      CardGrid.tsx
      index.ts                 � barrel export
    dashboard/
      DashboardLayout.tsx
      AppSidebar.tsx
      DashboardHeader.tsx
      DashboardPage.tsx
      nav-config.ts            � rolle-baserede items
  pages/
    Index.tsx                  � refactored til nye komponenter
supabase/migrations/<ts>_layout_security.sql
```

Ingen funktionalitet �ndres � kun struktur, tokens, og sikkerhedspolitikker.
