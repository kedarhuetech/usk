import React, { useRef, useState } from "react";
import {
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiInfo,
  FiX,
} from "react-icons/fi";

export const PRINT_THEMES = [
  { id: "theme-1", name: "GST Theme 1", desc: "Classic Bordered Grid" },
  { id: "theme-2", name: "GST Theme 2", desc: "Modern Card Header" },
  { id: "theme-3", name: "GST Theme 3", desc: "Elegant Framed Border" },
  { id: "theme-4", name: "GST Theme 4", desc: "Corporate Minimalist" },
  { id: "theme-5", name: "GST Theme 5", desc: "Signature Vyapar Magenta" },
  { id: "theme-6", name: "GST Theme 6", desc: "Premium Bold Accent" },
  { id: "theme-bos", name: "Bill of Supply", desc: "Non-GST Composition" },
  { id: "theme-classic", name: "Classic Simple", desc: "Monochrome Ledger" },
];

export const THEME_COLORS = [
  { id: "magenta", name: "Magenta", hex: "#881337" },
  { id: "maroon", name: "Maroon", hex: "#9f1239" },
  { id: "royal-blue", name: "Royal Blue", hex: "#1d4ed8" },
  { id: "navy", name: "Navy Blue", hex: "#0f172a" },
  { id: "emerald", name: "Emerald", hex: "#047857" },
  { id: "teal", name: "Teal", hex: "#0f766e" },
  { id: "purple", name: "Purple", hex: "#7e22ce" },
  { id: "charcoal", name: "Charcoal", hex: "#334155" },
];

function InfoTooltip({ text }) {
  return (
    <span
      className="inline-flex cursor-help items-center text-slate-400 hover:text-slate-600"
      title={text}
      aria-label={text}
    >
      <FiInfo className="h-3.5 w-3.5 shrink-0" />
    </span>
  );
}

export default function PrintTab({ settings, update }) {
  const [activePrinterTab, setActivePrinterTab] = useState(settings.printActiveTab || "regular");
  const [activeSubTab, setActiveSubTab] = useState(settings.printSubTab || "layout");
  const [carouselIndex, setCarouselIndex] = useState(2);
  const [showTxnNamesModal, setShowTxnNamesModal] = useState(false);
  const [showItemTableModal, setShowItemTableModal] = useState(false);
  const fileInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  const selectedTheme = settings.selectedTheme || "GST Theme 5";
  const themeColor = settings.themeColor || "#881337";

  const handlePrinterTabChange = (tab) => {
    setActivePrinterTab(tab);
    update("printActiveTab", tab);
  };

  const handleSubTabChange = (tab) => {
    setActiveSubTab(tab);
    update("printSubTab", tab);
  };

  const handleThemeSelect = (themeName) => {
    update("selectedTheme", themeName);
  };

  const handleColorSelect = (hex) => {
    update("themeColor", hex);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        update("companyLogo", reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        update("signatureImage", reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden file inputs for logo and signature */}
      <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
      <input type="file" ref={signatureInputRef} onChange={handleSignatureUpload} accept="image/*" className="hidden" />

      {/* Top Header Tabs: REGULAR PRINTER / THERMAL PRINTER */}
      <div className="flex items-center gap-8 border-b border-slate-200 pb-0.5">
        <button
          type="button"
          onClick={() => handlePrinterTabChange("regular")}
          className={`pb-3 text-sm font-bold tracking-wide transition cursor-pointer ${
            activePrinterTab === "regular"
              ? "border-b-2 border-blue-600 text-blue-600 font-extrabold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          REGULAR PRINTER
        </button>
        <button
          type="button"
          onClick={() => handlePrinterTabChange("thermal")}
          className={`pb-3 text-sm font-bold tracking-wide transition cursor-pointer ${
            activePrinterTab === "thermal"
              ? "border-b-2 border-blue-600 text-blue-600 font-extrabold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          THERMAL PRINTER
        </button>
      </div>

      {/* Main Split Layout: Left Controls (46%) / Right Live Invoice Preview (54%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[46%_54%] xl:grid-cols-[45%_55%] gap-5 pt-1 items-start">
        {/* =========================================================
            LEFT COLUMN: Controls & Preferences (Scrollable)
            ========================================================= */}
        <div className="space-y-6 max-h-[calc(100vh-210px)] overflow-y-auto pr-3 text-slate-800">
          {/* Sub-tabs: CHANGE LAYOUT / CHANGE COLORS */}
          <div className="flex items-center gap-6 border-b border-slate-200">
            <button
              type="button"
              onClick={() => handleSubTabChange("layout")}
              className={`pb-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeSubTab === "layout"
                  ? "border-b-2 border-pink-700 text-pink-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              CHANGE LAYOUT
            </button>
            <button
              type="button"
              onClick={() => handleSubTabChange("colors")}
              className={`pb-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeSubTab === "colors"
                  ? "border-b-2 border-pink-700 text-pink-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              CHANGE COLORS
            </button>
          </div>

          {/* Theme Carousel (Under CHANGE LAYOUT) */}
          {activeSubTab === "layout" ? (
            <div className="relative flex items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                disabled={carouselIndex === 0}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <FiChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden">
                {PRINT_THEMES.slice(carouselIndex, carouselIndex + 4).map((theme) => {
                  const isSelected = selectedTheme === theme.name;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => handleThemeSelect(theme.name)}
                      className="flex-1 flex flex-col items-center cursor-pointer group"
                    >
                      {/* Theme Thumbnail Wireframe */}
                      <div
                        className={`w-full h-16 rounded border bg-white p-1 transition flex flex-col justify-between ${
                          isSelected
                            ? "border-slate-800 bg-slate-100 ring-2 ring-slate-400"
                            : "border-slate-300 hover:border-slate-400 group-hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className="h-2 w-full rounded-2xs"
                          style={{ backgroundColor: isSelected ? themeColor : "#cbd5e1" }}
                        />
                        <div className="space-y-0.5">
                          <div className="h-1 w-3/4 bg-slate-200" />
                          <div className="h-1 w-1/2 bg-slate-100" />
                        </div>
                        <div className="h-3 w-full border border-dashed border-slate-200" />
                        <div className="h-1.5 w-1/3 self-end bg-slate-200" />
                      </div>
                      <span className={`mt-1.5 text-[11px] text-center truncate w-full ${
                        isSelected ? "font-bold text-slate-900" : "text-slate-600"
                      }`}>
                        {theme.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCarouselIndex((prev) => Math.min(PRINT_THEMES.length - 4, prev + 1))}
                disabled={carouselIndex >= PRINT_THEMES.length - 4}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
              >
                <FiChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            /* Color Picker Palette */
            <div className="flex flex-wrap items-center gap-3 py-2">
              {THEME_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleColorSelect(c.hex)}
                  title={c.name}
                  className={`h-8 w-8 rounded-full border-2 transition transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                    themeColor === c.hex ? "border-slate-800 ring-2 ring-offset-1 ring-blue-500 scale-105" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {themeColor === c.hex && <FiCheck className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          )}

          {/* -------------------------------------------------------------
              SECTION 1: Print Company Info / Header
              ------------------------------------------------------------- */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-900">Print Company Info / Header</h4>

            <div className="space-y-3">
              {/* Make Regular Printer Default */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.makeRegularPrinterDefault ?? true}
                  onChange={(e) => update("makeRegularPrinterDefault", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Make Regular Printer Default</span>
                <InfoTooltip text="Always use regular printer settings as the default for all transactions" />
              </label>

              {/* Print repeat header in all pages */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printRepeatHeader ?? true}
                  onChange={(e) => update("printRepeatHeader", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print repeat header in all pages</span>
                <InfoTooltip text="Repeat company header and logo at the top of multi-page invoices" />
              </label>

              {/* Company Name Floating Input */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printCompanyName ?? true}
                  onChange={(e) => update("printCompanyName", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <div className="relative flex-1">
                  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-medium">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={settings.companyNamePrint ?? "sai kirana stores"}
                    onChange={(e) => update("companyNamePrint", e.target.value)}
                    disabled={settings.printCompanyName === false}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <InfoTooltip text="Company or legal business name printed on the invoice" />
              </div>

              {/* Company Logo (Change) */}
              <div className="flex items-center justify-between text-xs text-slate-700">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.printCompanyLogo ?? true}
                    onChange={(e) => update("printCompanyLogo", e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                  />
                  <span>Company Logo</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 font-semibold hover:underline cursor-pointer"
                  >
                    (Change)
                  </button>
                  <InfoTooltip text="Display your company logo on the top left or center of invoice" />
                </label>
              </div>

              {/* Address Floating Input */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printAddress ?? true}
                  onChange={(e) => update("printAddress", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <div className="relative flex-1">
                  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-medium">
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="Enter business address"
                    value={settings.addressPrint ?? ""}
                    onChange={(e) => update("addressPrint", e.target.value)}
                    disabled={settings.printAddress === false}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <InfoTooltip text="Store or warehouse address printed on invoice" />
              </div>

              {/* Email Floating Input */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printEmail ?? true}
                  onChange={(e) => update("printEmail", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <div className="relative flex-1">
                  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="Enter business email"
                    value={settings.emailPrint ?? ""}
                    onChange={(e) => update("emailPrint", e.target.value)}
                    disabled={settings.printEmail === false}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <InfoTooltip text="Email address shown in company header" />
              </div>

              {/* Phone Number Floating Input */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printPhoneNumber ?? true}
                  onChange={(e) => update("printPhoneNumber", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <div className="relative flex-1">
                  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-medium">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={settings.phoneNumberPrint ?? "8369501991"}
                    onChange={(e) => update("phoneNumberPrint", e.target.value)}
                    disabled={settings.printPhoneNumber === false}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <InfoTooltip text="Contact phone number printed on header" />
              </div>

              {/* GSTIN on Sale */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printGstinOnSale ?? true}
                  onChange={(e) => update("printGstinOnSale", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>GSTIN on Sale</span>
                <InfoTooltip text="Print firm GST identification number on tax invoice" />
              </label>

              {/* Paper Size dropdown */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Paper Size</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.paperSize || "A4"}
                    onChange={(e) => update("paperSize", e.target.value)}
                    className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="Letter">Letter</option>
                  </select>
                  <InfoTooltip text="Document sheet size for printer output" />
                </div>
              </div>

              {/* Orientation dropdown */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Orientation</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.orientation || "Portrait"}
                    onChange={(e) => update("orientation", e.target.value)}
                    className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="Portrait">Portrait</option>
                    <option value="Landscape">Landscape</option>
                  </select>
                  <InfoTooltip text="Print orientation (vertical portrait or horizontal landscape)" />
                </div>
              </div>

              {/* Company Name Text Size */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Company Name Text Size</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.companyNameTextSize || "Large"}
                    onChange={(e) => update("companyNameTextSize", e.target.value)}
                    className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                    <option value="Extra Large">Extra Large</option>
                  </select>
                  <InfoTooltip text="Font size of company name in invoice header" />
                </div>
              </div>

              {/* Invoice Text Size */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">Invoice Text Size</span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.invoiceTextSize || "Medium"}
                    onChange={(e) => update("invoiceTextSize", e.target.value)}
                    className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                  </select>
                  <InfoTooltip text="Body text size for party, items, and tax table" />
                </div>
              </div>

              {/* Print Original/Duplicate */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printOriginalDuplicate ?? false}
                  onChange={(e) => update("printOriginalDuplicate", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Original/Duplicate</span>
                <InfoTooltip text="Prints Original for Recipient and Duplicate for Supplier marks" />
              </label>

              {/* Extra space on Top of PDF */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700">Extra space on Top of PDF</span>
                  <InfoTooltip text="Add blank top margin for pre-printed letterheads (in millimeters)" />
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.extraSpaceTopPdf ?? 0}
                  onChange={(e) => update("extraSpaceTopPdf", Number(e.target.value) || 0)}
                  className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-center text-xs text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              {/* Change Transaction Names link */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTxnNamesModal(true)}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Change Transaction Names &gt;
                </button>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              SECTION 2: Item Table
              ------------------------------------------------------------- */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-900">Item Table</h4>

            <div className="space-y-3">
              {/* Expand table to print on whole page */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.expandTableWholePage ?? true}
                  onChange={(e) => update("expandTableWholePage", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Expand table to print on whole page</span>
                <InfoTooltip text="Fills empty table rows so the invoice reaches the bottom of the page" />
              </label>

              {/* Min No. of Rows in Item Table */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700">Min No. of Rows in Item Table</span>
                  <InfoTooltip text="Minimum blank rows rendered in invoice table" />
                </div>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.minRowsItemTable ?? 0}
                  onChange={(e) => update("minRowsItemTable", Number(e.target.value) || 0)}
                  className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-center text-xs text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              {/* Item Table Customization > */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowItemTableModal(true)}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Item Table Customization &gt;
                </button>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              SECTION 3: Totals & Taxes
              ------------------------------------------------------------- */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-900">Totals & Taxes</h4>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printTotalItemQty ?? true}
                  onChange={(e) => update("printTotalItemQty", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Total Item Quantity</span>
                <InfoTooltip text="Print sum of item quantities in table total row" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printAmountWithDecimal ?? true}
                  onChange={(e) => update("printAmountWithDecimal", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Amount with Decimal e.g. 0.00</span>
                <InfoTooltip text="Display two decimal places for all printed currency figures" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printReceivedAmount ?? true}
                  onChange={(e) => update("printReceivedAmount", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Received Amount</span>
                <InfoTooltip text="Display received / paid amount on invoice footer" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printBalanceAmount ?? true}
                  onChange={(e) => update("printBalanceAmount", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Balance Amount</span>
                <InfoTooltip text="Display remaining unpaid balance for this transaction" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printCurrentBalanceParty ?? false}
                  onChange={(e) => update("printCurrentBalanceParty", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Current Balance of Party</span>
                <InfoTooltip text="Show cumulative ledger balance owed by this customer" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printTaxDetails ?? true}
                  onChange={(e) => update("printTaxDetails", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Tax Details</span>
                <InfoTooltip text="Show detailed SGST / CGST / IGST breakdown table" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printYouSaved ?? true}
                  onChange={(e) => update("printYouSaved", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>You Saved</span>
                <InfoTooltip text="Display customer discount savings on the invoice" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printAmountWithGrouping ?? true}
                  onChange={(e) => update("printAmountWithGrouping", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Amount with Grouping</span>
                <InfoTooltip text="Use Indian thousand separators e.g. 1,00,000" />
              </label>

              {/* Amount in Words dropdown */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700">Amount in Words</span>
                  <InfoTooltip text="Number to words conversion format" />
                </div>
                <select
                  value={settings.amountInWordsFormat || "Indian"}
                  onChange={(e) => update("amountInWordsFormat", e.target.value)}
                  className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="Indian">Indian</option>
                  <option value="International">International</option>
                </select>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
              SECTION 4: Footer
              ------------------------------------------------------------- */}
          <div className="space-y-3 border-t border-slate-200 pt-4 pb-4">
            <h4 className="text-xs font-bold text-slate-900">Footer</h4>

            <div className="space-y-3">
              {/* Bank Details Checkbox (Can be toggled on/off freely) */}
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={settings.printBankDetails ?? true}
                  onChange={(e) => update("printBankDetails", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Bank Details &amp; QR Code</span>
                <InfoTooltip text="Print bank account, IFSC code, and UPI payment QR code on the invoice" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printDescription ?? true}
                  onChange={(e) => update("printDescription", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Description</span>
                <InfoTooltip text="Print invoice notes and customer instructions in footer" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printTermsAndConditions ?? true}
                  onChange={(e) => update("printTermsAndConditions", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Terms and Conditions</span>
                <InfoTooltip text="Print sales terms, return policies, and warranty terms" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printReceivedByDetails ?? true}
                  onChange={(e) => update("printReceivedByDetails", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Received by details</span>
                <InfoTooltip text="Print signature and name line for receiver on delivery" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printDeliveredByDetails ?? true}
                  onChange={(e) => update("printDeliveredByDetails", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Delivered by details</span>
                <InfoTooltip text="Print driver or delivery person sign-off field" />
              </label>

              {/* Print Signature Text Floating Input */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.printSignature ?? true}
                  onChange={(e) => update("printSignature", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <div className="relative flex-1">
                  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-slate-500 font-medium">
                    Print Signature Text
                  </label>
                  <input
                    type="text"
                    value={settings.printSignatureText ?? "Authorized Signature"}
                    onChange={(e) => update("printSignatureText", e.target.value)}
                    disabled={settings.printSignature === false}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => signatureInputRef.current?.click()}
                  className="text-xs font-semibold text-blue-600 hover:underline shrink-0 cursor-pointer"
                >
                  Change Signature
                </button>
                <InfoTooltip text="Custom label printed below company signature box" />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printPaymentMode ?? false}
                  onChange={(e) => update("printPaymentMode", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Payment Mode</span>
                <InfoTooltip text="Print payment method (Cash, Bank, UPI, Cheque)" />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.printAcknowledgement ?? false}
                  onChange={(e) => update("printAcknowledgement", e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                />
                <span>Print Acknowledgement</span>
                <InfoTooltip text="Include customer sign-off receipt tear slip at bottom" />
              </label>
            </div>
          </div>
        </div>

        {/* =========================================================
            RIGHT COLUMN: Dynamic Live Invoice Preview (Theme-Responsive)
            ========================================================= */}
        <div className="sticky top-2 max-h-[calc(100vh-210px)] overflow-y-auto rounded-lg border border-slate-300 bg-slate-100 p-2 sm:p-3 shadow-inner">
          {activePrinterTab === "regular" ? (
            <LiveThemeRenderer
              themeName={selectedTheme}
              themeColor={themeColor}
              settings={settings}
            />
          ) : (
            /* Thermal POS Receipt Preview */
            <div className="mx-auto max-w-[280px] rounded bg-white p-3 font-mono text-[10px] text-slate-900 shadow border border-slate-300 space-y-2">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <div className="font-bold text-xs uppercase">{settings.companyNamePrint || "sai kirana stores"}</div>
                <div className="text-[9px]">Ph: {settings.phoneNumberPrint || "8369501991"}</div>
                {settings.printGstinOnSale && <div className="text-[8px] text-slate-500">GSTIN: 29AABCU9603R1ZM</div>}
                <div className="mt-1 font-bold">TAX INVOICE</div>
              </div>
              <div className="text-[9px] border-b border-dashed border-slate-300 pb-1">
                <div className="flex justify-between"><span>Inv: 101</span><span>02/11/2026</span></div>
                <div>Customer: Classic enterprises</div>
              </div>
              <div className="border-b border-dashed border-slate-300 pb-1 text-[9px]">
                <div className="flex justify-between font-bold"><span>ITEM</span><span>QTY</span><span>AMT</span></div>
                <div className="flex justify-between"><span>ITEM 1</span><span>1</span><span>₹10.40</span></div>
                <div className="flex justify-between"><span>ITEM 2</span><span>1</span><span>₹35.40</span></div>
              </div>
              <div className="space-y-0.5 text-right font-bold border-b border-dashed border-slate-300 pb-1 text-[9px]">
                <div className="flex justify-between"><span>TOTAL:</span><span>₹42.32</span></div>
                {settings.printReceivedAmount && <div className="flex justify-between text-slate-600"><span>RECEIVED:</span><span>₹12.00</span></div>}
                {settings.printBalanceAmount && <div className="flex justify-between text-rose-600"><span>BALANCE:</span><span>₹30.32</span></div>}
              </div>
              <div className="text-center text-[8px] text-slate-500 pt-1">
                <div>Thank You! Visit Again</div>
                <div>*** {settings.companyNamePrint || "sai kirana stores"} ***</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          MODAL: Change Transaction Names
          ========================================================= */}
      {showTxnNamesModal && (() => {
        const names = settings.transactionNames || {
          saleInvoice: "Sale",
          estimateQuotation: "Estimate / Quotation",
          deliveryChallan: "Delivery Challan",
          saleOrder: "Sale Order",
          purchaseOrder: "Purchase Order",
          purchaseBill: "Purchase Bill",
        };
        const updateName = (key, val) => {
          update("transactionNames", { ...names, [key]: val });
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Change Transaction Names</h3>
                <button
                  type="button"
                  onClick={() => setShowTxnNamesModal(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs">
                {Object.entries({
                  saleInvoice: "Sale Invoice",
                  estimateQuotation: "Estimate / Quotation",
                  deliveryChallan: "Delivery Challan",
                  saleOrder: "Sale Order",
                  purchaseOrder: "Purchase Order",
                  purchaseBill: "Purchase Bill",
                }).map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
                    <input
                      type="text"
                      value={names[k] ?? ""}
                      onChange={(e) => updateName(k, e.target.value)}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTxnNamesModal(false)}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================
          MODAL: Item Table Customization
          ========================================================= */}
      {showItemTableModal && (() => {
        const cols = settings.itemTableColumns || {
          item: true,
          hsn: true,
          qty: true,
          freeQty: false,
          unit: true,
          price: true,
          discount: true,
          tax: true,
          amount: true,
        };
        const toggleCol = (col) => {
          update("itemTableColumns", { ...cols, [col]: !cols[col] });
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Item Table Customization</h3>
                <button
                  type="button"
                  onClick={() => setShowItemTableModal(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Select which columns appear on printed invoices:
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                {Object.entries({
                  item: "Item Name",
                  hsn: "HSN / SAC Code",
                  qty: "Quantity",
                  freeQty: "Free Quantity",
                  unit: "Unit",
                  price: "Price / Unit",
                  discount: "Discount",
                  tax: "Tax / GST Rate",
                  amount: "Amount",
                }).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cols[k] ?? true}
                      onChange={() => toggleCol(k)}
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowItemTableModal(false)}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// -------------------------------------------------------------
// DYNAMIC LIVE THEME RENDERER (Supports all 8 themes)
// -------------------------------------------------------------
function LiveThemeRenderer({ themeName, themeColor, settings }) {
  const companyName = settings.companyNamePrint || "sai kirana stores";
  const phone = settings.phoneNumberPrint || "8369501991";
  const address = settings.addressPrint || "Plot No. 1, Shop No. 8, Koramangala, Bangalore - 560034";
  const email = settings.emailPrint || "contact@saikirana.com";
  const gstin = "29AABCU9603R1ZM";
  const docTitle = settings.transactionNames?.saleInvoice || "Tax Invoice";

  const companyFontSize =
    settings.companyNameTextSize === "Extra Large"
      ? "text-lg font-extrabold"
      : settings.companyNameTextSize === "Small"
      ? "text-xs font-bold"
      : settings.companyNameTextSize === "Medium"
      ? "text-sm font-bold"
      : "text-base font-bold";

  // Renders Bank Details block if enabled
  const renderBankDetails = () => {
    if (settings.printBankDetails === false) return null;
    return (
      <div className="border border-slate-200 rounded p-1.5 space-y-1 bg-white">
        <div className="font-bold text-[9px]" style={{ color: themeColor }}>Bank Details</div>
        <div className="flex gap-1.5 items-center">
          <div className="h-9 w-9 border border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-0.5 shrink-0">
            <div className="h-6 w-6 bg-slate-800 rounded-2xs flex items-center justify-center text-white text-[5px] font-mono">QR</div>
            <span className="text-[5px] font-bold text-emerald-700">UPI PAY</span>
          </div>
          <div className="text-[7.5px] leading-tight text-slate-600">
            <div>Bank: HDFC Bank</div>
            <div>A/c: 50200012345678</div>
            <div>IFSC: HDFC0001234</div>
          </div>
        </div>
      </div>
    );
  };

  // Renders Signatory block
  const renderSignatory = () => {
    if (settings.printSignature === false) return null;
    return (
      <div className="border border-slate-200 rounded p-1.5 text-center flex flex-col justify-between bg-white">
        <div className="text-[7.5px] font-semibold text-slate-700">
          For : {companyName}
        </div>
        <div className="my-1 h-7 w-16 mx-auto rounded bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-[7.5px] text-slate-400 overflow-hidden">
          {settings.signatureImage ? (
            <img src={settings.signatureImage} alt="Signature" className="h-full w-full object-contain" />
          ) : (
            "Image"
          )}
        </div>
        <div className="text-[7.5px] font-bold text-slate-800">
          {settings.printSignatureText || "Authorized Signature"}
        </div>
      </div>
    );
  };

  // 1. BILL OF SUPPLY THEME (Non-GST Composition)
  if (themeName === "Bill of Supply") {
    return (
      <div className="mx-auto max-w-xl rounded border-2 border-slate-400 bg-white p-5 shadow text-[10px] text-slate-800 font-sans">
        <div className="text-center border-b-2 border-slate-800 pb-2">
          <div className="text-[13px] font-black uppercase tracking-wider text-slate-900">BILL OF SUPPLY</div>
          <div className="text-[9px] text-slate-500 font-medium">(Issued under Section 31 of CGST Act, 2017)</div>
          <div className={`mt-1 ${companyFontSize}`}>{companyName}</div>
          {settings.printPhoneNumber && <div className="text-[9px]">Ph: {phone}</div>}
        </div>
        <div className="grid grid-cols-2 gap-4 py-2 border-b border-slate-300 text-[9px]">
          <div>
            <div className="font-bold text-slate-900">Buyer:</div>
            <div>Classic Enterprises</div>
            <div>Koramangala, Bangalore</div>
          </div>
          <div className="text-right">
            <div>Bill No: <strong>BOS-101</strong></div>
            <div>Date: 02-07-2019</div>
          </div>
        </div>
        <table className="w-full text-left text-[9px] mt-2 border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white font-bold">
              <th className="p-1 text-center w-6">#</th>
              <th className="p-1">Description</th>
              <th className="p-1 text-center">Qty</th>
              <th className="p-1 text-right">Rate</th>
              <th className="p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr><td className="p-1 text-center">1</td><td className="p-1">Item 1</td><td className="p-1 text-center">2</td><td className="p-1 text-right">₹20.00</td><td className="p-1 text-right font-bold">₹40.00</td></tr>
            <tr><td className="p-1 text-center">2</td><td className="p-1">Item 2</td><td className="p-1 text-center">1</td><td className="p-1 text-right">₹35.00</td><td className="p-1 text-right font-bold">₹35.00</td></tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-bold bg-slate-100">
              <td colSpan="2" className="p-1">Total</td>
              <td className="p-1 text-center">3</td>
              <td></td>
              <td className="p-1 text-right text-xs">₹75.00</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-2">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 2. GST THEME 1 (Classic Bordered Grid Layout)
  if (themeName === "GST Theme 1") {
    return (
      <div className="mx-auto max-w-xl rounded border-2 border-slate-800 bg-white p-4 shadow text-[10px] text-slate-800 font-sans">
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-2">
          <div>
            <div className={`font-bold ${companyFontSize}`} style={{ color: themeColor }}>{companyName}</div>
            {settings.printAddress && <div className="text-[9px] text-slate-600">{address}</div>}
            {settings.printPhoneNumber && <div className="text-[9px] text-slate-600">Ph: {phone}</div>}
            {settings.printGstinOnSale && <div className="text-[9px] font-bold">GSTIN: {gstin}</div>}
          </div>
          <div className="text-right">
            <span className="inline-block px-2 py-1 text-white font-bold rounded text-xs" style={{ backgroundColor: themeColor }}>
              {docTitle}
            </span>
            <div className="mt-1 text-[9px] font-semibold">Invoice #: INV-101</div>
            <div className="text-[9px] text-slate-500">Date: 02-07-2019</div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-slate-800 py-1.5 text-[9px] bg-slate-50 px-2 my-1">
          <div><strong>Bill To:</strong> Classic Enterprises, Bangalore</div>
          <div className="text-right"><strong>Place of Supply:</strong> 29-Karnataka</div>
        </div>

        <table className="w-full text-left text-[9px] border border-slate-300 mt-2">
          <thead>
            <tr className="text-white font-bold" style={{ backgroundColor: themeColor }}>
              <th className="p-1 text-center border-r border-slate-400">#</th>
              <th className="p-1 border-r border-slate-400">Item</th>
              <th className="p-1 text-center border-r border-slate-400">Qty</th>
              <th className="p-1 text-right border-r border-slate-400">Rate</th>
              <th className="p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr><td className="p-1 text-center border-r border-slate-200">1</td><td className="p-1 border-r border-slate-200">Item 1</td><td className="p-1 text-center border-r border-slate-200">2</td><td className="p-1 text-right border-r border-slate-200">₹20.00</td><td className="p-1 text-right font-bold">₹40.00</td></tr>
            <tr><td className="p-1 text-center border-r border-slate-200">2</td><td className="p-1 border-r border-slate-200">Item 2</td><td className="p-1 text-center border-r border-slate-200">1</td><td className="p-1 text-right border-r border-slate-200">₹35.00</td><td className="p-1 text-right font-bold">₹35.00</td></tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-bold bg-slate-100">
              <td colSpan="2" className="p-1">Grand Total</td>
              <td className="p-1 text-center">3</td>
              <td></td>
              <td className="p-1 text-right text-xs" style={{ color: themeColor }}>₹75.00</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 3. GST THEME 2 (Modern Split Header Layout)
  if (themeName === "GST Theme 2") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-lg text-[10px] text-slate-800 font-sans">
        <div className="flex justify-between items-center rounded-lg p-3 text-white" style={{ backgroundColor: themeColor }}>
          <div>
            <h1 className="text-base font-extrabold tracking-wide uppercase">{companyName}</h1>
            <p className="text-[9px] opacity-90">{address}</p>
          </div>
          <div className="text-right">
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{docTitle}</span>
            <div className="text-xs font-bold mt-1">#INV-101</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 my-3">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="text-[9px] font-bold text-slate-500 uppercase">Invoiced To</span>
            <div className="font-bold text-slate-900 mt-0.5">Classic Enterprises</div>
            <div className="text-slate-600 text-[8.5px]">Koramangala, Bangalore</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-right">
            <span className="text-[9px] font-bold text-slate-500 uppercase">Invoice Details</span>
            <div className="text-slate-900 font-semibold mt-0.5">Date: 02-07-2019</div>
            <div className="text-slate-600 text-[8.5px]">Due: 17-07-2019</div>
          </div>
        </div>

        <table className="w-full text-left text-[9px] border-collapse rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="p-1.5">Item</th>
              <th className="p-1.5 text-center">Qty</th>
              <th className="p-1.5 text-right">Price</th>
              <th className="p-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="hover:bg-slate-50"><td className="p-1.5 font-semibold">Item 1</td><td className="p-1.5 text-center">2</td><td className="p-1.5 text-right">₹20.00</td><td className="p-1.5 text-right font-bold">₹40.00</td></tr>
            <tr className="hover:bg-slate-50"><td className="p-1.5 font-semibold">Item 2</td><td className="p-1.5 text-center">1</td><td className="p-1.5 text-right">₹35.00</td><td className="p-1.5 text-right font-bold">₹35.00</td></tr>
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <div className="w-48 bg-slate-50 rounded-lg p-2 text-right border border-slate-200 space-y-1">
            <div className="flex justify-between text-slate-600"><span>Sub Total:</span><span>₹75.00</span></div>
            <div className="flex justify-between font-bold text-xs" style={{ color: themeColor }}><span>Total:</span><span>₹75.00</span></div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 4. GST THEME 3 (Elegant Double-Framed Theme)
  if (themeName === "GST Theme 3") {
    return (
      <div className="mx-auto max-w-xl rounded border-4 border-double border-slate-700 bg-white p-5 shadow text-[10px] text-slate-800 font-serif">
        <div className="text-center pb-2 border-b-2 border-slate-300">
          <div className={`font-bold ${companyFontSize}`} style={{ color: themeColor }}>{companyName}</div>
          <div className="text-[9px] italic text-slate-600">{address}</div>
          <div className="text-xs font-sans font-bold uppercase tracking-widest mt-1 border-t border-b border-slate-300 py-0.5 inline-block">
            {docTitle}
          </div>
        </div>

        <div className="flex justify-between py-2 border-b border-slate-200 font-sans text-[9px]">
          <div><strong>Bill To:</strong> Classic Enterprises, Bangalore</div>
          <div className="text-right"><strong>Invoice No:</strong> #101 | <strong>Date:</strong> 02-07-2019</div>
        </div>

        <table className="w-full text-left text-[9px] mt-2 font-sans border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 font-bold">
              <th className="py-1">Description</th>
              <th className="py-1 text-center">Qty</th>
              <th className="py-1 text-right">Rate</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-1.5 font-medium">Item 1</td><td className="py-1.5 text-center">2</td><td className="py-1.5 text-right">₹20.00</td><td className="py-1.5 text-right font-bold">₹40.00</td></tr>
            <tr><td className="py-1.5 font-medium">Item 2</td><td className="py-1.5 text-center">1</td><td className="py-1.5 text-right">₹35.00</td><td className="py-1.5 text-right font-bold">₹35.00</td></tr>
          </tbody>
        </table>

        <div className="mt-4 border-t-2 border-double border-slate-800 pt-1 text-right font-sans font-bold text-xs" style={{ color: themeColor }}>
          Total Amount: ₹75.00
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 font-sans">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 5. GST THEME 4 (Corporate Minimalist Theme)
  if (themeName === "GST Theme 4") {
    return (
      <div className="mx-auto max-w-xl rounded bg-white p-5 shadow text-[10px] text-slate-800 font-sans border-t-4" style={{ borderColor: themeColor }}>
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Invoice</span>
            <div className={`font-black text-slate-900 ${companyFontSize}`}>{companyName}</div>
            <div className="text-[8.5px] text-slate-500 mt-0.5">{address}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black text-slate-900">#INV-101</div>
            <div className="text-slate-500 text-[9px]">Issued: 02-07-2019</div>
          </div>
        </div>

        <div className="py-3 text-[9px] border-b border-slate-100">
          <div className="text-slate-400 font-bold uppercase text-[8px]">Billed To</div>
          <div className="font-bold text-slate-800">Classic Enterprises</div>
        </div>

        <table className="w-full text-left text-[9px] mt-3 border-collapse">
          <thead>
            <tr className="text-slate-400 font-bold uppercase text-[8px] border-b border-slate-200">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-center">Qty</th>
              <th className="pb-1 text-right">Price</th>
              <th className="pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 font-medium">Item 1</td><td className="py-2 text-center">2</td><td className="py-2 text-right">₹20.00</td><td className="py-2 text-right font-bold">₹40.00</td></tr>
            <tr><td className="py-2 font-medium">Item 2</td><td className="py-2 text-center">1</td><td className="py-2 text-right">₹35.00</td><td className="py-2 text-right font-bold">₹35.00</td></tr>
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-48 space-y-1 text-right">
            <div className="flex justify-between text-slate-500"><span>Subtotal:</span><span>₹75.00</span></div>
            <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
              <span>Total:</span>
              <span style={{ color: themeColor }}>₹75.00</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 6. GST THEME 6 (Premium Bold Header Accent)
  if (themeName === "GST Theme 6") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden text-[10px] text-slate-800 font-sans">
        <div className="p-4 text-white" style={{ backgroundColor: themeColor }}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[9px] uppercase tracking-wider font-bold opacity-80">{docTitle}</span>
              <div className={`font-black ${companyFontSize}`}>{companyName}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black">#101</div>
              <div className="text-[9px] opacity-80">02-07-2019</div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[9px]">
            <strong>Customer:</strong> Classic Enterprises, Bangalore
          </div>

          <table className="w-full text-left text-[9px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-bold">
                <th className="p-1.5">Item</th>
                <th className="p-1.5 text-center">Qty</th>
                <th className="p-1.5 text-right">Price</th>
                <th className="p-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="p-1.5 font-semibold">Item 1</td><td className="p-1.5 text-center">2</td><td className="p-1.5 text-right">₹20.00</td><td className="p-1.5 text-right font-bold">₹40.00</td></tr>
              <tr><td className="p-1.5 font-semibold">Item 2</td><td className="p-1.5 text-center">1</td><td className="p-1.5 text-right">₹35.00</td><td className="p-1.5 text-right font-bold">₹35.00</td></tr>
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-slate-900 bg-slate-50">
                <td colSpan="2" className="p-1.5">Grand Total</td>
                <td></td>
                <td className="p-1.5 text-right text-xs" style={{ color: themeColor }}>₹75.00</td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            {renderBankDetails()}
            {renderSignatory()}
          </div>
        </div>
      </div>
    );
  }

  // 7. CLASSIC SIMPLE (Monochrome Ledger Format)
  if (themeName === "Classic Simple") {
    return (
      <div className="mx-auto max-w-xl rounded border border-black bg-white p-4 shadow-sm text-[9.5px] text-black font-mono">
        <div className="text-center border-b border-black pb-1">
          <div className="text-xs font-bold uppercase">{companyName}</div>
          <div className="text-[8.5px]">{address}</div>
          <div className="text-[8.5px] font-bold mt-0.5">INVOICE</div>
        </div>
        <div className="flex justify-between py-1 border-b border-black text-[8.5px]">
          <div>To: Classic Enterprises</div>
          <div>No: 101 | Date: 02-07-2019</div>
        </div>
        <table className="w-full text-left text-[9px] border-collapse mt-1">
          <thead>
            <tr className="border-b border-black">
              <th>Item</th>
              <th className="text-center">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Item 1</td><td className="text-center">2</td><td className="text-right">20.00</td><td className="text-right">40.00</td></tr>
            <tr><td>Item 2</td><td className="text-center">1</td><td className="text-right">35.00</td><td className="text-right">35.00</td></tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-black font-bold">
              <td colSpan="2">TOTAL</td>
              <td></td>
              <td className="text-right">75.00</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black pt-1">
          {renderBankDetails()}
          {renderSignatory()}
        </div>
      </div>
    );
  }

  // 8. DEFAULT: GST THEME 5 (Vyapar's Signature Magenta/Maroon Layout from User Screenshots)
  return (
    <div className="mx-auto max-w-xl rounded border border-slate-300 bg-white p-5 shadow-md text-[10.5px] leading-tight text-slate-800 font-sans">
      {/* Document Title: Sale */}
      <div className="text-center pb-2 relative">
        <h2 className="text-xs font-bold uppercase text-slate-900 tracking-wider">
          {docTitle}
        </h2>
        {settings.printOriginalDuplicate && (
          <span className="absolute right-0 top-0 text-[8px] font-bold text-slate-400 border border-slate-300 px-1 py-0.5 rounded">
            ORIGINAL FOR RECIPIENT
          </span>
        )}
      </div>

      {/* Company Header Row: Logo Left, Company Name Right */}
      <div className="flex items-start justify-between pb-3 pt-1">
        {/* Logo Box */}
        {settings.printCompanyLogo ? (
          <div className="h-12 w-20 rounded bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] text-slate-500 font-semibold overflow-hidden">
            {settings.companyLogo ? (
              <img src={settings.companyLogo} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              "image"
            )}
          </div>
        ) : <div />}

        {/* Company Name & Contact Details */}
        <div className="text-right">
          {settings.printCompanyName && (
            <div className={`font-bold text-slate-900 ${companyFontSize}`}>
              {companyName}
            </div>
          )}
          {settings.printPhoneNumber && (
            <div className="text-slate-600 text-[10px] mt-0.5">
              Ph. no : {phone}
            </div>
          )}
          {settings.printEmail && email && (
            <div className="text-slate-500 text-[9px]">{email}</div>
          )}
          {settings.printAddress && address && (
            <div className="text-slate-500 text-[9px]">{address}</div>
          )}
          {settings.printGstinOnSale && (
            <div className="text-slate-600 text-[9.5px] font-semibold mt-0.5">
              GSTIN : {gstin}
            </div>
          )}
        </div>
      </div>

      {/* Theme Colored Accent Band */}
      <div
        className="w-full h-1 mb-2 rounded-full"
        style={{ backgroundColor: themeColor }}
      />

      {/* 3-Column Party & Invoice Details Bar */}
      <div
        className="grid grid-cols-3 gap-2 border-t border-b py-2 text-[9.5px]"
        style={{ borderColor: themeColor }}
      >
        {/* Bill To */}
        <div>
          <div className="font-bold" style={{ color: themeColor }}>Bill To:</div>
          <div className="font-semibold text-slate-900 mt-0.5">Classic enterprises</div>
          <div className="text-slate-600 text-[9px]">Plot No. 1, Shop No. 8, Koramangala, Bangalore, 560034</div>
          <div className="text-slate-600 text-[9px] mt-0.5">Contact No: 8888888888</div>
        </div>

        {/* Shipping To */}
        <div>
          <div className="font-bold" style={{ color: themeColor }}>Shipping To</div>
          <div className="text-slate-600 text-[9px] mt-0.5">Mehta Textiles, Marathali Road, Bangalore, Karnataka, 560034</div>
        </div>

        {/* Invoice Details */}
        <div className="text-right space-y-0.5">
          <div className="font-bold" style={{ color: themeColor }}>Invoice Details</div>
          <div><span className="text-slate-500">Invoice No.:</span> <span className="font-bold">Inv. 101</span></div>
          <div><span className="text-slate-500">Date:</span> <span>02-07-2019</span></div>
          <div><span className="text-slate-500">Time:</span> <span>12:30 PM</span></div>
          <div><span className="text-slate-500">Due Date:</span> <span>17-07-2019</span></div>
        </div>
      </div>

      {/* Items Table */}
      <div className="mt-2 overflow-hidden border rounded border-slate-200">
        <table className="w-full text-left text-[9px] border-collapse">
          <thead>
            <tr className="text-white font-bold" style={{ backgroundColor: themeColor }}>
              <th className="p-1 text-center w-6">#</th>
              <th className="p-1">Item name</th>
              <th className="p-1 text-center">HSC/SAC</th>
              <th className="p-1 text-center">Quantity</th>
              <th className="p-1 text-right">Price/unit</th>
              <th className="p-1 text-right">Discount</th>
              <th className="p-1 text-right">GST</th>
              <th className="p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="p-1 text-center">1</td>
              <td className="p-1 font-semibold">ITEM 1</td>
              <td className="p-1 text-center text-slate-500">1234</td>
              <td className="p-1 text-center">1+1</td>
              <td className="p-1 text-right font-medium">₹ 10.00</td>
              <td className="p-1 text-right text-slate-600">₹ 0.10 (1%)</td>
              <td className="p-1 text-right text-slate-600">₹ 0.50 (5%)</td>
              <td className="p-1 text-right font-bold text-slate-900">₹ 10.40</td>
            </tr>
            <tr>
              <td className="p-1 text-center">2</td>
              <td className="p-1 font-semibold">ITEM 2</td>
              <td className="p-1 text-center text-slate-500">6325</td>
              <td className="p-1 text-center">1</td>
              <td className="p-1 text-right font-medium">₹ 30.00</td>
              <td className="p-1 text-right text-slate-600">₹ 0.00 (0%)</td>
              <td className="p-1 text-right text-slate-600">₹ 5.40 (18%)</td>
              <td className="p-1 text-right font-bold text-slate-900">₹ 35.40</td>
            </tr>
            {Array.from({ length: Math.max(0, (settings.minRowsItemTable || 0) - 2) }).map((_, i) => (
              <tr key={i} className="h-5"><td colSpan="8">&nbsp;</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 font-bold bg-slate-50">
              <td className="p-1" colSpan="3">Total</td>
              <td className="p-1 text-center">{settings.printTotalItemQty ? "2 + 1" : ""}</td>
              <td className="p-1"></td>
              <td className="p-1 text-right">₹ 0.10</td>
              <td className="p-1 text-right">₹ 5.90</td>
              <td className="p-1 text-right">₹ 45.80</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Tax Details Table & Totals Side-by-Side */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] border-t border-slate-200 pt-2">
        {/* Left: Tax Breakdown Table */}
        {settings.printTaxDetails ? (
          <div>
            <table className="w-full text-left border-collapse text-[8.5px]">
              <thead>
                <tr className="text-white font-bold" style={{ backgroundColor: themeColor }}>
                  <th className="p-1">Tax type</th>
                  <th className="p-1 text-right">Taxable amount</th>
                  <th className="p-1 text-center">Rate</th>
                  <th className="p-1 text-right">Tax amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td>SGST</td><td className="text-right">₹ 50.20</td><td className="text-center">2.5%</td><td className="text-right">₹ 1.26</td></tr>
                <tr><td>CGST</td><td className="text-right">₹ 50.20</td><td className="text-center">2.5%</td><td className="text-right">₹ 1.26</td></tr>
                <tr><td>SGST</td><td className="text-right">₹ 30.00</td><td className="text-center">9%</td><td className="text-right">₹ 2.70</td></tr>
                <tr><td>CGST</td><td className="text-right">₹ 30.00</td><td className="text-center">9%</td><td className="text-right">₹ 2.70</td></tr>
              </tbody>
            </table>
          </div>
        ) : <div />}

        {/* Right: Amounts / Calculation Summary */}
        <div className="space-y-1 text-right text-[9px]">
          <div className="flex justify-between font-semibold" style={{ color: themeColor }}>
            <span>Amounts</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Sub Total</span>
            <span>₹ 45.80</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Discount (12%)</span>
            <span>₹ 5.50</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Tax (5%)</span>
            <span>₹ 2.02</span>
          </div>
          <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-0.5">
            <span>Total</span>
            <span>₹ 42.32</span>
          </div>
          {settings.printReceivedAmount && (
            <div className="flex justify-between text-slate-700 font-medium">
              <span>Received</span>
              <span>₹ 12.00{settings.printAmountWithDecimal ? "0" : ""}</span>
            </div>
          )}
          {settings.printBalanceAmount && (
            <div className="flex justify-between font-bold text-rose-600">
              <span>Balance</span>
              <span>₹ 30.32</span>
            </div>
          )}
          {settings.printCurrentBalanceParty && (
            <div className="flex justify-between text-slate-600 text-[8.5px]">
              <span>Current Balance</span>
              <span>₹ 1,450.00</span>
            </div>
          )}
          {settings.printYouSaved && (
            <div className="flex justify-between text-emerald-700 font-semibold pt-0.5">
              <span>You Saved</span>
              <span>₹ 30.32</span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Amount in Words & Description Bar */}
      <div
        className="mt-2 rounded px-2 py-1 text-[8.5px] flex items-center justify-between text-white font-medium"
        style={{ backgroundColor: themeColor }}
      >
        <span>
          <strong>Invoice Amount In Words:</strong> Forty Two Rupees and Thirty Two Paisa only
        </span>
        {settings.printDescription && (
          <span>
            <strong>Description:</strong> Sale Description
          </span>
        )}
      </div>

      {/* Footer Boxes: Dynamically adjusts columns when bank details are removed */}
      <div className={`mt-2 grid gap-2 border-t border-slate-200 pt-2 text-[8.5px] ${
        settings.printBankDetails !== false ? "grid-cols-3" : "grid-cols-2"
      }`}>
        {/* Bank Details with QR Code (Fully removable when unchecked) */}
        {renderBankDetails()}

        {/* Terms and conditions */}
        {settings.printTermsAndConditions ? (
          <div className="border border-slate-200 rounded p-1.5 bg-white">
            <div className="font-bold" style={{ color: themeColor }}>Terms and conditions</div>
            <div className="mt-1 text-slate-600 leading-tight">
              {settings.termsAndConditions || "Thanks for doing business with us!"}
            </div>
          </div>
        ) : <div />}

        {/* Signatory Box */}
        {renderSignatory()}
      </div>

      {/* Extra Delivery / Received Lines if checked */}
      {(settings.printReceivedByDetails || settings.printDeliveredByDetails || settings.printPaymentMode) && (
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-1 text-[8px] text-slate-500">
          {settings.printReceivedByDetails && <span>Received By: ___________________</span>}
          {settings.printDeliveredByDetails && <span>Delivered By: ___________________</span>}
          {settings.printPaymentMode && <span>Payment Mode: Cash</span>}
        </div>
      )}
    </div>
  );
}
