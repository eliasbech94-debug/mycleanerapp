# Campaign Engine — Architecture

Status: Milestone 1.1 (schema complete, feature-flagged off)
Owner: Platform
Feature flag: `campaigns.enabled` (global, currently `false`)

The Campaign Engine is a reusable substrate for time-boxed programs
(Founding Provider, seasonal, referral, invite-friends, country launches,
Black Friday, etc.). One schema, many campaigns. Non-financial rewards are
first-class; the finance / fee engine is a **downstream consumer**, never an
owner.

---

## 1. ER diagram

<lov-artifact url="/__l5e/documents/campaign-engine-er.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

Tables:

| Table | Purpose |
|---|---|
| `campaigns` | Master record. Kind, lifecycle, per-campaign feature toggles, `ai_config`, `version`, soft-delete. |
| `campaign_country_settings` | Per-country capacity, waiting-list toggle, locale defaults. |
| `campaign_page_blocks` | Ordered CMS blocks (hero, benefits, faq, form, testimonials, custom…). |
| `campaign_benefits`, `campaign_faq`, `campaign_testimonials` | Typed collections referenced by blocks. |
| `campaign_rewards` | Reward definitions (badge, discount, credit, feature access, custom). **Campaign-owned.** |
| `campaign_applications` | Applicant submissions. Attribution (UTM, referral). Soft-delete. |
| `campaign_reward_grants` | Grant instances linking application → reward. Downstream consumers read this. |
| `campaign_events` | **Append-only** analytics ledger. |
| `campaign_apply_attempts` | Rate-limit ledger for the apply endpoint. |
| `campaign_number_counters` | Sequential per-campaign counter for `Founding #N` badges. |
| `campaign_counters` (view) | Public aggregate counts, `security_invoker = true`. |

---

## 2. Lifecycle diagram

<lov-artifact url="/__l5e/documents/campaign-engine-lifecycle.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

Public visibility predicate `is_campaign_public(lifecycle)` returns true for
`scheduled`, `pre_launch`, `preview`, `active`. All other states are
admin-only. Soft-deleted rows (`deleted_at IS NOT NULL`) are excluded from
every public policy.

---

## 3. Application flow

<lov-artifact url="/__l5e/documents/campaign-engine-application-flow.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

Guarantees:

- Rate-limited per IP + email via `campaign_apply_attempts`.
- Classification happens **inside a BEFORE INSERT trigger** with
  `SELECT ... FOR UPDATE` on the country-settings row → race-safe under
  concurrent submissions.
- Every application emits an immutable `application_submitted` event.

---

## 4. Waiting-list flow

<lov-artifact url="/__l5e/documents/campaign-engine-waiting-list.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

`campaign_application_classify()` decides:

- **slots remaining** → `status = pending`
- **full + waiting-list enabled** → `status = waiting_list`, assigns `waiting_list_position`
- **full + waiting-list disabled** → raises `campaign_capacity_reached` (SQLSTATE `check_violation`)

Admin promotes from waiting list by updating `status = pending`.

---

## 5. Approval flow

<lov-artifact url="/__l5e/documents/campaign-engine-approval-flow.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

On `status → approved`, `campaign_application_assign_number()` reads and
increments `campaign_number_counters` atomically to produce the next
sequential badge number (e.g. `Founding #12`). Reward grants are created
immediately so downstream consumers see them on first read.

---

## 6. Reward lifecycle

<lov-artifact url="/__l5e/documents/campaign-engine-reward-lifecycle.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

**Independence contract** (documented as table `COMMENT`s):

- `campaign_rewards` and `campaign_reward_grants` are **owned by the Campaign Engine**.
- The finance / fee engine **consumes** rewards. It reads
  `campaign_reward_grants` to determine applicable discounts/credits and
  writes back only via a dedicated RPC (future work) — never via direct
  `UPDATE`.
- Rewards may be non-financial (`badge`, `priority_listing`,
  `feature_access`, `custom_action`). The engine must remain usable for
  campaigns that grant zero financial rewards.

---

## 7. Event lifecycle

<lov-artifact url="/__l5e/documents/campaign-engine-event-lifecycle.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

`campaign_events` is **append-only**. Enforcement:

1. `BEFORE UPDATE` and `BEFORE DELETE` triggers
   (`campaign_events_append_only`) raise `check_violation` with a clear
   message.
2. `UPDATE` and `DELETE` are `REVOKE`d from `anon` and `authenticated` at
   the grant level (belt-and-suspenders).
3. Admin panels must show events read-only.

Consumers: analytics dashboards, audit trail, and future AI training
corpus.

---

## 8. Soft delete & versioning

- `campaigns.deleted_at`, `campaigns.deleted_by` and
  `campaign_applications.deleted_at`, `campaign_applications.deleted_by`
  replace hard `DELETE`. Public RLS excludes soft-deleted rows.
- `campaigns.version` (int, default `1`) supports future edit-without-break
  workflows: mutating copy or benefits after launch can bump `version` and
  events keep historical `version` context via `metadata` (future extension
  point).
- GDPR cleanup (future worker) anonymises soft-deleted applications
  (`applicant_email → NULL`, PII scrub) instead of hard-deleting, preserving
  historical analytics counts.

---

## 9. `ai_config` reserved structure

Both `campaigns.ai_config` and `campaign_page_blocks.ai_config` are `jsonb`
with the following documented shape (implementation deferred):

```jsonc
{
  "translations": {},  // per-locale copy overrides generated by AI
  "seo":          {},  // meta title / description / keywords per locale
  "copy":         {},  // headline / subheadline / CTA variants
  "ab_testing":   {},  // variant IDs, weights, targeting rules
  "prompt":       {}   // system + user prompt templates that produced current copy
}
```

Rules:

- New AI features must land inside one of the five reserved buckets, or
  extend the schema by proposal — never at the top level.
- Empty buckets are valid. Missing buckets are treated as empty.
- Consumers must tolerate unknown keys inside a bucket for forward
  compatibility.

---

## 10. Security posture

- All tables have explicit `GRANT`s + `ENABLE RLS` + policies in the same
  migration.
- Public reads gated by `is_campaign_public(lifecycle) AND deleted_at IS NULL`.
- `campaign_applications` never publicly readable (owner + admin/support only).
- Triggers use `SECURITY DEFINER SET search_path = public`.
- `campaign_counters` view uses `security_invoker = true`.
- Rate limiting enforced inside `campaign-apply` edge function (Milestone 2).

---

## 11. Future extension points

| Extension | Where it plugs in | Preserves |
|---|---|---|
| Multi-version campaign editing | Bump `campaigns.version`; events carry version in `metadata`. | Historical analytics. |
| GDPR anonymisation worker | Reads `deleted_at`; scrubs PII on `campaign_applications`; leaves events. | Analytics counts. |
| AI copy generation | Fills `ai_config.translations` / `copy` / `seo`. | Manual overrides win. |
| A/B testing | Fills `ai_config.ab_testing`; renderer picks variant deterministically per applicant. | Same underlying blocks. |
| Fee engine integration | Reads `campaign_reward_grants` for discount/credit resolution. | Reward independence. |
| Referral graph | Existing `referral_code` + `referred_by` columns on applications. | No schema change. |
| Push / email drips | Events emit; a worker (future) subscribes to `application_submitted`, `waiting_list_promoted`, etc. | Immutable ledger. |
| Multi-region rollout | Per-country settings already exist; add `campaign_country_settings.rollout_pct` when needed. | Additive. |
| Non-financial rewards | Already first-class (`badge`, `feature_access`, `custom_action`). | Reward abstraction. |
| Admin campaign duplication | Copy campaigns row + child rows; new slug + `version = 1`. | Soft-delete keeps history. |

---

## Change log

- **2026-07-27 — Milestone 1.1**: soft-delete on `campaigns` and
  `campaign_applications`; `campaigns.version`; append-only enforcement on
  `campaign_events`; `ai_config` structure documented; reward independence
  documented.
- **2026-07-27 — Milestone 1.0**: initial schema (12 tables, 1 view, 7 enums,
  3 SECURITY DEFINER functions, feature flag `campaigns.enabled = false`).
