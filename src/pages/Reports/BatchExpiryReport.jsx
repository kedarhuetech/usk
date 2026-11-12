import { useCallback, useEffect, useMemo, useState } from "react";
import { listBatchExpiryStatus, reconcileBatchQuantities } from "../../services/batchInventoryService.js";
import { getInventoryItems, normalizeInventoryItem, saveInventoryItem } from "../../services/itemsStorage.js";
import { businessDataApi } from "../../services/apiClient.js";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";

export default function BatchExpiryReport() {
  const [items, setItems] = useState(() => getInventoryItems());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const batches = useMemo(() => listBatchExpiryStatus({ items }), [items]);
  const warnings = useMemo(() => reconcileBatchQuantities(items), [items]);

  const handleRefresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const remoteItems = await businessDataApi.list("items");
      if (Array.isArray(remoteItems) && remoteItems.length > 0) {
        for (const remote of remoteItems) {
          if (remote?.id) {
            saveInventoryItem(normalizeInventoryItem(remote));
          }
        }
      }
      setItems(getInventoryItems());
    } catch (err) {
      setItems(getInventoryItems());
      setError(
        err?.message || "Could not reach backend API to refresh batch records."
      );
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Keep local records in sync when sales, purchases, or adjustments occur in other tabs
  useEffect(() => {
    const handleUpdate = () => setItems(getInventoryItems());
    window.addEventListener("inventory-items-changed", handleUpdate);
    window.addEventListener(businessDataChangedEvent, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("inventory-items-changed", handleUpdate);
      window.removeEventListener(businessDataChangedEvent, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return (
    <section className="min-h-0 flex-1 overflow-auto bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Batch Expiry & Stock</h1>
          <p className="text-sm text-slate-500">
            Near expiry means expiry within the next 30 calendar days.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition"
        >
          {loading ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
              <span>Refreshing...</span>
            </>
          ) : (
            <span>Refresh</span>
          )}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">Backend/API unavailable:</span>
            <span>{error}. Displaying locally saved inventory data.</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="ml-3 shrink-0 rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <b>Stock reconciliation warnings</b>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning.itemId}>
                {warning.itemName}: aggregate {warning.aggregateQuantity}, batch total {warning.batchQuantity} (difference {warning.difference}). {warning.warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {["Item", "Batch", "Available", "Mfg. date", "Expiry date", "Status"].map((header) => (
                <th key={header} className="border-b px-3 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={`${batch.itemId}:${batch.batchId}:${batch.batchNo}`} className="border-b">
                <td className="px-3 py-3">{batch.itemName}</td>
                <td className="px-3 py-3 font-mono">{batch.batchNo || "—"}</td>
                <td className="px-3 py-3">{batch.quantity}</td>
                <td className="px-3 py-3">{batch.mfgDate || "—"}</td>
                <td className="px-3 py-3">{batch.expDate}</td>
                <td
                  className={`px-3 py-3 font-semibold ${
                    batch.status === "Expired"
                      ? "text-rose-700"
                      : batch.status === "Near expiry"
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {batch.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!batches.length && (
          <p className="py-12 text-center text-slate-500">
            No batches with an expiry date were found.
          </p>
        )}
      </div>
    </section>
  );
}
