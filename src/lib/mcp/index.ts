import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyBookings from "./tools/list_my_bookings";
import getMyProfile from "./tools/get_my_profile";
import searchCleaners from "./tools/search_cleaners";

// Direct supabase.co issuer — never the .lovable.cloud proxy. Vite inlines
// VITE_SUPABASE_PROJECT_ID at build time so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mycleaner-mcp",
  title: "MyCleaner",
  version: "0.1.0",
  instructions:
    "Tools for the MyCleaner marketplace. Use `get_my_profile` and `list_my_bookings` to read the signed-in user's own data, and `search_cleaners` to find providers by country. All tools act as the authenticated MyCleaner user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyBookings, searchCleaners],
});
