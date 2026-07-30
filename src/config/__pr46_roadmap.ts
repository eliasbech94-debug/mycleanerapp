import {
  Award,
  Bot,
  CalendarClock,
  GraduationCap,
  HeartHandshake,
  IdCard,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundSearch,
  Video,
  type LucideIcon,
} from "lucide-react";

export type FeatureStatus = "available" | "early_access" | "coming_soon" | "development";

export type ProviderRoadmapFeature = {
  key: string;
  title: string;
  description: string;
  status: FeatureStatus;
  icon: LucideIcon;
  route?: string;
};

export const PROVIDER_FEATURE_ROADMAP: ProviderRoadmapFeature[] = [
  {
    key: "bookings",
    title: "Bookinger",
    description: "Modtag, acceptér og administrér kundeanmodninger.",
    status: "available",
    icon: CalendarClock,
    route: "/provider-dashboard",
  },
  {
    key: "identity",
    title: "Verificeret identitet",
    description: "Vis kunderne, at din identitet er kontrolleret af MyCleaner.",
    status: "available",
    icon: ShieldCheck,
    route: "/provider/verification",
  },
  {
    key: "public-profile",
    title: "Professionel profil",
    description: "Din offentlige profil med services, erfaring, priser og tillidssignaler.",
    status: "early_access",
    icon: IdCard,
    route: "/provider/profile",
  },
  {
    key: "intro-video",
    title: "Introduktionsvideo",
    description: "Præsenter dig selv, så kunder kan møde dig før booking.",
    status: "development",
    icon: Video,
  },
  {
    key: "provider-score",
    title: "MyCleaner Score",
    description: "Et samlet overblik over kvalitet, stabilitet og kundetillid.",
    status: "coming_soon",
    icon: Star,
  },
  {
    key: "performance-dashboard",
    title: "Performance-dashboard",
    description: "Følg ratings, fremmøde, svartid og din vej mod Pro-status.",
    status: "coming_soon",
    icon: LayoutDashboard,
  },
  {
    key: "pro-status",
    title: "Pro-status",
    description: "Optjen lavere platformfee og ekstra synlighed gennem stærk performance.",
    status: "coming_soon",
    icon: Award,
  },
  {
    key: "academy",
    title: "MyCleaner Academy",
    description: "Kurser og kategori-tests, der dokumenterer dine kompetencer.",
    status: "coming_soon",
    icon: GraduationCap,
  },
  {
    key: "career-profile",
    title: "Karriereprofil og CV",
    description: "Byg en verificeret arbejdshistorik, du selv kan dele med arbejdsgivere.",
    status: "coming_soon",
    icon: Sparkles,
  },
  {
    key: "ai-coach",
    title: "AI-coach",
    description: "Få private forslag til en stærkere profil, bedre service og flere bookinger.",
    status: "coming_soon",
    icon: Bot,
  },
  {
    key: "smart-matching",
    title: "Smart matching",
    description: "Bliv matchet med opgaver, der passer til dine kompetencer og præferencer.",
    status: "coming_soon",
    icon: UserRoundSearch,
  },
  {
    key: "backup-provider",
    title: "Backup-provider",
    description: "Få hjælp til at dække opgaver ved sygdom eller uforudsete hændelser.",
    status: "coming_soon",
    icon: HeartHandshake,
  },
];

export const FEATURE_STATUS_COPY: Record<
  FeatureStatus,
  { label: string; description: string; locked: boolean }
> = {
  available: {
    label: "Tilgængelig nu",
    description: "Funktionen er klar til brug.",
    locked: false,
  },
  early_access: {
    label: "Early access",
    description: "Funktionen åbnes løbende og kan stadig blive forbedret.",
    locked: false,
  },
  coming_soon: {
    label: "Kommer snart",
    description: "Vi arbejder på funktionen og åbner den, når den er sikker og færdigtestet.",
    locked: true,
  },
  development: {
    label: "Under udvikling",
    description: "Funktionen er i aktiv udvikling og bliver tilgængelig senere.",
    locked: true,
  },
};
