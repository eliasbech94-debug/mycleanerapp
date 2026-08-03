// Serves the *public* Mapbox browser token at runtime so it never has to live
// in the tracked .env file / committed bundle source.
//
// The token returned here is a publishable `pk.` token — it is designed to be
// visible in the browser and must be URL/domain-restricted in the Mapbox
// dashboard. No secret (`sk.`) token is ever exposed by this function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN")?.trim() ?? "";

  // Defensive: never hand out a secret token even if misconfigured.
  const safe = token.startsWith("pk.") ? token : "";

  if (!safe) {
    console.error("MAPBOX_PUBLIC_TOKEN missing or not a publishable pk. token");
    return new Response(
      JSON.stringify({ error: "mapbox_token_not_configured" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ mapboxToken: safe }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
