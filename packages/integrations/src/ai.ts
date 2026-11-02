import type { AiRiskInput, AiRiskSummaryAdapter } from "./types";

/**
 * Deterministic, offline "AI" risk summary. It is intentionally rule-based so
 * demos and tests are reproducible and no API key or network call is required.
 * The adapter boundary is the extension point for a real LLM agent later.
 */
export class DeterministicAiRiskSummaryAdapter implements AiRiskSummaryAdapter {
  readonly name = "deterministic";

  async summarize(input: AiRiskInput): Promise<string> {
    const amount = (input.amountCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    const vendorState =
      input.vendorStatus === "APPROVED"
        ? "an approved vendor"
        : input.vendorStatus === "PENDING_REVIEW"
          ? "a vendor still in onboarding"
          : input.vendorStatus === "BLOCKED"
            ? "a blocked vendor"
            : "an unvetted draft vendor";

    const concerns: string[] = [];
    if (input.riskLevel === "HIGH") concerns.push("high inherent risk");
    if (input.vendorStatus !== "APPROVED") concerns.push("incomplete vendor onboarding");
    if (input.amountCents > 1_000_000) concerns.push("high purchase value");
    if (input.category.toUpperCase().includes("CONSULT")) concerns.push("professional services scope");

    const riskClause =
      concerns.length > 0
        ? `Watch items: ${concerns.join(", ")}.`
        : "No additional watch items were identified from the purchase metadata.";

    return `${input.vendorName} is ${vendorState} with a ${input.riskLevel.toLowerCase()} risk rating. The request totals ${amount} in the ${input.category} category. ${riskClause}`;
  }
}

export class DisabledAiRiskSummaryAdapter implements AiRiskSummaryAdapter {
  readonly name = "disabled";
  async summarize(): Promise<string> {
    return "AI risk summaries are disabled in this environment.";
  }
}

export function createAiRiskAdapter(enabled: boolean): AiRiskSummaryAdapter {
  return enabled ? new DeterministicAiRiskSummaryAdapter() : new DisabledAiRiskSummaryAdapter();
}
