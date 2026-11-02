import { describe, expect, it } from "vitest";
import {
  approvalDecisionSchema,
  auditQuerySchema,
  policyUpsertSchema,
  requestCreateSchema,
  vendorCreateSchema,
} from "./schemas";

const validRequest = {
  title: "Laptops for new engineers",
  justification: "Two engineers start next week and need development laptops.",
  department: "Engineering",
  urgency: "NORMAL",
  category: "IT_HARDWARE",
  vendorId: "11111111-1111-4111-8111-111111111111",
  currency: "usd",
  items: [{ description: "14-inch laptop", quantity: 2, unitPrice: 1450.5 }],
};

describe("requestCreateSchema", () => {
  it("accepts a valid request and normalizes the currency", () => {
    const parsed = requestCreateSchema.parse(validRequest);
    expect(parsed.currency).toBe("USD");
    expect(parsed.items[0]?.unitPrice).toBe(1450.5);
  });

  it("requires at least one line item", () => {
    expect(() => requestCreateSchema.parse({ ...validRequest, items: [] })).toThrow();
  });

  it("rejects negative and over-precision amounts", () => {
    expect(() =>
      requestCreateSchema.parse({
        ...validRequest,
        items: [{ description: "Bad", quantity: 1, unitPrice: 10.999 }],
      }),
    ).toThrow();
    expect(() =>
      requestCreateSchema.parse({
        ...validRequest,
        items: [{ description: "Bad", quantity: 1, unitPrice: -10 }],
      }),
    ).toThrow();
  });

  it("rejects a non-uuid vendor", () => {
    expect(() => requestCreateSchema.parse({ ...validRequest, vendorId: "nope" })).toThrow();
  });
});

describe("approvalDecisionSchema", () => {
  it("allows approve without a comment", () => {
    expect(approvalDecisionSchema.parse({ action: "APPROVE" }).action).toBe("APPROVE");
  });

  it("requires a comment when rejecting or requesting changes", () => {
    expect(() => approvalDecisionSchema.parse({ action: "REJECT" })).toThrow();
    expect(() =>
      approvalDecisionSchema.parse({ action: "REQUEST_CHANGES", comment: "no" }),
    ).toThrow();
    expect(
      approvalDecisionSchema.parse({ action: "REQUEST_CHANGES", comment: "Please add a quote" }).comment,
    ).toBe("Please add a quote");
  });
});

describe("vendorCreateSchema", () => {
  it("normalizes email and accepts an empty website", () => {
    const parsed = vendorCreateSchema.parse({
      name: "Acme",
      contactEmail: "SALES@ACME.EXAMPLE.COM",
      website: "",
      riskLevel: "MEDIUM",
    });
    expect(parsed.contactEmail).toBe("sales@acme.example.com");
    expect(parsed.website).toBeUndefined();
    expect(parsed.riskLevel).toBe("MEDIUM");
  });

  it("rejects an invalid contact email", () => {
    expect(() =>
      vendorCreateSchema.parse({ name: "Acme", contactEmail: "not-an-email" }),
    ).toThrow();
  });
});

describe("policyUpsertSchema", () => {
  it("accepts an empty approver list (auto-approve)", () => {
    const parsed = policyUpsertSchema.parse({
      name: "Auto-approve small purchases",
      conditions: { maxAmountCents: 100_000 },
      approvers: [],
    });
    expect(parsed.approvers).toEqual([]);
    expect(parsed.enabled).toBe(true);
  });

  it("rejects an inverted amount range", () => {
    expect(() =>
      policyUpsertSchema.parse({
        name: "Bad range",
        conditions: { minAmountCents: 200_000, maxAmountCents: 100_000 },
        approvers: [],
      }),
    ).toThrow();
  });
});

describe("auditQuerySchema", () => {
  it("applies pagination defaults", () => {
    expect(auditQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25 });
  });
});
