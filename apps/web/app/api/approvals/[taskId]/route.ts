import { approvalDecisionSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getApprovalTaskForApi } from "@/lib/queries";
import { signalApprovalDecision } from "@/lib/temporal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { taskId: string } }) {
  try {
    const user = await requireApiUser(["APPROVER", "FINANCE", "ADMIN"]);
    assertSameOrigin(request);
    enforceRateLimit(`approval:${user.id}`, 30, 60_000);
    const input = await readJson(request, approvalDecisionSchema);

    const row = await getApprovalTaskForApi(context.params.taskId);
    if (!row) throw new ApiError(404, "Approval task not found", "not_found");
    const { task, request: pr } = row;

    if (!["PENDING", "ESCALATED"].includes(task.status)) {
      throw new ApiError(409, `This approval is already ${task.status}`, "not_pending");
    }
    if (pr.currentStep !== task.stepOrder) {
      throw new ApiError(409, "This is not the active approval step", "out_of_order");
    }
    if (!["SUBMITTED", "IN_APPROVAL"].includes(pr.status)) {
      throw new ApiError(409, `The request is ${pr.status} and cannot be approved`, "not_in_approval");
    }
    if (pr.requesterId === user.id) {
      throw new ApiError(403, "Requesters cannot approve their own requests", "self_approval");
    }
    if (task.approverRole && user.role !== task.approverRole && user.role !== "ADMIN") {
      throw new ApiError(
        403,
        `This step requires the ${task.approverRole} role`,
        "role_mismatch",
      );
    }
    if (!pr.workflowId) {
      throw new ApiError(409, "This request has no active Temporal workflow", "workflow_missing");
    }

    await signalApprovalDecision({
      workflowId: pr.workflowId,
      action: input.action,
      taskId: task.id,
      actorId: user.id,
      actorRole: user.role,
      comment: input.comment,
    });

    logger.info("approval_signal_sent", {
      requestId: pr.id,
      workflowId: pr.workflowId,
      taskId: task.id,
      actorId: user.id,
      action: input.action,
    });

    return json(
      {
        accepted: true,
        taskId: task.id,
        requestId: pr.id,
        workflowId: pr.workflowId,
        action: input.action,
      },
      202,
    );
  } catch (error) {
    return handleApiError(error, { route: "POST /api/approvals/:taskId" });
  }
}
