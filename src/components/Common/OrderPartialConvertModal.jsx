import { useState, useMemo } from "react";
import { FiX, FiCheck, FiAlertCircle, FiArrowRight } from "react-icons/fi";
import { getOrderFulfillmentSummary } from "../../services/transactionRepository.js";

const money = (val) =>
  `₹ ${Number(val || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function OrderPartialConvertDialog({ order, type, onClose, onProceed }) {
  const isPurchase = type === "purchase";
  const summary = useMemo(() => getOrderFulfillmentSummary(order), [order]);

  const [quantities, setQuantities] = useState(() => {
    const initialQty = {};
    summary.rows.forEach((row) => {
      const remaining = Number(row.remainingQty || 0);
      initialQty[row.id] = remaining > 0 ? remaining : 0;
    });
    return initialQty;
  });

  const [selectedRowIds, setSelectedRowIds] = useState(() => {
    const initialSelected = new Set();
    summary.rows.forEach((row) => {
      const remaining = Number(row.remainingQty || 0);
      if (remaining > 0) {
        initialSelected.add(row.id);
      }
    });
    return initialSelected;
  });

  const handleToggleRow = (rowId) => {
    const next = new Set(selectedRowIds);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    setSelectedRowIds(next);
  };

  const handleQtyChange = (rowId, maxRemaining, val) => {
    const num = Math.max(0, Number(val || 0));
    setQuantities((prev) => ({
      ...prev,
      [rowId]: val === "" ? "" : num,
    }));
    if (num > 0 && !selectedRowIds.has(rowId)) {
      setSelectedRowIds((prev) => new Set([...prev, rowId]));
    }
  };

  const handleSetMax = (rowId, maxRemaining) => {
    setQuantities((prev) => ({ ...prev, [rowId]: maxRemaining }));
    setSelectedRowIds((prev) => new Set([...prev, rowId]));
  };

  const handleSelectAll = () => {
    const allIds = new Set();
    const allQty = {};
    summary.rows.forEach((r) => {
      const rem = Number(r.remainingQty || 0);
      if (rem > 0) {
        allIds.add(r.id);
        allQty[r.id] = rem;
      }
    });
    setSelectedRowIds(allIds);
    setQuantities(allQty);
  };

  const handleDeselectAll = () => {
    setSelectedRowIds(new Set());
  };

  // Calculate items to convert
  const itemsToConvert = summary.rows
    .filter((r) => selectedRowIds.has(r.id) && Number(quantities[r.id] || 0) > 0)
    .map((r) => {
      const convertQty = Math.min(Number(quantities[r.id] || 0), Number(r.remainingQty || 0));
      return {
        sourceOrderId: order.id,
        sourceOrderNumber: order.number,
        sourceOrderRowId: r.id,
        item: r.item,
        qty: convertQty,
        orderedQty: r.orderedQty,
        convertedQty: r.convertedQty,
        maxConvertibleQty: r.remainingQty,
        price: r.price,
        unit: r.unit,
        tax: r.tax,
        discount: r.discount,
        discountType: r.discountType,
        cess: r.cess,
        itemId: r.itemId || r.sourceItemId,
        hsn: r.hsn,
      };
    });

  const totalUnitsToConvert = itemsToConvert.reduce((s, i) => s + i.qty, 0);

  // Check for any validation error (e.g. qty > remainingQty)
  const hasOverQuantityError = summary.rows.some((r) => {
    if (!selectedRowIds.has(r.id)) return false;
    const inputVal = Number(quantities[r.id] || 0);
    return inputVal > Number(r.remainingQty || 0);
  });

  const totalValueToConvert = itemsToConvert.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const gross = item.qty * price;
    const discount =
      item.discountType === "amount"
        ? Number(item.discount || 0)
        : gross * (Number(item.discount || 0) / 100);
    const net = Math.max(0, gross - discount);
    const tax = (net * (Number(item.tax) || 0)) / 100;
    const cess = (net * (Number(item.cess) || 0)) / 100;
    return sum + net + tax + cess;
  }, 0);

  const canProceed = itemsToConvert.length > 0 && totalUnitsToConvert > 0 && !hasOverQuantityError;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canProceed) return;
    onProceed(itemsToConvert);
  };

  const partyName = isPurchase
    ? order.supplier || order.partyName || "Supplier"
    : order.customer || order.partyName || "Customer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">
                Convert {isPurchase ? "Purchase Order" : "Sale Order"} #{order.number}
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  summary.status === "Partially Converted"
                    ? "bg-amber-100 text-amber-800"
                    : summary.status === "Fully Converted"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {summary.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {isPurchase ? "Supplier" : "Customer"}:{" "}
              <span className="font-semibold text-slate-700">{partyName}</span> · Order Date:{" "}
              <span className="font-medium text-slate-700">{order.date || "—"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Instructions & Quick actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-2.5 text-xs text-slate-600">
          <div>
            Select items and enter quantities to convert into a{" "}
            <span className="font-semibold text-slate-800">
              {isPurchase ? "Purchase Bill" : "Sale Invoice"}
            </span>
            . Unconverted quantities will remain open on this order.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="rounded font-medium text-blue-600 hover:underline"
            >
              Select All Remaining
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="rounded font-medium text-slate-500 hover:underline"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="w-8 pb-2 text-center">
                  <FiCheck className="mx-auto h-3.5 w-3.5 text-slate-400" />
                </th>
                <th className="pb-2">Item Description</th>
                <th className="pb-2 text-right">Ordered</th>
                <th className="pb-2 text-right">Converted</th>
                <th className="pb-2 text-right">Remaining</th>
                <th className="w-40 pb-2 text-center">Convert Qty</th>
                <th className="pb-2 text-right">Rate</th>
                <th className="pb-2 text-right">Convert Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.rows.map((row) => {
                const isSelected = selectedRowIds.has(row.id);
                const remaining = Number(row.remainingQty || 0);
                const inputVal = quantities[row.id] ?? remaining;
                const isOver = Number(inputVal) > remaining;
                const isFullyDone = remaining <= 0;

                const rowPrice = Number(row.price || 0);
                const rowQty = Math.max(0, Number(inputVal || 0));
                const rowGross = rowQty * rowPrice;
                const rowDisc =
                  row.discountType === "amount"
                    ? Number(row.discount || 0)
                    : rowGross * (Number(row.discount || 0) / 100);
                const rowNet = Math.max(0, rowGross - rowDisc);
                const rowTax = (rowNet * (Number(row.tax) || 0)) / 100;
                const rowCess = (rowNet * (Number(row.cess) || 0)) / 100;
                const convertAmt = rowNet + rowTax + rowCess;

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isFullyDone
                        ? "bg-slate-50 text-slate-400"
                        : isSelected
                        ? "bg-blue-50/40 hover:bg-blue-50/60"
                        : "hover:bg-slate-50/50"
                    }`}
                  >
                    <td className="py-3 text-center">
                      <input
                        type="checkbox"
                        disabled={isFullyDone}
                        checked={isSelected && !isFullyDone}
                        onChange={() => handleToggleRow(row.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="py-3 pr-2">
                      <div className="font-semibold text-slate-800">{row.item || "—"}</div>
                      {row.unit && (
                        <div className="text-[11px] text-slate-400">Unit: {row.unit}</div>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium text-slate-600">
                      {row.orderedQty}
                    </td>
                    <td className="py-3 text-right text-slate-500">
                      <span className={row.convertedQty > 0 ? "font-semibold text-emerald-600" : ""}>
                        {row.convertedQty}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold">
                      <span className={remaining > 0 ? "text-amber-600" : "text-slate-400"}>
                        {remaining}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {!isFullyDone ? (
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            value={inputVal}
                            disabled={!isSelected}
                            onChange={(e) =>
                              handleQtyChange(row.id, remaining, e.target.value)
                            }
                            className={`w-24 rounded border px-2 py-1 text-right text-xs font-semibold focus:outline-none ${
                              isOver
                                ? "border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500"
                                : isSelected
                                ? "border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                : "border-slate-200 bg-slate-100 text-slate-400"
                            }`}
                          />
                          <button
                            type="button"
                            disabled={!isSelected || inputVal === remaining}
                            onClick={() => handleSetMax(row.id, remaining)}
                            className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                            title="Set maximum remaining quantity"
                          >
                            Max
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">Fulfilled</span>
                      )}
                      {isOver && (
                        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-rose-600">
                          <FiAlertCircle className="h-3 w-3" /> Max {remaining}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium text-slate-600">
                      ₹{rowPrice}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {isSelected && !isFullyDone ? money(convertAmt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer with conversion summary & action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[11px] font-medium text-slate-500">Selected Items:</span>
              <div className="text-sm font-bold text-slate-800">
                {itemsToConvert.length} of {summary.rows.length}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Total Units to Convert:</span>
              <div className="text-sm font-bold text-blue-600">
                {totalUnitsToConvert}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Conversion Value:</span>
              <div className="text-sm font-bold text-emerald-600">
                {money(totalValueToConvert)}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Remaining Balance After:</span>
              <div className="text-sm font-bold text-slate-600">
                {money(Math.max(0, summary.remainingAmount - totalValueToConvert))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canProceed}
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Proceed to {isPurchase ? "Purchase Bill" : "Sale Invoice"}</span>
              <FiArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderPartialConvertModal({
  isOpen,
  order,
  type = "sale", // "sale" or "purchase"
  onClose,
  onProceed,
}) {
  if (!isOpen || !order) return null;

  return (
    <OrderPartialConvertDialog
      key={`${order.id}-${order.status}-${order.remainingQty}`}
      order={order}
      type={type}
      onClose={onClose}
      onProceed={onProceed}
    />
  );
}
