import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/assistant/review-queue";
import { PageHeader } from "@/components/page-header";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Assistant reviews" };
export const dynamic = "force-dynamic";

export default async function AssistantReviewsPage() {
  const user = await requirePageUser();
  if (!["APPROVER", "FINANCE", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assistant review queue"
        description="Low-confidence values, failed guardrails, malformed model output, and consequential finalizations. Reviewer scope is enforced by role."
      />
      <ReviewQueue />
    </div>
  );
}
