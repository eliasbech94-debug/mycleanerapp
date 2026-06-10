import { supabase } from "@/integrations/supabase/client";

export type PlaceType = "private" | "business" | "vacation" | "other";
export type AccessMethod = "home" | "key_box" | "key_under_mat" | "doorman" | "code" | "other";

export type CustomerAddress = {
  id: string;
  user_id: string;
  label: string;
  address: string;
  address_place_id: string | null;
  lat: number | null;
  lng: number | null;
  is_primary: boolean;
  place_type: PlaceType;
  size_sqm: number | null;
  rooms: number | null;
  floor: string | null;
  has_pets: boolean;
  pet_details: string | null;
  has_children: boolean;
  parking_info: string | null;
  access_method: AccessMethod;
  access_code: string | null;
  access_instructions: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
  cleaning_supplies_available: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  private: "Privat",
  business: "Erhverv",
  vacation: "Sommerhus",
  other: "Andet",
};

export const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  home: "Jeg er hjemme",
  key_box: "Nøgleboks",
  key_under_mat: "Nøgle gemt (under måtte / krukke)",
  doorman: "Vicevært / portner",
  code: "Adgangskode til opgang",
  other: "Andet",
};

export async function listAddresses(userId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from("customer_addresses" as any)
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as CustomerAddress[];
}

export type AddressAccessPatch = Partial<Pick<CustomerAddress,
  "access_method" | "access_code" | "access_instructions" |
  "has_pets" | "pet_details" | "has_children" |
  "parking_info" | "cleaning_supplies_available"
>>;

export async function updateAddressAccess(id: string, patch: AddressAccessPatch): Promise<CustomerAddress> {
  const { data, error } = await supabase
    .from("customer_addresses" as any)
    .update(patch as any)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as CustomerAddress;
}

export function buildAutoNotes(a: CustomerAddress): string {
  const parts: string[] = [];
  if (a.access_method && a.access_method !== "home") {
    parts.push(`Adgang: ${ACCESS_METHOD_LABEL[a.access_method]}${a.access_code ? ` (kode: ${a.access_code})` : ""}`);
  }
  if (a.access_instructions) parts.push(a.access_instructions);
  if (a.has_pets) parts.push(`Kæledyr: ${a.pet_details || "ja"}`);
  if (a.has_children) parts.push("Børn i hjemmet");
  if (a.parking_info) parts.push(`Parkering: ${a.parking_info}`);
  if (a.floor) parts.push(`Etage: ${a.floor}`);
  if (a.cleaning_supplies_available) parts.push("Rengøringsmidler står klar");
  if (a.notes) parts.push(a.notes);
  return parts.join("\n");
}
