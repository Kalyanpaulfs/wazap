import { describe, expect, it } from "vitest";
import { paymentStatusInfo, isRefundLikeStatus, matchesPaymentStatusFilter, paymentMethodLabel } from "../admin-payments";

describe("paymentStatusInfo", () => {
  it("maps every real Payment.status value found in the codebase", () => {
    expect(paymentStatusInfo("active")).toEqual({ label: "Paid", tone: "green" });
    expect(paymentStatusInfo("pending")).toEqual({ label: "Pending", tone: "amber" });
    expect(paymentStatusInfo("invoice_requested")).toEqual({ label: "Pending", tone: "amber" });
    expect(paymentStatusInfo("refunded")).toEqual({ label: "Refunded", tone: "slate" });
    expect(paymentStatusInfo("partially_refunded")).toEqual({ label: "Partly refunded", tone: "amber" });
    expect(paymentStatusInfo("charged_back")).toEqual({ label: "Charged back", tone: "red" });
    expect(paymentStatusInfo("disputed")).toEqual({ label: "Disputed", tone: "red" });
  });
  it("falls back to a title-cased label for anything unexpected", () => {
    expect(paymentStatusInfo("some_odd_status")).toEqual({ label: "Some odd status", tone: "slate" });
  });
});

describe("isRefundLikeStatus", () => {
  it("groups every reversal status together", () => {
    expect(isRefundLikeStatus("refunded")).toBe(true);
    expect(isRefundLikeStatus("partially_refunded")).toBe(true);
    expect(isRefundLikeStatus("charged_back")).toBe(true);
    expect(isRefundLikeStatus("active")).toBe(false);
    expect(isRefundLikeStatus("pending")).toBe(false);
  });
});

describe("matchesPaymentStatusFilter", () => {
  it("'all' matches everything", () => {
    expect(matchesPaymentStatusFilter("pending", "all")).toBe(true);
  });
  it("'active' matches only Paid", () => {
    expect(matchesPaymentStatusFilter("active", "active")).toBe(true);
    expect(matchesPaymentStatusFilter("pending", "active")).toBe(false);
  });
  it("'refunded' matches any reversal", () => {
    expect(matchesPaymentStatusFilter("charged_back", "refunded")).toBe(true);
    expect(matchesPaymentStatusFilter("active", "refunded")).toBe(false);
  });
});

describe("paymentMethodLabel", () => {
  it("labels known methods", () => {
    expect(paymentMethodLabel("paypal")).toBe("PayPal");
    expect(paymentMethodLabel("dodo")).toBe("Dodo");
    expect(paymentMethodLabel("paypal_invoice")).toBe("PayPal (invoice)");
  });
  it("title-cases anything else", () => {
    expect(paymentMethodLabel("manual")).toBe("Manual");
  });
});
