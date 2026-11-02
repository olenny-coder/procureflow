/**
 * Deterministic procurement policy evaluation.
 *
 * This module is pure: no database, network, clock or randomness. The Temporal
 * workflow receives the evaluation from an activity, so the same rules produce
 * the same approval chain on replay.
 */
import {
  ROLE_APPROVAL_ORDER,
  type Role,
  type RiskLevel,
  type Urgency,
  type VendorStatus,
} from "./domain";

export interface PolicyConditions {
  minAmountCents?: number;
  maxAmountCents?: number;
  departments?: string[];
  vendorRiskLevels?: RiskLevel[];
  vendorStatuses?: VendorStatus[];
  urgencies?: Urgency[];
  categories?: string[];
}

export interface PolicyApprover {
  role: Role;
  dueInHours: number;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  enabled: boolean;
  conditions: PolicyConditions;
  approvers: PolicyApprover[];
}

export interface PolicyEvaluationInput {
  totalAmountCents: number;
  department: string;
  vendorRiskLevel: RiskLevel;
  vendorStatus: VendorStatus;
  urgency: Urgency;
  category: string;
}

export interface ApprovalStep {
  stepOrder: number;
  role: Role;
  dueInHours: number;
  ruleIds: string[];
  ruleNames: string[];
}

export interface PolicyEvaluation {
  autoApprove: boolean;
  chain: ApprovalStep[];
  matchedRuleIds: string[];
  matchedRuleNames: string[];
  fallbackApplied: boolean;
  explanation: string;
}

export const FALLBACK_DUE_HOURS = 24;

function includesNormalized(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return true;
  const target = value.trim().toLowerCase();
  return list.some((entry) => entry.trim().toLowerCase() === target);
}

export function policyMatches(policy: PolicyDefinition, input: PolicyEvaluationInput): boolean {
  if (!policy.enabled) return false;
  const c = policy.conditions ?? {};
  if (typeof c.minAmountCents === "number" && input.totalAmountCents < c.minAmountCents) return false;
  if (typeof c.maxAmountCents === "number" && input.totalAmountCents > c.maxAmountCents) return false;
  if (!includesNormalized(c.departments, input.department)) return false;
  if (!includesNormalized(c.categories, input.category)) return false;
  if (c.vendorRiskLevels?.length && !c.vendorRiskLevels.includes(input.vendorRiskLevel)) return false;
  if (c.vendorStatuses?.length && !c.vendorStatuses.includes(input.vendorStatus)) return false;
  if (c.urgencies?.length && !c.urgencies.includes(input.urgency)) return false;
  return true;
}

function describeRule(policy: PolicyDefinition): string {
  return policy.name;
}

/**
 * Evaluate all matching policies, merge their approvers by role and emit the
 * chain in canonical order (approver -> finance -> admin). A matching rule with
 * an empty approver list means "auto-approve" unless another matching rule
 * requires human approval.
 */
export function evaluatePolicy(
  policies: PolicyDefinition[],
  input: PolicyEvaluationInput,
): PolicyEvaluation {
  const matched = policies
    .filter((policy) => policyMatches(policy, input))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const matchedRuleIds = matched.map((policy) => policy.id);
  const matchedRuleNames = matched.map((policy) => policy.name);

  if (matched.length === 0) {
    return {
      autoApprove: false,
      chain: [
        {
          stepOrder: 1,
          role: "ADMIN",
          dueInHours: FALLBACK_DUE_HOURS,
          ruleIds: ["fallback"],
          ruleNames: ["Default admin review"],
        },
      ],
      matchedRuleIds: [],
      matchedRuleNames: [],
      fallbackApplied: true,
      explanation:
        "No policy matched this request, so it falls back to a single admin/compliance review.",
    };
  }

  const byRole = new Map<Role, { dueInHours: number; ruleIds: string[]; ruleNames: string[] }>();
  for (const policy of matched) {
    for (const approver of policy.approvers ?? []) {
      const existing = byRole.get(approver.role);
      if (existing) {
        existing.dueInHours = Math.max(existing.dueInHours, approver.dueInHours);
        if (!existing.ruleIds.includes(policy.id)) existing.ruleIds.push(policy.id);
        if (!existing.ruleNames.includes(describeRule(policy))) existing.ruleNames.push(describeRule(policy));
      } else {
        byRole.set(approver.role, {
          dueInHours: Math.max(1, approver.dueInHours),
          ruleIds: [policy.id],
          ruleNames: [describeRule(policy)],
        });
      }
    }
  }

  const chain: ApprovalStep[] = ROLE_APPROVAL_ORDER.filter((role) => byRole.has(role)).map(
    (role, index) => {
      const entry = byRole.get(role)!;
      return {
        stepOrder: index + 1,
        role,
        dueInHours: entry.dueInHours,
        ruleIds: entry.ruleIds,
        ruleNames: entry.ruleNames,
      };
    },
  );

  const autoApprove = chain.length === 0;
  const explanation = autoApprove
    ? `Matched ${matchedRuleNames.join(", ")}; this request qualifies for auto-approval.`
    : `Matched ${matchedRuleNames.join(", ")}; required approvals: ${chain
        .map((step) => `${step.role} (${step.dueInHours}h)`)
        .join(" -> ")}.`;

  return {
    autoApprove,
    chain,
    matchedRuleIds,
    matchedRuleNames,
    fallbackApplied: false,
    explanation,
  };
}
