import "@procureflow/shared/load-env";
import bcrypt from "bcryptjs";
import type { PolicyApprover, PolicyConditions } from "@procureflow/shared";
import { createDb } from "./client";
import {
  approvalTasks,
  auditEvents,
  notificationOutbox,
  policies,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  users,
  vendors,
} from "./schema";

const DEMO_PASSWORD = "Demo1234!";

const DEMO_USERS = [
  {
    email: "requester@procureflow.dev",
    name: "Riley Requester",
    role: "REQUESTER" as const,
    department: "Engineering",
  },
  {
    email: "approver@procureflow.dev",
    name: "Avery Approver",
    role: "APPROVER" as const,
    department: "Engineering",
  },
  {
    email: "finance@procureflow.dev",
    name: "Finley Finance",
    role: "FINANCE" as const,
    department: "Finance",
  },
  {
    email: "admin@procureflow.dev",
    name: "Alex Admin",
    role: "ADMIN" as const,
    department: "Operations",
  },
];

const VENDOR_IDS = {
  acme: "11111111-1111-4111-8111-111111111111",
  northwind: "22222222-2222-4222-8222-222222222222",
  apex: "33333333-3333-4333-8333-333333333333",
};

const REQUEST_IDS = {
  poIssued: "44444444-4444-4444-8444-444444444444",
  draft: "55555555-5555-4555-8555-555555555555",
};

const ITEM_IDS = {
  laptop: "66666666-6666-4666-8666-666666666661",
  dock: "66666666-6666-4666-8666-666666666662",
  monitor: "66666666-6666-4666-8666-666666666663",
};

const TASK_IDS = {
  poApprover: "77777777-7777-4777-8777-777777777771",
  poFinance: "77777777-7777-4777-8777-777777777772",
};

const PO_ID = "88888888-8888-4888-8888-888888888888";

interface SeedPolicy {
  id: string;
  name: string;
  description: string;
  priority: number;
  conditions: PolicyConditions;
  approvers: PolicyApprover[];
}

const POLICIES: SeedPolicy[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    name: "Low-value auto-approval",
    description: "Purchases of $1,000 or less are auto-approved and routed straight to a PO.",
    priority: 10,
    conditions: { maxAmountCents: 100_000 },
    approvers: [],
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    name: "Standard purchase review",
    description: "Purchases between $1,000.01 and $10,000 need a manager and finance approval.",
    priority: 20,
    conditions: { minAmountCents: 100_001, maxAmountCents: 1_000_000 },
    approvers: [
      { role: "APPROVER", dueInHours: 24 },
      { role: "FINANCE", dueInHours: 24 },
    ],
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    name: "High-value purchase review",
    description: "Purchases over $10,000 add an admin/compliance approval.",
    priority: 30,
    conditions: { minAmountCents: 1_000_001 },
    approvers: [
      { role: "APPROVER", dueInHours: 24 },
      { role: "FINANCE", dueInHours: 24 },
      { role: "ADMIN", dueInHours: 48 },
    ],
  },
  {
    id: "a1000000-0000-4000-8000-000000000004",
    name: "High-risk vendor compliance",
    description: "High-risk vendors always require admin/compliance review.",
    priority: 15,
    conditions: { vendorRiskLevels: ["HIGH"] },
    approvers: [{ role: "ADMIN", dueInHours: 48 }],
  },
  {
    id: "a1000000-0000-4000-8000-000000000005",
    name: "Unapproved vendor check",
    description: "Vendors that are not yet approved require an admin review before purchase.",
    priority: 16,
    conditions: { vendorStatuses: ["DRAFT", "PENDING_REVIEW"] },
    approvers: [{ role: "ADMIN", dueInHours: 48 }],
  },
  {
    id: "a1000000-0000-4000-8000-000000000006",
    name: "Urgent purchase finance fast-track",
    description: "HIGH urgency purchases give finance a 12 hour SLA.",
    priority: 18,
    conditions: { urgencies: ["HIGH"] },
    approvers: [{ role: "FINANCE", dueInHours: 12 }],
  },
];

function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
}

async function main(): Promise<void> {
  const { db, client } = createDb();

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const userIds = new Map<string, string>();
    for (const user of DEMO_USERS) {
      const [row] = await db
        .insert(users)
        .values({ ...user, passwordHash, active: true })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            name: user.name,
            role: user.role,
            department: user.department,
            passwordHash,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id, email: users.email });
      if (!row) throw new Error(`Failed to seed user ${user.email}`);
      userIds.set(row.email, row.id);
    }

    const requesterId = userIds.get("requester@procureflow.dev")!;
    const approverId = userIds.get("approver@procureflow.dev")!;
    const financeId = userIds.get("finance@procureflow.dev")!;
    const adminId = userIds.get("admin@procureflow.dev")!;

    const seedVendors = [
      {
        id: VENDOR_IDS.acme,
        name: "Acme Cloud Services",
        website: "https://acme.example.com",
        contactEmail: "sales@acme.example.com",
        status: "APPROVED" as const,
        riskLevel: "LOW" as const,
        taxId: "US-84-1928374",
        bankAccountMasked: "****4821",
        riskSummary:
          "Established cloud infrastructure provider. Low risk: approved vendor, US tax ID on file.",
        createdBy: adminId,
      },
      {
        id: VENDOR_IDS.northwind,
        name: "Northwind Office Supply",
        website: "https://northwind.example.com",
        contactEmail: "orders@northwind.example.com",
        status: "APPROVED" as const,
        riskLevel: "LOW" as const,
        taxId: "US-27-1102938",
        bankAccountMasked: "****7710",
        riskSummary:
          "Office equipment reseller. Low risk: approved vendor with stable order history.",
        createdBy: adminId,
      },
      {
        id: VENDOR_IDS.apex,
        name: "Apex Consulting Group",
        website: "https://apex.example.com",
        contactEmail: "contracts@apex.example.com",
        status: "PENDING_REVIEW" as const,
        riskLevel: "HIGH" as const,
        taxId: "US-61-4492011",
        bankAccountMasked: "****0032",
        riskSummary:
          "New professional services vendor. High risk: onboarding not complete, high-value contract.",
        createdBy: adminId,
      },
    ];

    for (const vendor of seedVendors) {
      await db
        .insert(vendors)
        .values(vendor)
        .onConflictDoUpdate({
          target: vendors.id,
          set: {
            name: vendor.name,
            website: vendor.website,
            contactEmail: vendor.contactEmail,
            status: vendor.status,
            riskLevel: vendor.riskLevel,
            taxId: vendor.taxId,
            bankAccountMasked: vendor.bankAccountMasked,
            riskSummary: vendor.riskSummary,
            updatedAt: new Date(),
          },
        });
    }

    for (const policy of POLICIES) {
      await db
        .insert(policies)
        .values({ ...policy, enabled: true })
        .onConflictDoUpdate({
          target: policies.id,
          set: {
            name: policy.name,
            description: policy.description,
            priority: policy.priority,
            enabled: true,
            conditions: policy.conditions,
            approvers: policy.approvers,
            updatedAt: new Date(),
          },
        });
    }

    const submittedAt = daysAgo(6);
    await db
      .insert(purchaseRequests)
      .values({
        id: REQUEST_IDS.poIssued,
        requesterId,
        department: "Engineering",
        title: "MacBooks for new platform engineers",
        justification: "Two new platform engineers start next week and need standard development laptops.",
        urgency: "NORMAL",
        category: "IT_HARDWARE",
        vendorId: VENDOR_IDS.northwind,
        currency: "USD",
        totalAmountCents: 290_000,
        status: "PO_ISSUED",
        currentStep: 2,
        revision: 1,
        workflowId: `purchase-request-${REQUEST_IDS.poIssued}`,
        submittedAt,
        createdAt: submittedAt,
        updatedAt: daysAgo(5),
      })
      .onConflictDoUpdate({
        target: purchaseRequests.id,
        set: {
          status: "PO_ISSUED",
          currentStep: 2,
          submittedAt,
          updatedAt: daysAgo(5),
        },
      });

    await db
      .insert(purchaseRequestItems)
      .values([
        {
          id: ITEM_IDS.laptop,
          requestId: REQUEST_IDS.poIssued,
          description: '14" developer laptop, 32GB RAM, 1TB SSD',
          quantity: 2,
          unitPriceCents: 145_000,
          totalPriceCents: 290_000,
        },
      ])
      .onConflictDoUpdate({
        target: purchaseRequestItems.id,
        set: { quantity: 2, unitPriceCents: 145_000, totalPriceCents: 290_000 },
      });

    await db
      .insert(approvalTasks)
      .values([
        {
          id: TASK_IDS.poApprover,
          requestId: REQUEST_IDS.poIssued,
          stepOrder: 1,
          approverRole: "APPROVER",
          status: "APPROVED",
          comment: "Approved - within the platform team hardware budget.",
          dueAt: new Date(submittedAt.getTime() + 24 * 3_600_000),
          actedAt: daysAgo(6, -2),
          actedBy: approverId,
          escalationCount: 0,
          workflowId: `purchase-request-${REQUEST_IDS.poIssued}`,
        },
        {
          id: TASK_IDS.poFinance,
          requestId: REQUEST_IDS.poIssued,
          stepOrder: 2,
          approverRole: "FINANCE",
          status: "APPROVED",
          comment: "Coding-against budget confirmed.",
          dueAt: new Date(submittedAt.getTime() + 48 * 3_600_000),
          actedAt: daysAgo(5, 4),
          actedBy: financeId,
          escalationCount: 0,
          workflowId: `purchase-request-${REQUEST_IDS.poIssued}`,
        },
      ])
      .onConflictDoUpdate({
        target: approvalTasks.id,
        set: { status: "APPROVED" },
      });

    await db
      .insert(purchaseOrders)
      .values({
        id: PO_ID,
        requestId: REQUEST_IDS.poIssued,
        poNumber: "PO-2026-0001",
        status: "SYNCED",
        issuedAt: daysAgo(5),
        erpReference: "CSV-PO-2026-0001",
      })
      .onConflictDoUpdate({
        target: purchaseOrders.id,
        set: { status: "SYNCED", erpReference: "CSV-PO-2026-0001" },
      });

    await db
      .insert(purchaseRequests)
      .values({
        id: REQUEST_IDS.draft,
        requesterId,
        department: "Engineering",
        title: "Standing desks for the platform pod",
        justification: "The platform pod is expanding to eight engineers and needs two additional standing desks.",
        urgency: "LOW",
        category: "OFFICE",
        vendorId: VENDOR_IDS.northwind,
        currency: "USD",
        totalAmountCents: 64_000,
        status: "DRAFT",
        currentStep: 0,
        revision: 1,
        createdAt: daysAgo(1),
        updatedAt: daysAgo(1),
      })
      .onConflictDoUpdate({
        target: purchaseRequests.id,
        set: { status: "DRAFT", updatedAt: daysAgo(1) },
      });

    await db
      .insert(purchaseRequestItems)
      .values({
        id: ITEM_IDS.monitor,
        requestId: REQUEST_IDS.draft,
        description: "Electric sit/stand desk, 60x30",
        quantity: 2,
        unitPriceCents: 32_000,
        totalPriceCents: 64_000,
      })
      .onConflictDoUpdate({
        target: purchaseRequestItems.id,
        set: { quantity: 2, unitPriceCents: 32_000, totalPriceCents: 64_000 },
      });

    const seededAudit = [
      {
        action: "REQUEST_CREATED",
        at: submittedAt,
        actorId: requesterId,
        meta: { title: "MacBooks for new platform engineers" },
      },
      { action: "REQUEST_SUBMITTED", at: submittedAt, actorId: requesterId, meta: { amountCents: 290_000 } },
      {
        action: "POLICY_EVALUATED",
        at: submittedAt,
        actorId: null,
        meta: { chain: ["APPROVER", "FINANCE"], matched: ["Standard purchase review"] },
      },
      {
        action: "APPROVAL_GRANTED",
        at: daysAgo(6, -2),
        actorId: approverId,
        meta: { step: 1, role: "APPROVER", actor: "Avery Approver" },
      },
      {
        action: "APPROVAL_GRANTED",
        at: daysAgo(5, 4),
        actorId: financeId,
        meta: { step: 2, role: "FINANCE", actor: "Finley Finance" },
      },
      { action: "REQUEST_APPROVED", at: daysAgo(5, 4), actorId: financeId, meta: { chainLength: 2 } },
      {
        action: "PO_ISSUED",
        at: daysAgo(5),
        actorId: financeId,
        meta: { poNumber: "PO-2026-0001" },
      },
      {
        action: "PO_SYNCED",
        at: daysAgo(5),
        actorId: null,
        meta: { erpReference: "CSV-PO-2026-0001" },
      },
    ];

    for (const [index, event] of seededAudit.entries()) {
      await db
        .insert(auditEvents)
        .values({
          entityType: "PURCHASE_REQUEST",
          entityId: REQUEST_IDS.poIssued,
          action: event.action,
          actorId: event.actorId,
          metadata: event.meta,
          dedupeKey: `seed:${REQUEST_IDS.poIssued}:${event.action}:${index}`,
          createdAt: event.at,
        })
        .onConflictDoNothing({ target: auditEvents.dedupeKey });
    }

    await db
      .insert(notificationOutbox)
      .values({
        channel: "EMAIL",
        recipient: "requester@procureflow.dev",
        subject: "PO PO-2026-0001 issued",
        body: "Purchase order PO-2026-0001 has been issued and synced to the ERP CSV export.",
        status: "SENT",
        sentAt: daysAgo(5),
        dedupeKey: "seed:po-issued-notification",
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "db_seed_complete",
        users: DEMO_USERS.map((user) => user.email),
        demoPassword: DEMO_PASSWORD,
        vendors: 3,
        policies: POLICIES.length,
        sampleRequests: 2,
      }),
    );
  } finally {
    await client.end({ timeout: 10 });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "db_seed_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
