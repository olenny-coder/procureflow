import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RequestEditForm } from "@/components/requests/request-edit-form";
import { getRequestDetail, getVendorOptions } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EditRequestPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();
  const detail = await getRequestDetail(params.id);
  if (!detail) notFound();
  if (detail.requesterId !== user.id && user.role !== "ADMIN") notFound();
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(detail.status)) notFound();

  const vendors = await getVendorOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit request"
        description={`${detail.title} · revision ${detail.revision} · ${detail.status.replace(/_/g, " ").toLowerCase()}`}
      />
      <RequestEditForm
        request={{
          id: detail.id,
          title: detail.title,
          justification: detail.justification,
          department: detail.department,
          category: detail.category,
          urgency: detail.urgency,
          currency: detail.currency,
          vendorId: detail.vendorId,
          status: detail.status,
          items: detail.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        }}
        vendors={vendors}
      />
    </div>
  );
}
