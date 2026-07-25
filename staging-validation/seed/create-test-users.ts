/**
 * Seed staging auth users for end-to-end testing.
 * Idempotent: re-invocation upserts users and re-applies role assignments.
 *
 * Usage:
 *   STAGING_SUPABASE_URL=... STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
 *     bun run staging-validation/seed/create-test-users.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing STAGING_SUPABASE_URL or STAGING_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type Seed = {
  email: string;
  password: string;
  role: "customer" | "provider" | "support" | "admin";
  full_name: string;
  country: string;
  providerSlug?: string;
};

const users: Seed[] = [
  {
    email: "test.customer@mycleaner.dev",
    password: "TestPass!2026",
    role: "customer",
    full_name: "Test Customer",
    country: "DK",
  },
  {
    email: "test.provider@mycleaner.dev",
    password: "TestPass!2026",
    role: "provider",
    full_name: "Test Provider",
    country: "DK",
    providerSlug: "mette-copenhagen",
  },
  {
    email: "test.support@mycleaner.dev",
    password: "TestPass!2026",
    role: "support",
    full_name: "Test Support",
    country: "DK",
  },
  {
    email: "test.admin@mycleaner.dev",
    password: "TestPass!2026",
    role: "admin",
    full_name: "Test Admin",
    country: "DK",
  },
];

async function upsertUser(seed: Seed) {
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === seed.email
  );

  let id = existing?.id;

  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
      user_metadata: {
        full_name: seed.full_name,
      },
    });

    if (error) throw error;

    id = data.user.id;
    console.log(`✓ created ${seed.email}`);
  } else {
    await admin.auth.admin.updateUserById(id, {
      password: seed.password,
      email_confirm: true,
    });

    console.log(`↻ updated ${seed.email}`);
  }

  await admin.from("profiles").upsert(
    {
      id,
      full_name: seed.full_name,
      country_code: seed.country,
    },
    {
      onConflict: "id",
    }
  );

  if (seed.role !== "customer") {
    await admin.from("user_roles").upsert(
      {
        user_id: id,
        role: seed.role,
      },
      {
        onConflict: "user_id,role",
      }
    );
  }

  if (seed.providerSlug) {
    await admin
      .from("provider_profiles")
      .update({
        owner_id: id,
      })
      .eq("provider_slug", seed.providerSlug);
  }
}

(async () => {
  console.log("Seeding staging test users…");

  for (const u of users) {
    try {
      await upsertUser(u);
    } catch (e) {
      console.error(`✗ ${u.email}:`, e);
      process.exitCode = 1;
    }
  }

  console.log("Done.");
})();
