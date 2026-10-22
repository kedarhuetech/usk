import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiChevronDown,
  FiInfo,
  FiMaximize2,
  FiSettings,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { getCode128Bars } from "../../utils/barcode";

const fieldOptions = [
  "",
  "Company Name",
  "Item Name",
  "Item Code",
  "Sale Price",
  "Purchase Price",
  "Discount",
  "Batch No.",
  "Manufacturer Name",
  "Mfg. Date",
  "Exp. Date",
];

const configFields = [
  { key: "header", label: "Header", placeholder: "Enter Header" },
  { key: "line1", label: "Line 1", placeholder: "Enter Line 1" },
  { key: "line2", label: "Line 2", placeholder: "Enter Line 2" },
  { key: "line3", label: "Line 3", placeholder: "Enter Line 3" },
  { key: "line4", label: "Line 4", placeholder: "Enter Line 4" },
];

const defaultConfig = {
  header: "",
  line1: "",
  line2: "",
  line3: "",
  line4: "",
};

function readStoredPayload() {
  try {
    return JSON.parse(sessionStorage.getItem("ledgerly:barcodePurchaseItems") || "{}");
  } catch {
    return {};
  }
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeItems(payload) {
  const source = payload?.items || payload?.invoice?.rows || [];
  return source
    .filter((item) => item.itemName || item.item)
    .map((item, index) => ({
      id: item.id || `barcode-item-${index + 1}`,
      itemName: item.itemName || item.item || "",
      labels: String(Math.max(Math.round(toNumber(item.labels ?? item.qty ?? item.calculated?.qty) || 1), 1)),
      itemCode: item.itemCode || "",
      companyName: item.companyName || payload?.invoice?.business?.name || "My Company",
      salePrice: item.salePrice || "",
      purchasePrice: item.purchasePrice || item.price || "",
      discount: item.discount || (item.calculated?.discount ? String(item.calculated.discount) : ""),
      batchNo: item.batchNo || "",
      manufacturerName: item.manufacturerName || "",
      mfgDate: item.mfgDate || "",
      expDate: item.expDate || "",
    }));
}

function valueForField(item, field) {
  const values = {
    "Company Name": item.companyName,
    "Item Name": item.itemName,
    "Item Code": item.itemCode,
    "Sale Price": item.salePrice,
    "Purchase Price": item.purchasePrice,
    Discount: item.discount,
    "Batch No.": item.batchNo,
    "Manufacturer Name": item.manufacturerName,
    "Mfg. Date": item.mfgDate,
    "Exp. Date": item.expDate,
  };
  return values[field] || "";
}

function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ref, onClose]);
}

function SelectField({ label, placeholder, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <label className="mb-2 block text-xs font-medium text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-slate-700 outline-none transition hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || placeholder}</span>
        <FiChevronDown className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-[68px] z-30 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
          {fieldOptions.map((option) => (
            <button
              key={option || "empty"}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 ${value === option ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
            >
              {option || "None"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Barcode({ value }) {
  const encoded = useMemo(() => getCode128Bars(value), [value]);

  if (!encoded) {
    return (
      <div className="mx-auto grid h-10 w-36 place-items-center rounded border border-dashed border-slate-300 text-[11px] font-medium text-slate-400">
        Assign item code
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${encoded.totalWidth} 46`} className="mx-auto h-10 w-40 text-black" aria-label={`CODE128 barcode for ${encoded.text}`}>
      {encoded.bars.map((bar) => (
        <rect key={`${bar.x}-${bar.width}`} x={bar.x} y="4" width={bar.width} height="34" fill="currentColor" />
      ))}
    </svg>
  );
}

function LabelPreview({ item, config, compact = false }) {
  const lines = ["line1", "line2", "line3", "line4"].map((key) => valueForField(item, config[key])).filter(Boolean);

  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-white text-center ${compact ? "w-44 p-3" : "w-56 p-4"}`}>
      {valueForField(item, config.header) && <p className="mb-1 text-sm font-medium italic text-slate-700">{valueForField(item, config.header)}</p>}
      <Barcode value={item.itemCode} />
      {item.itemCode && <p className="text-xs font-semibold text-slate-900">{item.itemCode}</p>}
      <div className="mt-2 space-y-1 text-sm italic text-slate-600">
        {lines.length ? lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p>{item.itemName || "Line 1"}</p>}
      </div>
    </div>
  );
}

function ItemTable({ items, setItems, config, className = "" }) {
  const assignCode = (id) => {
    setItems((current) =>
      current.map((item, index) =>
        item.id === id ? { ...item, itemCode: `LDG${Date.now().toString().slice(-6)}${index + 1}` } : item
      )
    );
  };

  const updateItem = (id, field, value) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-[1100px] w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {["Item Name", "No of Labels", "Item Code", "Header", "Line 1", "Line 2", "Line 3", "Line 4", ""].map((head) => (
              <th key={head || "delete"} className="border-b border-r border-slate-200 px-3 py-3 text-left last:border-r-0">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="border-r border-slate-100 px-3 py-4 font-semibold text-slate-900">{item.itemName}</td>
              <td className="border-r border-slate-100 px-3 py-3">
                <input
                  value={item.labels}
                  onChange={(event) => updateItem(item.id, "labels", event.target.value.replace(/[^\d]/g, ""))}
                  className="h-8 w-20 rounded-md border border-transparent bg-white px-2 text-right outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </td>
              <td className="border-r border-slate-100 px-3 py-3">
                <div className="flex items-center gap-2">
                  <input
                    value={item.itemCode}
                    onChange={(event) => updateItem(item.id, "itemCode", event.target.value)}
                    placeholder="Enter Item Code"
                    className="h-8 min-w-32 rounded-md border border-transparent bg-white px-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {!item.itemCode && (
                    <button type="button" onClick={() => assignCode(item.id)} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 hover:bg-blue-100">
                      Assign Code
                    </button>
                  )}
                </div>
              </td>
              {["header", "line1", "line2", "line3", "line4"].map((key) => (
                <td key={key} className="border-r border-slate-100 px-3 py-4 text-slate-600">{valueForField(item, config[key])}</td>
              ))}
              <td className="px-3 py-4 text-right">
                <button type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                  <FiTrash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="px-4 py-10 text-center text-sm text-slate-400">No purchase items available for barcode generation.</p>}
    </div>
  );
}

function Modal({ title, children, footer, onClose, wide = false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <Card className={`flex max-h-[90vh] w-full flex-col overflow-hidden shadow-2xl ${wide ? "max-w-7xl" : "max-w-5xl"}`} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><FiX className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">{footer}</footer>}
      </Card>
    </div>
  );
}

function Toast({ onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed right-5 top-24 z-[60] w-[min(460px,calc(100vw-2rem))] rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-xl">
      <button type="button" onClick={onClose} className="absolute right-3 top-3 text-rose-400 hover:text-rose-600"><FiX /></button>
      <div className="flex gap-3">
        <FiAlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
        <div>
          <p className="font-bold text-slate-800">Item Code Missing</p>
          <p className="mt-1 text-sm text-slate-600">Some items don't have an item code assigned. Assign a code before generating barcodes.</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-1 w-2/5 rounded-b-lg bg-rose-500" />
    </div>
  );
}

function BarcodeGenerator() {
  const location = useLocation();
  const navigate = useNavigate();
  const payload = useMemo(() => location.state || readStoredPayload(), [location.state]);
  const [items, setItems] = useState(() => normalizeItems(payload));
  const [config, setConfig] = useState(defaultConfig);
  const [appliedConfig, setAppliedConfig] = useState(defaultConfig);
  const [dirty, setDirty] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const selectedItem = items[0] || normalizeItems({ items: [{ itemName: "Item Name", labels: 1 }] })[0];
  const labels = useMemo(
    () => items.flatMap((item) => Array.from({ length: Math.max(toNumber(item.labels), 1) }, (_, index) => ({ ...item, labelId: `${item.id}-${index}` }))),
    [items]
  );

  const setConfigField = (key, value) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateBarcode = () => {
    setAppliedConfig(config);
    setDirty(false);
  };

  const validateCodes = () => {
    if (items.some((item) => !item.itemCode.trim())) {
      setToastOpen(true);
      return false;
    }
    return true;
  };

  const openGenerate = () => {
    if (validateCodes()) setGenerateOpen(true);
  };

  const saveAndClose = () => navigate(payload?.from || "/purchase-expense/purchase-bills/new");

  return (
    <div className="min-h-full bg-slate-100">
      {toastOpen && <Toast onClose={() => setToastOpen(false)} />}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          Barcode Generator <FiInfo className="h-4 w-4 text-slate-500" />
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span>Printer: Regular Printer</span>
          <span>Size: 65 Labels (38x21mm)</span>
          <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><FiSettings /></button>
        </div>
      </header>

      <main className="space-y-1.5 p-1.5">
        <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_490px]">
          <Card className="p-4">
            <h2 className="mb-5 text-sm font-bold text-slate-800">Set Up Your Barcode Label</h2>
            <div className="mb-5 flex gap-3 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Customize label settings below for all purchase bill items. To generate barcodes for additional items, go to Utilities - Barcode Generator.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {configFields.map((field) => (
                <SelectField key={field.key} {...field} value={config[field.key]} onChange={(value) => setConfigField(field.key, value)} />
              ))}
              <div className="flex items-end">
                <Button
                  onClick={updateBarcode}
                  disabled={!dirty}
                  className={`h-10 rounded-full px-7 text-sm ${dirty ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-200 text-white"}`}
                >
                  Update barcode
                </Button>
              </div>
            </div>
          </Card>

          <Card className="flex min-h-64 items-center justify-center p-4">
            <div>
              <h2 className="mb-4 flex items-center justify-center gap-2 text-center text-base font-bold text-slate-800">Preview <FiInfo className="h-4 w-4 text-slate-500" /></h2>
              <LabelPreview item={selectedItem} config={appliedConfig} />
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-bold text-slate-800">Item List</h2>
            <button type="button" onClick={() => setListOpen(true)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
              <FiMaximize2 className="h-5 w-5" />
            </button>
          </header>
          <ItemTable items={items} setItems={setItems} config={appliedConfig} />
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700"><FiInfo className="mr-2 inline h-4 w-4" />You will need 1 pages (A4 size) for printing.</p>
            <div className="flex gap-3">
              <Button onClick={() => setPreviewOpen(true)} className="rounded-full border border-rose-500 bg-white px-6 py-2 text-rose-600 hover:bg-rose-50">Preview</Button>
              <Button onClick={openGenerate} className="rounded-full bg-rose-600 px-7 py-2 text-white hover:bg-rose-700">Generate</Button>
            </div>
          </footer>
        </Card>
      </main>

      {listOpen && (
        <Modal title="Item List" wide onClose={() => setListOpen(false)} footer={<><Button onClick={() => setListOpen(false)} className="rounded-full border border-rose-500 bg-white px-6 py-2 text-rose-600 hover:bg-rose-50">Preview</Button><Button onClick={openGenerate} className="rounded-full bg-rose-600 px-7 py-2 text-white hover:bg-rose-700">Generate</Button></>}>
          <ItemTable items={items} setItems={setItems} config={appliedConfig} />
        </Modal>
      )}

      {previewOpen && (
        <Modal title="Preview" onClose={() => setPreviewOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labels.map((item) => <LabelPreview key={item.labelId} item={item} config={appliedConfig} compact />)}
          </div>
        </Modal>
      )}

      {generateOpen && (
        <Modal
          title="Generate"
          onClose={() => setGenerateOpen(false)}
          footer={<><Button onClick={saveAndClose} className="rounded-full border border-rose-500 bg-white px-6 py-2 text-rose-600 hover:bg-rose-50">Save & Close</Button><Button onClick={() => window.print()} className="rounded-full bg-rose-600 px-7 py-2 text-white hover:bg-rose-700">Print</Button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labels.map((item) => <LabelPreview key={item.labelId} item={item} config={appliedConfig} compact />)}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default BarcodeGenerator;
