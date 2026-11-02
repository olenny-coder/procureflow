import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyDefinition, type PolicyEvaluationInput } from "./policy";

function policy(overrides: Partial<PolicyDefinition> & Pick<PolicyDefinition, "id" | "name">): PolicyDefinition {
  return {
    description: "",
    priority: 100,
    enabled: true,
    conditions: {},
    approvers: [],
    ...overrides,
  };
}

const BASE_INPUT: PolicyEvaluationInput = {
  totalAmountCents: 250_000,
  department: "Engineering",
  vendorRiskLevel: "LOW",
  vendorStatus: "APPROVED",
  urgency: "NORMAL",
  category: "IT_HARDWARE",
};

const AUTO = policy({
  id: "auto",
  name: "Low-value auto-approval",
  priority: 10,
  conditions: { maxAmountCents: 100_000 },
  approvers: [],
});

const STANDARD = policy({
  id: "standard",
  name: "Standard review",
  priority: 20,
  conditions: { minAmountCents: 100_001, maxAmountCents: 1_000_000 },
  approvers: [
    { role: "APPROVER", dueInHours: 24 },
    { role: "FINANCE", dueInHours: 24 },
  ],
});

const HIGH_VALUE = policy({
  id: "high",
  name: "High-value review",
  priority: 30,
  conditions: { minAmountCents: 1_000_001 },
  approvers: [
    { role: "APPROVER", dueInHours: 24 },
    { role: "FINANCE", dueInHours: 24 },
    { role: "ADMIN", dueInHours: 48 },
  ],
});

const HIGH_RISK = policy({
  id: "risk",
  name: "High-risk compliance",
  priority: 15,
  conditions: { vendorRiskLevels: ["HIGH"] },
  approvers: [{ role: "ADMIN", dueInHours: 48 }],
});

const UNAPPROVED_VENDOR = policy({
  id: "vendor-status",
  name: "Unapproved vendor check",
  priority: 16,
  conditions: { vendorStatuses: ["DRAFT", "PENDING_REVIEW"] },
  approvers: [{ role: "ADMIN", dueInHours: 48 }],
});

const URGENT = policy({
  id: "urgent",
  name: "Urgent finance fast-track",
  priority: 18,
  conditions: { urgencies: ["HIGH"] },
  approvers: [{ role: "FINANCE", dueInHours: 12 }],
});

const IT_DEPARTMENT = policy({
  id: "it",
  name: "IT department review",
  priority: 12,
  conditions: { departments: ["IT"] },
  approvers: [{ role: "APPROVER", dueInHours: 8 }],
});

const ALL = [AUTO, STANDARD, HIGH_VALUE, HIGH_RISK, UNAPPROVED_VENDOR, URGENT, IT_DEPARTMENT];

describe("evaluatePolicy", () => {
  it("auto-approves amounts at or below the low-value threshold", () => {
    const result = evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 100_000 });
    expect(result.autoApprove).toBe(true);
    expect(result.chain).toEqual([]);
    expect(result.matchedRuleIds).toEqual(["auto"]);
  });

  it("routes standard amounts to manager then finance", () => {
    const result = evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 100_001 });
    expect(result.autoApprove).toBe(false);
    expect(result.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE"]);
    expect(result.chain.map((step) => step.stepOrder)).toEqual([1, 2]);
  });

  it("adds admin/compliance above $10,000", () => {
    const result = evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 1_000_001 });
    expect(result.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE", "ADMIN"]);
    expect(result.chain[2]?.dueInHours).toBe(48);
  });

  it("adds compliance for high-risk vendors and de-duplicates the admin role", () => {
    const result = evaluatePolicy(ALL, {
      ...BASE_INPUT,
      totalAmountCents: 2_500_000,
      vendorRiskLevel: "HIGH",
    });
    expect(result.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE", "ADMIN"]);
    expect(result.chain.filter((step) => step.role === "ADMIN")).toHaveLength(1);
    expect(result.chain[2]?.ruleIds).toEqual(expect.arrayContaining(["high", "risk"]));
  });

  it("adds compliance for unapproved vendors", () => {
    const result = evaluatePolicy(ALL, {
      ...BASE_INPUT,
      vendorStatus: "PENDING_REVIEW",
    });
    expect(result.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE", "ADMIN"]);
  });

  it("uses the fastest SLA when several rules add the same role", () => {
    const result = evaluatePolicy(ALL, {
      ...BASE_INPUT,
      urgency: "HIGH",
      totalAmountCents: 250_000,
    });
    const finance = result.chain.find((step) => step.role === "FINANCE");
    expect(finance?.dueInHours).toBe(24);
    expect(finance?.ruleIds).toEqual(expect.arrayContaining(["standard", "urgent"]));
  });

  it("only applies department rules to matching departments", () => {
    const it = evaluatePolicy(ALL, { ...BASE_INPUT, department: "IT", totalAmountCents: 250_000 });
    expect(it.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE"]);
    expect(it.chain[0]?.dueInHours).toBe(24);

    const marketing = evaluatePolicy(ALL, {
      ...BASE_INPUT,
      department: "Marketing",
      totalAmountCents: 250_000,
    });
    expect(marketing.chain.map((step) => step.role)).toEqual(["APPROVER", "FINANCE"]);
  });

  it("falls back to a single admin review when nothing matches", () => {
    const result = evaluatePolicy([AUTO], { ...BASE_INPUT, totalAmountCents: 5_000_000 });
    expect(result.fallbackApplied).toBe(true);
    expect(result.chain).toHaveLength(1);
    expect(result.chain[0]?.role).toBe("ADMIN");
    expect(result.matchedRuleIds).toEqual([]);
  });

  it("ignores disabled policies", () => {
    const result = evaluatePolicy([{ ...STANDARD, enabled: false }], BASE_INPUT);
    expect(result.fallbackApplied).toBe(true);
    expect(result.chain[0]?.role).toBe("ADMIN");
  });

  it("is deterministic for the same inputs", () => {
    const first = evaluatePolicy(ALL, BASE_INPUT);
    const second = evaluatePolicy([...ALL].reverse(), BASE_INPUT);
    expect(first).toEqual(second);
  });

  it("evaluates the 1000 / 10000 boundaries deterministically", () => {
    expect(evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 100_000 }).autoApprove).toBe(true);
    expect(evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 100_001 }).chain).toHaveLength(2);
    expect(evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 1_000_000 }).chain).toHaveLength(2);
    expect(evaluatePolicy(ALL, { ...BASE_INPUT, totalAmountCents: 1_000_001 }).chain).toHaveLength(3);
  });
});
