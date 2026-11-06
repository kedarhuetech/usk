import { useMemo, useState } from "react";
import { listBatchExpiryStatus, reconcileBatchQuantities } from "../../services/batchInventoryService.js";
import { getInventoryItems } from "../../services/itemsStorage.js";

export default function BatchExpiryReport() {
  const [items, setItems] = useState(() => getInventoryItems());
  const batches = useMemo(() => listBatchExpiryStatus({ items }), [items]);
  const warnings = useMemo(() => reconcileBatchQuantities(items), [items]);
  return <section className="min-h-0 flex-1 overflow-auto bg-white p-5">
    <div className="mb-4 flex items-center justify-between"><div><h1 className="text-xl font-semibold">Batch Expiry & Stock</h1><p className="text-sm text-slate-500">Near expiry means expiry within the next 30 calendar days.</p></div><button onClick={() => setItems(getInventoryItems())} className="rounded border px-3 py-2 text-sm">Refresh</button></div>
    {warnings.length > 0 && <div role="alert" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Stock reconciliation warnings</b><ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning.itemId}>{warning.itemName}: aggregate {warning.aggregateQuantity}, batch total {warning.batchQuantity} (difference {warning.difference}). {warning.warning}</li>)}</ul></div>}
    <div className="overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Item", "Batch", "Available", "Mfg. date", "Expiry date", "Status"].map((header) => <th key={header} className="border-b px-3 py-3">{header}</th>)}</tr></thead><tbody>{batches.map((batch) => <tr key={`${batch.itemId}:${batch.batchId}:${batch.batchNo}`} className="border-b"><td className="px-3 py-3">{batch.itemName}</td><td className="px-3 py-3 font-mono">{batch.batchNo || "—"}</td><td className="px-3 py-3">{batch.quantity}</td><td className="px-3 py-3">{batch.mfgDate || "—"}</td><td className="px-3 py-3">{batch.expDate}</td><td className={`px-3 py-3 font-semibold ${batch.status === "Expired" ? "text-rose-700" : batch.status === "Near expiry" ? "text-amber-700" : "text-emerald-700"}`}>{batch.status}</td></tr>)}</tbody></table>{!batches.length && <p className="py-12 text-center text-slate-500">No batches with an expiry date were found.</p>}</div>
  </section>;
}
