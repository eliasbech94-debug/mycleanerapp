// Regression guards for the Stripe webhook consolidation (Part A).
//
// After consolidation there is exactly ONE authoritative Stripe endpoint:
//   supabase/functions/stripe-webhook
// `stripe-webhook-v7` is retired and must not touch the ledger or the
// shared `stripe_webhook_events` idempotency log any more.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEDGER_EVENTS,
  canApplyPaymentState,
  isHandled,
  paymentStateForEvent,
} from "../../supabase/functions/_shared/stripeEventRouting";

const FN = "supabase/functions";
const webhook = readFileSync(join(FN, "stripe-webhook/index.ts"), "utf8");
const v7 = readFileSync(join(FN, "stripe-webhook-v7/index.ts"), "utf8");

describe("payment state guard", () => {
  it("applies a normal authorization", () => {
    expect(canApplyPaymentState("none", "authorized")).toBe(true);
  });

  it("is a no-op when the same event is delivered twice", () => {
    expect(canApplyPaymentState("captured", "captured")).toBe(false);
  });

  it("allows a refund event after capture", () => {
    expect(canApplyPaymentState("captured", "refunded")).toBe(true);
    expect(canApplyPaymentState("captured", "partially_refunded")).toBe(true);
    expect(canApplyPaymentState("partially_refunded", "refunded")).toBe(true);
  });

  it("rejects an older authorized event arriving after capture", () => {
    expect(canApplyPaymentState("captured", "authorized")).toBe(false);
  });

  it("never downgrades a terminal money state", () => {
    for (const terminal of ["captured", "refunded", "partially_refunded"]) {
      for (const next of ["authorized", "none", "failed", "canceled", "expired"] as const) {
        expect(canApplyPaymentState(terminal, next)).toBe(false);
      }
    }
    expect(canApplyPaymentState("refunded", "partially_refunded")).toBe(false);
  });

  it("requires_action never authorizes", () => {
    expect(paymentStateForEvent("payment_intent.requires_action")).toBeUndefined();
  });

  it("ignores unknown event types safely", () => {
    expect(isHandled("invoice.finalization_failed")).toBe(false);
    expect(paymentStateForEvent("invoice.finalization_failed")).toBeUndefined();
  });
});

describe("single authoritative endpoint", () => {
  it("stripe-webhook-v7 is deactivated and returns 410", () => {
    expect(v7).toMatch(/410/);
    expect(v7).not.toMatch(/ingest_payment_captured/);
    expect(v7).not.toMatch(/from\("stripe_webhook_events"\)/);
  });

  it("stripe-webhook owns the v7 ledger ingestion", () => {
    expect(webhook).toMatch(/ingestLedgerEvent/);
    const ingest = readFileSync(join(FN, "_shared/stripeLedgerIngest.ts"), "utf8");
    for (const rpc of [
      "ingest_payment_captured_v1",
      "ingest_payment_captured_suspense_v1",
      "ingest_refund_recorded_v1",
      "ingest_transfer_event_v1",
      "classify_booking_payment_flow_v1",
    ]) expect(ingest).toContain(rpc);
  });

  it("covers every event the retired v7 endpoint handled", () => {
    for (const t of [
      "payment_intent.succeeded", "charge.succeeded", "charge.updated",
      "charge.refunded", "refund.created", "refund.updated",
      "balance.available", "transfer.created", "transfer.reversed",
    ]) {
      expect(LEDGER_EVENTS.has(t)).toBe(true);
      expect(isHandled(t)).toBe(true);
    }
  });
});

describe("idempotency and retry contract", () => {
  it("reserves the event before running handlers", () => {
    const reserveAt = webhook.indexOf("reserveEvent(event)");
    const processAt = webhook.indexOf("processEvent(event)");
    expect(reserveAt).toBeGreaterThan(-1);
    expect(processAt).toBeGreaterThan(reserveAt);
  });

  it("marks processed only after the handler completed", () => {
    expect(webhook).toMatch(/const meta = await processEvent\(event\);\s*\n\s*await markEvent\(event\.id, "processed"/);
  });

  it("a failed handler is never marked processed and returns 500", () => {
    const tail = webhook.slice(webhook.lastIndexOf("} catch (e) {"));
    expect(tail).toMatch(/markEvent\(event\.id, "failed"\)/);
    expect(tail).toMatch(/status: 500/);
  });

  it("a previously failed event may be retried", () => {
    expect(webhook).toMatch(/data\?\.status === "failed"/);
    expect(webhook).toMatch(/return "retry"/);
  });

  it("a duplicate delivery short-circuits with 200", () => {
    expect(webhook).toMatch(/disposition === "duplicate"/);
  });

  it("unknown events are acknowledged, logged and never acted upon", () => {
    expect(webhook).toMatch(/if \(!isHandled\(event\.type\)\)[\s\S]{0,120}markEvent\(event\.id, "ignored"\)/);
  });
});
