import { useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiDownload,
  FiInfo,
  FiPrinter,
  FiRefreshCw,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getInventoryItems } from "../../services/itemsStorage";
import { getBarcodeBars } from "../../utils/barcode";

const formats = [
  { id: "CODE128", label: "Code 128", hint: "Letters, numbers, and common symbols" },
  { id: "EAN13", label: "EAN-13", hint: "12 or 13 digits" },
  { id: "UPCA", label: "UPC-A", hint: "11 or 12 digits" },
];
const maxLabels = 100;

function initialForm() {
  return { itemName: "", sku: "", barcodeValue: "", format: "CODE128", quantity: "1" };
}

function validateForm(form) {
  const value = form.barcodeValue.trim();
  const quantity = Number(form.quantity);
  if (!form.itemName.trim()) return "Enter a product or item name.";
  if (!value) return "Enter a barcode value.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxLabels) {
    return `Number of labels must be between 1 and ${maxLabels}.`;
  }
  if (form.format === "EAN13" && !/^\d{12,13}$/.test(value)) {
    return "EAN-13 requires 12 digits, or 13 digits including a valid check digit.";
  }
  if (form.format === "UPCA" && !/^\d{11,12}$/.test(value)) {
    return "UPC-A requires 11 digits, or 12 digits including a valid check digit.";
  }
  if (form.format === "CODE128" && !/^[\x20-\x7E]+$/.test(value)) {
    return "Code 128 supports printable letters, numbers, spaces, and symbols only.";
  }
  const barcode = getBarcodeBars(value, form.format);
  if (!barcode) return "This barcode value is not valid for the selected format.";
  if (form.format !== "CODE128" && value.length === barcode.text.length && value !== barcode.text) {
    return `${form.format === "EAN13" ? "EAN-13" : "UPC-A"} check digit is invalid. Check the final digit.`;
  }
  return "";
}

function BarcodeSvg({ barcode, className = "" }) {
  if (!barcode) return null;
  return (
    <svg
      role="img"
      aria-label={`${barcode.format} barcode for ${barcode.text}`}
      viewBox={`0 0 ${barcode.totalWidth} 58`}
      className={`h-20 w-full ${className}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="100%" height="100%" fill="white" />
      {barcode.bars.map((bar) => (
        <rect key={`${bar.x}-${bar.width}`} x={bar.x} y="4" width={bar.width} height="42" fill="#0f172a" />
      ))}
      <text x="50%" y="55" textAnchor="middle" fontSize="8" fill="#0f172a">{barcode.text}</text>
    </svg>
  );
}

function BarcodeLabel({ form, barcode }) {
  return (
    <div className="barcode-print-label w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-center">
      <p className="truncate text-sm font-semibold text-slate-800">{form.itemName || "Product name"}</p>
      {form.sku && <p className="mt-1 text-xs text-slate-500">SKU: {form.sku}</p>}
      <div className="mt-3"><BarcodeSvg barcode={barcode} /></div>
      <p className="mt-1 text-xs font-medium text-slate-700">{barcode?.text || "Barcode value"}</p>
    </div>
  );
}

function BarcodeGenerator() {

  const [inventory] = useState(() => {
    const items = getInventoryItems().filter(
      (item) => item.type !== "service"
    );

    const seen = new Set();

    return items.filter((item) => {
      const name = (item.itemName || "").trim().toLowerCase();
      const code = (item.itemCode || "").trim().toLowerCase();
      const key = !code && name === "new item"
        ? `id:${item.id}`
        : `${name}|${code}`;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  });

  const [form, setForm] = useState(initialForm);
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedFormat = formats.find((format) => format.id === form.format);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  };

  const chooseInventoryItem = (event) => {
    const item = inventory.find((candidate) => candidate.id === event.target.value);
    if (!item) return;
    updateForm("itemName", item.itemName);
    setForm((current) => ({
      ...current,
      itemName: item.itemName,
      sku: item.itemCode || "",
      barcodeValue: item.itemCode || "",
    }));
  };

  const generate = () => {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      setGenerated(null);
      return;
    }
    setGenerated({ ...form, barcode: getBarcodeBars(form.barcodeValue.trim(), form.format) });
    setNotice("Barcode generated in this browser. It was not saved to inventory.");
  };

  const download = () => {
    if (!generated?.barcode) {
      setError("Generate a valid barcode before downloading.");
      return;
    }
    try {
      const svg = document.querySelector("#generated-barcode svg")?.outerHTML;
      if (!svg) throw new Error("Barcode preview is unavailable.");
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${generated.itemName.trim().replace(/[^a-z0-9]+/gi, "-") || "barcode"}-${generated.barcode.text}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download the barcode.");
    }
  };

  const print = () => {
    if (!generated?.barcode) {
      setError("Generate a valid barcode before printing.");
      return;
    }
    const printWindow = window.open("", "_blank", "width=800,height=700");
    if (!printWindow) {
      setError("The print window was blocked. Allow pop-ups and try again.");
      return;
    }
    const label = document.querySelector("#generated-barcode .barcode-print-label")?.outerHTML;
    const copies = Array.from({ length: Number(generated.quantity) }, () => label).join("");
    printWindow.document.write(`<html><head><title>Barcode labels</title><style>
      @page { margin: 10mm; } body { margin: 0; font-family: Arial, sans-serif; }
      .sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8mm; }
      .barcode-print-label { box-sizing: border-box; width: 80mm; padding: 4mm; text-align: center; border: 1px solid #cbd5e1; }
      .barcode-print-label p { margin: 1mm 0; font-size: 10pt; } .barcode-print-label svg { width: 100%; height: 22mm; }
    </style></head><body><div class="sheet">${copies}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const barcode = generated?.barcode;
  const formPreview = useMemo(() => ({
    ...form,
    barcode: barcode || getBarcodeBars(form.barcodeValue.trim(), form.format),
  }), [barcode, form]);

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Barcode Generator</h1>
          <p className="mt-1 text-sm text-slate-500">Create scannable product labels in your browser without changing inventory data.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="p-5">
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Code 128 is suitable for internal product codes. EAN-13 and UPC-A require numeric retail identifiers with valid check digits.</p>
            </div>

            {inventory.length > 0 && (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="inventory-item">Use an existing item</label>
                <select id="inventory-item" defaultValue="" onChange={chooseInventoryItem} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="">Select an inventory item</option>
                  {inventory.map((item) => <option key={item.id} value={item.id}>{item.itemName}{item.itemCode ? ` (${item.itemCode})` : ""}</option>)}
                </select>
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Product or item name
                <input value={form.itemName} onChange={(event) => updateForm("itemName", event.target.value)} placeholder="e.g. Cotton shirt" className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                SKU / internal code
                <input value={form.sku} onChange={(event) => updateForm("sku", event.target.value)} placeholder="Optional" className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Barcode value
                <input value={form.barcodeValue} onChange={(event) => updateForm("barcodeValue", event.target.value)} placeholder={form.format === "CODE128" ? "e.g. PROD-1001" : "Enter numeric value"} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Barcode format
                <select value={form.format} onChange={(event) => updateForm("format", event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">{selectedFormat.hint}</span>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Number of labels
                <input type="number" min="1" max={maxLabels} value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Maximum {maxLabels} labels per print.</span>
              </label>
            </div>

            {error && <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</div>}
            {notice && <div role="status" className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><FiRefreshCw className="mt-0.5 shrink-0" />{notice}</div>}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={generate} className="bg-[#1A1F71] text-white hover:bg-[#14185D]">Generate Barcode</Button>
              <Button onClick={download} className="border border-slate-300 text-slate-700 hover:bg-slate-50"><FiDownload /> Download SVG</Button>
              <Button onClick={print} className="border border-slate-300 text-slate-700 hover:bg-slate-50"><FiPrinter /> Print Labels</Button>
            </div>
          </Card>

          <Card id="generated-barcode" className="flex min-h-80 flex-col items-center justify-center p-5">
            <h2 className="mb-4 text-base font-bold text-slate-800">Barcode Preview</h2>
            {formPreview.barcode ? (
              <BarcodeLabel form={formPreview} barcode={formPreview.barcode} />
            ) : (
              <div className="grid min-h-48 w-full place-items-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Enter valid details and click Generate Barcode.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default BarcodeGenerator;
