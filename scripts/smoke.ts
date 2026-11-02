/**
 * End-to-end smoke test against a running ProcureFlow stack.
 *
 * Prerequisites: Postgres, Temporal, the worker and the Next.js app are running,
 * and the database has been migrated + seeded.
 *
 *   pnpm smoke
 *   BASE_URL=http://localhost:3000 pnpm smoke
 *
 * It exercises the real HTTP API, real Temporal workflows and the real database:
 * login -> create request -> submit -> manager approve -> finance approve ->
 * PO issued -> audit trail visible.
 */
import "dotenv/config";

const BASE_URL = process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo1234!";

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

class HttpClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private captureCookies(response: Response): void {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const header of setCookies) {
      const [pair] = header.split(";");
      if (!pair) continue;
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    this.captureCookies(response);
    return response;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    const text = await response.text();
    if (!response.ok) {
      let parsed: ApiErrorBody | null = null;
      try {
        parsed = JSON.parse(text) as ApiErrorBody;
      } catch {
        // ignore
      }
      throw new Error(
        `${init.method ?? "GET"} ${path} failed (${response.status}): ${
          parsed?.error?.message ?? text.slice(0, 300)
        }`,
      );
    }
    return JSON.parse(text) as T;
  }

  async login(email: string): Promise<void> {
    const csrf = await this.json<{ csrfToken: string }>("/api/auth/csrf");
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${this.baseUrl}/`,
      json: "true",
    });
    const response = await this.request("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (response.status >= 400) {
      throw new Error(`Login failed for ${email}: HTTP ${response.status} ${await response.text()}`);
    }
    const session = await this.json<{ user?: { email?: string } }>("/api/auth/session");
    if (!session.user?.email) throw new Error(`Login did not create a session for ${email}`);
    console.log(`  ✓ signed in ${email} as ${session.user.email}`);
  }
}

interface VendorRow {
  id: string;
  name: string;
  status: string;
}

interface CreatedRequest {
  request: { id: string };
}

interface RequestDetailResponse {
  request: {
    id: string;
    status: string;
    revision: number;
    totalAmountCents: number;
    purchaseOrder: { poNumber: string; status: string } | null;
    approvalTasks: Array<{ id: string; stepOrder: number; approverRole: string; status: string }>;
    audit: Array<{ action: string }>;
    workflowId: string | null;
  };
  workflowState: { status: string; pendingTask: { taskId: string; role: string } | null } | null;
}

interface ApprovalRow {
  taskId: string;
  requestId: string;
  stepOrder: number;
  status: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = 45_000,
  intervalMs = 1_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${String(lastError)}` : ""}`,
  );
}

async function approveTask(
  client: HttpClient,
  requestId: string,
  expectedRole: string,
  comment: string,
): Promise<void> {
  const task = await waitFor<ApprovalRow>(
    `${expectedRole} approval task`,
    async () => {
      const data = await client.json<{ items: ApprovalRow[] }>("/api/approvals");
      return data.items.find((item) => item.requestId === requestId) ?? null;
    },
  );
  const response = await client.request(`/api/approvals/${task.taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "APPROVE", comment }),
  });
  if (!response.ok) {
    throw new Error(`Approval failed: ${response.status} ${await response.text()}`);
  }
  console.log(`  ✓ ${expectedRole} approved step ${task.stepOrder}`);
}

async function main(): Promise<void> {
  console.log(`ProcureFlow smoke test against ${BASE_URL}`);

  const requester = new HttpClient(BASE_URL);
  const approver = new HttpClient(BASE_URL);
  const finance = new HttpClient(BASE_URL);

  const health = await requester.json<{
    status: string;
    checks: { database: { ok: boolean }; temporal: { ok: boolean; address: string } };
  }>("/api/health");
  if (health.status !== "ok") {
    throw new Error(`Health check is not OK: ${JSON.stringify(health)}`);
  }
  console.log(`  ✓ health ok (Temporal ${health.checks.temporal.address})`);

  await requester.login("requester@procureflow.dev");
  await approver.login("approver@procureflow.dev");
  await finance.login("finance@procureflow.dev");

  const vendors = await requester.json<{ items: VendorRow[] }>("/api/vendors");
  const vendor = vendors.items.find((item) => item.status === "APPROVED");
  if (!vendor) throw new Error("No approved vendor in seed data");

  const title = `Smoke test laptops ${Date.now()}`;
  const created = await requester.json<CreatedRequest>("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      justification: "Two replacement laptops are needed by the platform on-call rotation.",
      department: "Engineering",
      urgency: "NORMAL",
      category: "IT_HARDWARE",
      vendorId: vendor.id,
      currency: "USD",
      items: [
        { description: "14-inch developer laptop, 32GB RAM", quantity: 2, unitPrice: 1450 },
      ],
    }),
  });
  const requestId = created.request.id;
  console.log(`  ✓ created draft ${requestId}`);

  const submitResponse = await requester.request(`/api/requests/${requestId}/submit`, {
    method: "POST",
  });
  if (!submitResponse.ok) {
    throw new Error(`Submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
  }
  console.log("  ✓ submitted request; Temporal workflow started");

  const detail = await waitFor<RequestDetailResponse>(
    "approval chain",
    async () => {
      const data = await requester.json<RequestDetailResponse>(`/api/requests/${requestId}`);
      return data.request.status === "IN_APPROVAL" && data.request.approvalTasks.length > 0
        ? data
        : null;
    },
  );
  if (!detail.workflowState) {
    console.log("  ! workflow query unavailable (worker may be between tasks); continuing on DB read model");
  } else {
    console.log(`  ✓ workflow query: ${detail.workflowState.status}, pending ${detail.workflowState.pendingTask?.role ?? "none"}`);
  }

  await approveTask(approver, requestId, "APPROVER", "Approved - within team hardware budget.");
  await approveTask(finance, requestId, "FINANCE", "Budget confirmed.");

  const final = await waitFor<RequestDetailResponse>(
    "purchase order",
    async () => {
      const data = await requester.json<RequestDetailResponse>(`/api/requests/${requestId}`);
      return data.request.status === "PO_ISSUED" && data.request.purchaseOrder ? data : null;
    },
    60_000,
  );

  const actions = new Set(final.request.audit.map((event) => event.action));
  for (const required of ["REQUEST_SUBMITTED", "POLICY_EVALUATED", "APPROVAL_GRANTED", "PO_ISSUED"]) {
    if (!actions.has(required)) {
      throw new Error(`Audit trail is missing ${required}. Got: ${[...actions].join(", ")}`);
    }
  }

  console.log(
    `  ✓ PO ${final.request.purchaseOrder?.poNumber} issued (${final.request.purchaseOrder?.status})`,
  );
  console.log(`  ✓ audit trail has ${final.request.audit.length} events: ${[...actions].join(", ")}`);

  // ---- Vendor onboarding workflow (compliance approval + signal) ----------
  const vendorName = `Smoke Vendor ${Date.now()}`;
  const vendorResponse = await requester.json<{ vendor: { id: string } }>("/api/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: vendorName,
      website: "https://smoke-vendor.example.com",
      contactEmail: `smoke-${Date.now()}@example.com`,
      riskLevel: "MEDIUM",
    }),
  });
  const vendorId = vendorResponse.vendor.id;

  const reviewResponse = await finance.request(`/api/vendors/${vendorId}/review`, { method: "POST" });
  if (!reviewResponse.ok) {
    throw new Error(`Vendor review start failed: ${reviewResponse.status} ${await reviewResponse.text()}`);
  }
  const decisionResponse = await finance.request(`/api/vendors/${vendorId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "APPROVE", comment: "Compliance review complete.", riskLevel: "LOW" }),
  });
  if (!decisionResponse.ok) {
    throw new Error(
      `Vendor decision failed: ${decisionResponse.status} ${await decisionResponse.text()}`,
    );
  }
  await waitFor(
    "vendor onboarding decision",
    async () => {
      const data = await requester.json<{ items: VendorRow[] }>("/api/vendors");
      const vendor = data.items.find((item) => item.id === vendorId);
      return vendor?.status === "APPROVED" ? vendor : null;
    },
    30_000,
  );
  console.log(`  ✓ vendor ${vendorName} onboarded via workflow (APPROVED)`);

  // ---- Auto-approval path (<= $1,000 issues a PO with no human tasks) -----
  const autoCreated = await requester.json<CreatedRequest>("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Smoke auto-approve monitor ${Date.now()}`,
      justification: "A low-value monitor is needed for the on-call desk.",
      department: "Engineering",
      urgency: "LOW",
      category: "IT_HARDWARE",
      vendorId,
      currency: "USD",
      items: [{ description: "27-inch monitor", quantity: 1, unitPrice: 450 }],
    }),
  });
  const autoRequestId = autoCreated.request.id;
  const autoSubmit = await requester.request(`/api/requests/${autoRequestId}/submit`, {
    method: "POST",
  });
  if (!autoSubmit.ok) {
    throw new Error(`Auto-approve submit failed: ${autoSubmit.status} ${await autoSubmit.text()}`);
  }
  const autoFinal = await waitFor<RequestDetailResponse>(
    "auto-approved purchase order",
    async () => {
      const data = await requester.json<RequestDetailResponse>(`/api/requests/${autoRequestId}`);
      return data.request.status === "PO_ISSUED" && data.request.purchaseOrder ? data : null;
    },
    45_000,
  );
  if (autoFinal.request.approvalTasks.length !== 0) {
    throw new Error("Auto-approval unexpectedly created human approval tasks");
  }
  console.log(
    `  ✓ auto-approved $450 request issued ${autoFinal.request.purchaseOrder?.poNumber} with no approval tasks`,
  );

  // ---- Changes requested -> resubmit signal -> revision 2 -> PO ------------
  const changeCreated = await requester.json<CreatedRequest>("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Smoke revision flow ${Date.now()}`,
      justification: "A revision-cycle test for the approval workflow.",
      department: "Engineering",
      urgency: "NORMAL",
      category: "SOFTWARE",
      vendorId: vendor.id,
      currency: "USD",
      items: [{ description: "Annual design tool seat", quantity: 1, unitPrice: 1200 }],
    }),
  });
  const changeRequestId = changeCreated.request.id;
  const changeSubmit = await requester.request(`/api/requests/${changeRequestId}/submit`, {
    method: "POST",
  });
  if (!changeSubmit.ok) {
    throw new Error(`Revision submit failed: ${changeSubmit.status} ${await changeSubmit.text()}`);
  }
  const changeTask = await waitFor<ApprovalRow>("approver task for revision flow", async () => {
    const data = await approver.json<{ items: ApprovalRow[] }>("/api/approvals");
    return data.items.find((item) => item.requestId === changeRequestId) ?? null;
  });
  const changeResponse = await approver.request(`/api/approvals/${changeTask.taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "REQUEST_CHANGES", comment: "Please add more detail to the scope." }),
  });
  if (!changeResponse.ok) {
    throw new Error(`Request changes failed: ${changeResponse.status} ${await changeResponse.text()}`);
  }
  await waitFor("changes requested state", async () => {
    const data = await requester.json<RequestDetailResponse>(`/api/requests/${changeRequestId}`);
    return data.request.status === "CHANGES_REQUESTED" ? data : null;
  });
  const resubmitResponse = await requester.request(`/api/requests/${changeRequestId}/submit`, {
    method: "POST",
  });
  if (!resubmitResponse.ok) {
    throw new Error(`Resubmit failed: ${resubmitResponse.status} ${await resubmitResponse.text()}`);
  }
  await waitFor("revision 2 approval chain", async () => {
    const data = await requester.json<RequestDetailResponse>(`/api/requests/${changeRequestId}`);
    return data.request.revision === 2 && data.request.status === "IN_APPROVAL" ? data : null;
  });
  await approveTask(approver, changeRequestId, "APPROVER", "Revision looks good.");
  await approveTask(finance, changeRequestId, "FINANCE", "Revision budget confirmed.");
  const changeFinal = await waitFor<RequestDetailResponse>(
    "revision purchase order",
    async () => {
      const data = await requester.json<RequestDetailResponse>(`/api/requests/${changeRequestId}`);
      return data.request.status === "PO_ISSUED" && data.request.purchaseOrder ? data : null;
    },
    60_000,
  );
  const revisionActions = changeFinal.request.audit.map((event) => event.action);
  const count = (action: string) => revisionActions.filter((entry) => entry === action).length;
  if (count("APPROVAL_TASKS_CREATED") < 2 || count("REQUEST_RESUBMITTED") < 1) {
    throw new Error(
      `Revision audit trail is incomplete: ${JSON.stringify(revisionActions)}`,
    );
  }
  console.log(
    `  ✓ changes requested -> resubmitted -> revision 2 -> ${changeFinal.request.purchaseOrder?.poNumber}`,
  );
  console.log(
    `  ✓ revision audit preserved (${count("APPROVAL_TASKS_CREATED")} approval plans, ${count("APPROVAL_GRANTED")} decisions)`,
  );

  console.log("\nSMOKE TEST PASSED");
}

main().catch((error) => {
  console.error("\nSMOKE TEST FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
