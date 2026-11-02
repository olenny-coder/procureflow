import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  PO_STATUSES,
  REQUEST_STATUSES,
  RISK_LEVELS,
  ROLES,
  TASK_STATUSES,
  URGENCIES,
  VENDOR_STATUSES,
  type PolicyApprover,
  type PolicyConditions,
} from "@procureflow/shared";

export const userRoleEnum = pgEnum("user_role", ROLES);
export const vendorStatusEnum = pgEnum("vendor_status", VENDOR_STATUSES);
export const riskLevelEnum = pgEnum("risk_level", RISK_LEVELS);
export const urgencyEnum = pgEnum("urgency", URGENCIES);
export const requestStatusEnum = pgEnum("request_status", REQUEST_STATUSES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const poStatusEnum = pgEnum("po_status", PO_STATUSES);
export const notificationChannelEnum = pgEnum("notification_channel", NOTIFICATION_CHANNELS);
export const notificationStatusEnum = pgEnum("notification_status", NOTIFICATION_STATUSES);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("REQUESTER"),
    department: text("department").notNull().default("General"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    contactEmail: text("contact_email").notNull(),
    status: vendorStatusEnum("status").notNull().default("DRAFT"),
    riskLevel: riskLevelEnum("risk_level").notNull().default("LOW"),
    taxId: text("tax_id"),
    bankAccountMasked: text("bank_account_masked"),
    riskSummary: text("risk_summary"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("vendors_status_idx").on(table.status),
    index("vendors_name_idx").on(table.name),
  ],
);

export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  conditions: jsonb("conditions")
    .$type<PolicyConditions>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  approvers: jsonb("approvers")
    .$type<PolicyApprover[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    department: text("department").notNull(),
    title: text("title").notNull(),
    justification: text("justification").notNull(),
    urgency: urgencyEnum("urgency").notNull().default("NORMAL"),
    category: text("category").notNull().default("GENERAL"),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    totalAmountCents: integer("total_amount_cents").notNull(),
    status: requestStatusEnum("status").notNull().default("DRAFT"),
    currentStep: integer("current_step").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    workflowId: text("workflow_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("purchase_requests_requester_idx").on(table.requesterId),
    index("purchase_requests_status_idx").on(table.status),
  ],
);

export const purchaseRequestItems = pgTable(
  "purchase_request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalPriceCents: integer("total_price_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("purchase_request_items_request_idx").on(table.requestId)],
);

export const approvalTasks = pgTable(
  "approval_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    approverRole: userRoleEnum("approver_role"),
    approverUserId: uuid("approver_user_id").references(() => users.id, { onDelete: "set null" }),
    status: taskStatusEnum("status").notNull().default("PENDING"),
    comment: text("comment"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    actedAt: timestamp("acted_at", { withTimezone: true }),
    actedBy: uuid("acted_by").references(() => users.id, { onDelete: "set null" }),
    escalationCount: integer("escalation_count").notNull().default(0),
    workflowId: text("workflow_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("approval_tasks_request_step_unique").on(table.requestId, table.stepOrder),
    index("approval_tasks_status_idx").on(table.status),
    index("approval_tasks_role_idx").on(table.approverRole),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    poNumber: text("po_number").notNull(),
    status: poStatusEnum("status").notNull().default("ISSUED"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    erpReference: text("erp_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("purchase_orders_request_unique").on(table.requestId),
    uniqueIndex("purchase_orders_number_unique").on(table.poNumber),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("audit_events_dedupe_unique").on(table.dedupeKey),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_action_idx").on(table.action),
  ],
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notificationChannelEnum("channel").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    dedupeKey: text("dedupe_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notification_outbox_dedupe_unique").on(table.dedupeKey),
    index("notification_outbox_status_idx").on(table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
export type PolicyRow = typeof policies.$inferSelect;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert;
export type PurchaseRequestItem = typeof purchaseRequestItems.$inferSelect;
export type ApprovalTask = typeof approvalTasks.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
