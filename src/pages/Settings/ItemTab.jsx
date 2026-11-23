// Implements the Item Settings Tab interface matching the USK desktop settings.
import { useState } from "react";
import { addCustomUnit, getUnits } from "../../services/unitsStorage.js";

export default function ItemTab({ settings, update }) {
  const [units, setUnits] = useState(getUnits);
  const [newUnit, setNewUnit] = useState("");
  const [unitError, setUnitError] = useState("");

  const handleSaveUnit = () => {
    const value = newUnit.trim().toUpperCase();
    if (!value) return;

    if (units.some((u) => u.toLowerCase() === value.toLowerCase())) {
      setUnitError(`Unit "${value}" already exists.`);
      return;
    }

    setUnitError("");
    const updated = addCustomUnit(value);
    setUnits(updated);
    setNewUnit("");
  };

  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-xs border border-slate-200/80">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ============================================================ */}
        {/* COLUMN 1: Item & Inventory Properties */}
        {/* ============================================================ */}
        <div className="space-y-5 border-b pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8 border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Inventory & Item Properties</h2>
            <p className="mt-1 text-xs text-slate-500">
              Configure inventory tracking, barcode support, batch/serial controls, and stock validation.
            </p>
          </div>

          <div className="space-y-4">
            {/* 1. Barcode Scanning */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableBarcodeScanning ?? true}
                  onChange={(e) => update("enableBarcodeScanning", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Barcode Scanning Support</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Scan barcodes using a USB/Bluetooth barcode scanner or camera to quickly search and add items."
              >
                i
              </span>
            </label>

            {/* 2. Item Categories */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableItemCategory ?? true}
                  onChange={(e) => update("enableItemCategory", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Enable Item Categories & Sub-Categories</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Group items into categories and sub-categories for organized inventory and reporting."
              >
                i
              </span>
            </label>

            {/* 3. Item Description */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableItemDescription ?? true}
                  onChange={(e) => update("enableItemDescription", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Item Description</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Add detailed descriptions or technical specifications to items."
              >
                i
              </span>
            </label>

            {/* 4. Batch Tracking */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(settings.enableBatchTracking)}
                  onChange={(e) => update("enableBatchTracking", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Batch Tracking (Batch No, Expiry & MFG Dates)</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Track items by batch number, expiry date, manufacturing date, and MRP."
              >
                i
              </span>
            </label>

            {/* 5. Serial / IMEI Tracking */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(settings.enableSerialTracking)}
                  onChange={(e) => update("enableSerialTracking", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Serial / IMEI Tracking</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Track unique serial numbers or IMEI numbers for each individual unit of an item."
              >
                i
              </span>
            </label>

            {/* 6. Stock Maintenance (Negative Stock Prevention) */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(settings.stopSaleOnNegativeStock)}
                  onChange={(e) => update("stopSaleOnNegativeStock", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>
                  Stock Maintenance{" "}
                  <span className="font-normal text-slate-500 text-xs">(block sales exceeding available stock)</span>
                </span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Prevent creating sales when inventory reaches zero or requested quantity exceeds available stock."
              >
                i
              </span>
            </label>

            {/* 7. Block New Items From Txn Form */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(settings.blockNewItemsFromTxn)}
                  onChange={(e) => update("blockNewItemsFromTxn", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Block New Items from Txn Form</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Items can only be created from the Items menu, not within invoice or transaction forms."
              >
                i
              </span>
            </label>
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMN 2: Units, Pricing & Tax Configuration */}
        {/* ============================================================ */}
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-800">Units & Pricing Configuration</h2>
            <p className="mt-1 text-xs text-slate-500">
              Manage unit measurements, default unit selections, item-wise discount, and GST taxation.
            </p>
          </div>

          <div className="space-y-4">
            {/* 1. Default Unit */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Default Item Unit</label>
                <p className="text-[11px] text-slate-500">Pre-selected unit for newly created items.</p>
              </div>
              <select
                value={settings.defaultItemUnit || "PCS"}
                onChange={(event) => update("defaultItemUnit", event.target.value)}
                className="h-9 min-w-36 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Custom Units Manager */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Items Unit Manager
                  </label>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Shared unit list used across item forms and transaction line items.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={newUnit}
                  onChange={(event) => {
                    setNewUnit(event.target.value);
                    if (unitError) setUnitError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSaveUnit();
                    }
                  }}
                  placeholder="Add custom unit (e.g. CARTON, DOZEN)"
                  className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-xs focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveUnit}
                  disabled={!newUnit.trim()}
                  className="rounded-md bg-blue-600 px-4 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                >
                  Add Unit
                </button>
              </div>
              {unitError && (
                <p className="text-xs font-medium text-rose-600">{unitError}</p>
              )}

              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                  Available Units ({units.length}):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {units.map((unit) => (
                    <span
                      key={unit}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      {unit}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Item-wise Tax */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableGst ?? true}
                  onChange={(e) => update("enableGst", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Item-wise Tax (GST / Tax Rates)</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Enable item-wise tax rates (GST, IGST, CGST, SGST, Cess) for line items."
              >
                i
              </span>
            </label>

            {/* 4. Item-wise Discount */}
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700 hover:text-slate-900">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.enableItemDiscount ?? true}
                  onChange={(e) => update("enableItemDiscount", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                />
                <span>Item-wise Discount</span>
              </div>
              <span
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400 hover:bg-slate-200 cursor-help"
                title="Allow applying discounts per item row in sale and purchase transactions."
              >
                i
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
