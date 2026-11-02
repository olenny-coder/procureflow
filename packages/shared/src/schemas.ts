import { z } from "zod";
import {
  DECISION_ACTIONS,
  REQUEST_STATUSES,
  RISK_LEVELS,
  ROLES,
  URGENCIES,
  VENDOR_STATUSES,
} from "./domain";

/** Decimal major-unit amount accepted from JSON or form data. */
export const decimalAmount = z.coerce
  .number({ invalid_type_error: "Enter a valid amount" })
  .finite("Enter a valid amount")
  .positive("Amount must be greater than zero")
  .max(50_000_000, "Amount is too large")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Amount may have at most two decimal places",
  });

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Email is required")
  .max(254)
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password is too long");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(200),
});

export const idSchema = z.string().uuid("Invalid identifier");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const requestItemSchema = z.object({
  description: z.string().trim().min(2, "Describe the item").max(240),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100_000),
  unitPrice: decimalAmount,
});

export const requestCreateSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(140),
    justification: z.string().trim().min(10, "Explain why this purchase is needed").max(4_000),
    department: z.string().trim().min(1, "Department is required").max(80),
    urgency: z.enum(URGENCIES).default("NORMAL"),
    category: z.string().trim().min(1).max(80).default("GENERAL"),
    vendorId: idSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code")
      .default("USD"),
    items: z.array(requestItemSchema).min(1, "Add at least one line item").max(50),
  })
  .superRefine((value, ctx) => {
    const total = value.items.reduce(
      (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
      0,
    );
    if (total <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Total must be positive" });
    }
    if (total > 5_000_000_00) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Total exceeds the MVP limit" });
    }
  });

export const requestUpdateSchema = requestCreateSchema;

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(2, "Vendor name is too short").max(140),
  website: z
    .union([z.string().trim().url("Enter a valid URL").max(300), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  contactEmail: emailSchema,
  taxId: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
  bankAccountMasked: z
    .string()
    .trim()
    .max(40)
    .regex(/^[*\d -]*$/, "Use a masked account number, e.g. ****1234")
    .optional()
    .transform((value) => (value ? value : undefined)),
  riskLevel: z.enum(RISK_LEVELS).default("LOW"),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

export const vendorDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "BLOCK"]),
    riskLevel: z.enum(RISK_LEVELS).optional(),
    comment: z.string().trim().min(3, "Add a short review note").max(2_000),
  })
  .refine((value) => (value.decision === "BLOCK" ? Boolean(value.comment) : true), {
    message: "A reason is required to block a vendor",
    path: ["comment"],
  });

export const approvalDecisionSchema = z
  .object({
    action: z.enum(DECISION_ACTIONS),
    comment: z.string().trim().max(2_000).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.action === "REJECT" || value.action === "REQUEST_CHANGES") && (value.comment?.length ?? 0) < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Add a comment explaining the decision",
      });
    }
  });

export const resubmitSchema = z.object({
  comment: z.string().trim().max(2_000).optional(),
});

export const policyApproverSchema = z.object({
  role: z.enum(ROLES),
  dueInHours: z.coerce.number().int().min(1).max(720),
});

export const policyConditionsSchema = z
  .object({
    minAmountCents: z.number().int().min(0).max(5_000_000_00).optional(),
    maxAmountCents: z.number().int().min(0).max(5_000_000_00).optional(),
    departments: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
    vendorRiskLevels: z.array(z.enum(RISK_LEVELS)).max(3).optional(),
    vendorStatuses: z.array(z.enum(VENDOR_STATUSES)).max(4).optional(),
    urgencies: z.array(z.enum(URGENCIES)).max(3).optional(),
    categories: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  })
  .refine(
    (value) =>
      value.minAmountCents === undefined ||
      value.maxAmountCents === undefined ||
      value.minAmountCents <= value.maxAmountCents,
    { message: "Minimum amount must be below maximum amount", path: ["minAmountCents"] },
  );

export const policyUpsertSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  description: z.string().trim().max(500).optional().default(""),
  priority: z.coerce.number().int().min(0).max(1_000).default(100),
  enabled: z.boolean().default(true),
  conditions: policyConditionsSchema.default({}),
  approvers: z.array(policyApproverSchema).max(8).default([]),
});

export const auditQuerySchema = paginationSchema.extend({
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(100).optional(),
  action: z.string().trim().max(80).optional(),
});

export const requestListQuerySchema = paginationSchema.extend({
  status: z.enum(REQUEST_STATUSES).optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
});

export const notificationProcessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestItemInput = z.infer<typeof requestItemSchema>;
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorDecisionInput = z.infer<typeof vendorDecisionSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type PolicyUpsertInput = z.infer<typeof policyUpsertSchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
