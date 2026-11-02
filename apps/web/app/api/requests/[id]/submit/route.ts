import { ApiError, assertSameOrigin, handleApiError, json, requireApiUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestForWorkflow } from "@/lib/queries";
import {
  requestWorkflowId,
  signalResubmission,
  startPurchaseRequestWorkflow,
} from "@/lib/orchestration";
import { WORKFLOW_IDS } from "@procureflow/shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    enforceRateLimit(`request-submit:${user.id}`, 20, 60_000);

    const row = await getRequestForWorkflow(context.params.id);
    if (!row) throw new ApiError(404, "Purchase request not found", "not_found");
    const { request: pr } = row;

    if (pr.requesterId !== user.id) {
      throw new ApiError(403, "Only the requester can submit this request", "forbidden");
    }
    if (["SUBMITTED", "IN_APPROVAL"].includes(pr.status)) {
      throw new ApiError(409, "This request is already in approval", "already_submitted");
    }
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(pr.status)) {
      throw new ApiError(409, `A request in ${pr.status} cannot be submitted`, "not_submittable");
    }

    if (pr.status === "CHANGES_REQUESTED" && pr.workflowId) {
      try {
        await signalResubmission({
          workflowId: pr.workflowId,
          actorId: user.id,
          actorRole: user.role,
        });
        return json({ workflowId: pr.workflowId, resumed: true }, 202);
      } catch {
        // The prior run may have completed after the 30-day resubmission window.
        // Fall through and start a fresh deterministic workflow for the next revision.
      }
    }

    const nextRevision = pr.status === "CHANGES_REQUESTED" ? pr.revision + 1 : pr.revision;
    const workflowId = requestWorkflowId(
      pr.id,
      nextRevision,
      pr.status === "CHANGES_REQUESTED" ? null : pr.workflowId,
    );
    const result = await startPurchaseRequestWorkflow({
      requestId: pr.id,
      actorId: user.id,
      actorRole: user.role,
      workflowId,
    });

    if (result.alreadyRunning) {
      return json({ workflowId: result.workflowId, alreadyRunning: true }, 202);
    }
    return json({ workflowId: result.workflowId, runId: result.runId, started: true }, 202);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/requests/:id/submit" });
  }
}
