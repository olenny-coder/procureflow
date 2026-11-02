import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { getVendorOptions } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { RequestWizard } from "@/components/requests/request-wizard";

export const metadata: Metadata = {
  title: "New purchase request",
};

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const user = await requirePageUser();
  const vendors = await getVendorOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New purchase request"
        description="Pick a vendor, describe the purchase and submit. Policy evaluation and the approval chain start automatically."
      />
      <RequestWizard
        vendors={vendors}
        defaultDepartment={user.department || "General"}
      />
    </div>
  );
}
