/**
 * Native V2 customer profile section editors.
 *
 * Personal + Contact are focused forms writing to `public.profiles`.
 * Addresses re-mounts `AddressBook` (already the source of truth for
 * customer_addresses). Preferences + Access edit fields on the
 * customer's primary address. Notifications / Deactivate / Tax re-mount
 * the existing self-contained tabs so no business logic is duplicated.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import AddressBook from "@/components/AddressBook";
import {
  ACCESS_METHOD_LABEL, type AccessMethod, type CustomerAddress,
} from "@/lib/customerAddresses";

export {
  NotificationsTab as NotificationsEditor,
  TaxTab as TaxEditor,
  DeactivateTab as DeactivateEditor,
} from "@/components/profile/ProfileExtraTabs";

/* ----------------------------- Personal ----------------------------- */
const personalSchema = z.object({
  full_name: z.string().trim().max(100, "Max 100").nullable(),
  country_code: z.string().trim().length(2, "CC").nullable().optional(),
  ui_language: z.string().trim().max(5).nullable().optional(),
});

export interface PersonalEditorProps {
  initial: { full_name: string | null; country_code: string | null; ui_language: string | null };
  onSaved: () => void;
  registerSave: (fn: () => Promise<boolean>) => void;
  registerDirty: (dirty: boolean) => void;
}

export function PersonalEditor({ initial, onSaved, registerSave, registerDirty }: PersonalEditorProps) {
  const { t } = useTranslation("customer");
  const { user } = useAuth();
  const [full, setFull] = useState(initial.full_name ?? "");
  const [cc, setCc] = useState(initial.country_code ?? "");
  const [lang, setLang] = useState(initial.ui_language ?? "");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    (initial.full_name ?? "") !== full ||
    (initial.country_code ?? "") !== cc ||
    (initial.ui_language ?? "") !== lang;

  useEffect(() => { registerDirty(dirty); }, [dirty, registerDirty]);

  useEffect(() => {
    registerSave(async () => {
      const parsed = personalSchema.safeParse({
        full_name: full.trim() || null,
        country_code: cc.trim().toUpperCase() || null,
        ui_language: lang.trim().toLowerCase() || null,
      });
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        const msg = field === "full_name"
          ? t("profileV2.editors.personalFields.errors.charLimit")
          : field === "country_code"
          ? t("profileV2.editors.personalFields.errors.countryCode")
          : t("profileV2.editors.common.invalid");
        setError(msg); toast.error(msg); return false;
      }
      if (!user) return false;
      const { error: err } = await supabase.from("profiles")
        .update(parsed.data).eq("id", user.id);
      if (err) { toast.error(err.message); return false; }
      toast.success(t("profileV2.editors.common.saved")); onSaved(); return true;
    });
  }, [full, cc, lang, user, registerSave, onSaved, t]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="full">{t("profileV2.editors.personalFields.fullNameLabel")}</Label>
        <Input id="full" value={full} maxLength={100}
          onChange={(e) => setFull(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cc">{t("profileV2.editors.personalFields.countryLabel")}</Label>
        <Input id="cc" value={cc} maxLength={2}
          onChange={(e) => setCc(e.target.value.toUpperCase())}
          placeholder={t("profileV2.editors.personalFields.countryPlaceholder")} />
      </div>
      <div>
        <Label htmlFor="lang">{t("profileV2.editors.personalFields.languageLabel")}</Label>
        <select id="lang" value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t("profileV2.editors.personalFields.languageNone")}</option>
          <option value="da">Dansk</option>
          <option value="en">English</option>
          <option value="sv">Svenska</option>
          <option value="es">Español</option>
        </select>
      </div>
      {error && <p className="sm:col-span-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

/* ------------------------------ Contact ----------------------------- */
const contactSchema = z.object({
  phone: z.string().trim().max(32).regex(/^[+0-9 \-()]*$/i, "invalid").nullable(),
});

export interface ContactEditorProps {
  initial: { phone: string | null; email: string | null };
  onSaved: () => void;
  registerSave: (fn: () => Promise<boolean>) => void;
  registerDirty: (dirty: boolean) => void;
}

export function ContactEditor({ initial, onSaved, registerSave, registerDirty }: ContactEditorProps) {
  const { t } = useTranslation("customer");
  const { user } = useAuth();
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  const dirty = (initial.phone ?? "") !== phone;
  useEffect(() => { registerDirty(dirty); }, [dirty, registerDirty]);

  useEffect(() => {
    registerSave(async () => {
      const parsed = contactSchema.safeParse({ phone: phone.trim() || null });
      if (!parsed.success) {
        const msg = t("profileV2.editors.contactFields.errors.phone");
        setError(msg); toast.error(msg); return false;
      }
      if (!user) return false;
      const { error: err } = await supabase.from("profiles")
        .update(parsed.data).eq("id", user.id);
      if (err) { toast.error(err.message); return false; }
      toast.success(t("profileV2.editors.common.saved")); onSaved(); return true;
    });
  }, [phone, user, registerSave, onSaved, t]);

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("profileV2.editors.contactFields.emailLabel")}</Label>
        <Input value={initial.email ?? ""} disabled />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("profileV2.editors.contactFields.emailNote")}
        </p>
      </div>
      <div>
        <Label htmlFor="phone">{t("profileV2.editors.contactFields.phoneLabel")}</Label>
        <Input id="phone" value={phone} maxLength={32}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("profileV2.editors.contactFields.phonePlaceholder")} />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

/* ---------------------------- Addresses ----------------------------- */
export function AddressesEditor() {
  // AddressBook owns its own CRUD dialog + reload cycle.
  return <AddressBook />;
}

/* --------------------- Cleaning preferences (primary) --------------- */
const ACCESS_METHODS: AccessMethod[] = [
  "home", "key_box", "key_under_mat", "doorman", "code", "other",
];

export interface PrimaryPrefsProps {
  address: CustomerAddress | null;
  onSaved: () => void;
  registerSave: (fn: () => Promise<boolean>) => void;
  registerDirty: (dirty: boolean) => void;
}

export function CleaningPreferencesEditor(props: PrimaryPrefsProps) {
  return <PrimaryAddressForm {...props} scope="prefs" />;
}
export function AccessInstructionsEditor(props: PrimaryPrefsProps) {
  return <PrimaryAddressForm {...props} scope="access" />;
}

function PrimaryAddressForm({
  address, onSaved, registerSave, registerDirty, scope,
}: PrimaryPrefsProps & { scope: "prefs" | "access" }) {
  const { t } = useTranslation("customer");
  const [hasPets, setHasPets] = useState(!!address?.has_pets);
  const [petDetails, setPetDetails] = useState(address?.pet_details ?? "");
  const [hasChildren, setHasChildren] = useState(!!address?.has_children);
  const [supplies, setSupplies] = useState(!!address?.cleaning_supplies_available);
  const [parking, setParking] = useState(address?.parking_info ?? "");
  const [method, setMethod] = useState<AccessMethod>(address?.access_method ?? "home");
  const [code, setCode] = useState(address?.access_code ?? "");
  const [instr, setInstr] = useState(address?.access_instructions ?? "");

  const dirty =
    scope === "prefs"
      ? hasPets !== !!address?.has_pets ||
        petDetails !== (address?.pet_details ?? "") ||
        hasChildren !== !!address?.has_children ||
        supplies !== !!address?.cleaning_supplies_available ||
        parking !== (address?.parking_info ?? "")
      : method !== (address?.access_method ?? "home") ||
        code !== (address?.access_code ?? "") ||
        instr !== (address?.access_instructions ?? "");

  useEffect(() => { registerDirty(dirty); }, [dirty, registerDirty]);

  useEffect(() => {
    registerSave(async () => {
      if (!address) { toast.error(t("profileV2.editors.common.addPrimaryFirst")); return false; }
      const payload: Record<string, unknown> = scope === "prefs"
        ? {
            has_pets: hasPets,
            pet_details: hasPets ? (petDetails.trim() || null) : null,
            has_children: hasChildren,
            cleaning_supplies_available: supplies,
            parking_info: parking.trim() || null,
          }
        : {
            access_method: method,
            access_code: code.trim() || null,
            access_instructions: instr.trim() || null,
          };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("customer_addresses" as any))
        .update(payload).eq("id", address.id);
      if (error) { toast.error(error.message); return false; }
      toast.success(t("profileV2.editors.common.saved")); onSaved(); return true;
    });
  }, [address, hasPets, petDetails, hasChildren, supplies, parking,
      method, code, instr, scope, registerSave, onSaved, t]);

  if (!address) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("profileV2.editors.common.addPrimaryFirstInline")}
      </p>
    );
  }

  if (scope === "prefs") {
    return (
      <div className="space-y-3">
        <ToggleRow label={t("profileV2.editors.prefsFields.petsLabel")} checked={hasPets} onChange={setHasPets} />
        {hasPets && (
          <div>
            <Label htmlFor="pet">{t("profileV2.editors.prefsFields.petDetailsLabel")}</Label>
            <Input id="pet" value={petDetails} maxLength={200}
              onChange={(e) => setPetDetails(e.target.value)}
              placeholder={t("profileV2.editors.prefsFields.petDetailsPlaceholder")} />
          </div>
        )}
        <ToggleRow label={t("profileV2.editors.prefsFields.childrenLabel")} checked={hasChildren} onChange={setHasChildren} />
        <ToggleRow label={t("profileV2.editors.prefsFields.suppliesLabel")} checked={supplies} onChange={setSupplies} />
        <div>
          <Label htmlFor="park">{t("profileV2.editors.prefsFields.parkingLabel")}</Label>
          <Input id="park" value={parking} maxLength={200}
            onChange={(e) => setParking(e.target.value)} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="method">{t("profileV2.editors.accessFields.methodLabel")}</Label>
        <select id="method" value={method}
          onChange={(e) => setMethod(e.target.value as AccessMethod)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          {ACCESS_METHODS.map((m) => (
            <option key={m} value={m}>{ACCESS_METHOD_LABEL[m] ?? m}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="code">{t("profileV2.editors.accessFields.codeLabel")}</Label>
        <Input id="code" value={code} maxLength={64}
          onChange={(e) => setCode(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="instr">{t("profileV2.editors.accessFields.instructionsLabel")}</Label>
        <Textarea id="instr" value={instr} rows={4} maxLength={1000}
          onChange={(e) => setInstr(e.target.value)} />
      </div>
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/* --------------------------- Loading fallback ----------------------- */
export function EditorSpinner() {
  return (
    <div className="grid place-items-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
