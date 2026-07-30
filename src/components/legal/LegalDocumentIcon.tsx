// Maps a stored icon name to a lucide icon, with a safe default.
import {
  Ban, BadgeCheck, Briefcase, CalendarX, Cookie, CreditCard, FileText, Fingerprint,
  Gift, Image, Repeat, Scale, ShieldAlert, ShieldCheck, Sparkles, Star, Undo2, Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Ban, BadgeCheck, Briefcase, CalendarX, Cookie, CreditCard, FileText, Fingerprint,
  Gift, Image, Repeat, Scale, ShieldAlert, ShieldCheck, Sparkles, Star, Undo2, Users,
};

export function LegalDocumentIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || FileText;
  return <Icon className={className} aria-hidden="true" />;
}
