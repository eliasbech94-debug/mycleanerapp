import { supabase } from "@/integrations/supabase/client";

export async function resolveHomeForCurrentUser(fallback = "/customer"): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "/login";
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const r = (roles ?? []).map((x: any) => x.role as string);
  if (r.includes("super_admin") || r.includes("admin")) return "/admin";
  if (r.includes("employee")) return "/employee";
  if (r.includes("provider")) return "/provider-dashboard";
  if (r.includes("customer")) return "/customer";
  return fallback;
}
