import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ErpAdapter, ErpPurchaseOrder, ErpSyncResult } from "./types";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Local ERP adapter: writes a deterministic CSV per purchase order. This is a
 * working integration for demos and tests, not a mock screen.
 */
export class CsvErpAdapter implements ErpAdapter {
  readonly name = "csv";

  constructor(private readonly directory: string) {}

  async syncPurchaseOrder(order: ErpPurchaseOrder): Promise<ErpSyncResult> {
    await mkdir(this.directory, { recursive: true });
    const lines = [
      "po_number,request_id,vendor,currency,total,issued_at,line_items",
      [
        order.poNumber,
        order.requestId,
        order.vendorName,
        order.currency,
        (order.amountCents / 100).toFixed(2),
        order.issuedAt,
        order.lineItems
          .map((item) => `${item.quantity}x ${item.description} @ ${(item.unitPriceCents / 100).toFixed(2)}`)
          .join("; "),
      ]
        .map(csvCell)
        .join(","),
    ];
    const file = path.join(this.directory, `${order.poNumber}.csv`);
    await writeFile(file, `${lines.join("\n")}\n`, "utf8");
    return { reference: `CSV-${order.poNumber}` };
  }
}

export class NoopErpAdapter implements ErpAdapter {
  readonly name = "noop";
  async syncPurchaseOrder(_order: ErpPurchaseOrder): Promise<ErpSyncResult> {
    return { reference: null, skipped: true };
  }
}

export function createErpAdapter(kind: string, directory: string): ErpAdapter {
  return kind === "noop" ? new NoopErpAdapter() : new CsvErpAdapter(directory);
}

/** Read back a CSV produced by the local ERP adapter (used by tests/ops). */
export async function readErpCsv(directory: string, poNumber: string): Promise<string> {
  return readFile(path.join(directory, `${poNumber}.csv`), "utf8");
}
