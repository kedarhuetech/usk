import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { FiAlertCircle, FiCamera, FiCheckCircle, FiImage, FiSearch, FiUpload, FiX } from "react-icons/fi";
import * as XLSX from "xlsx";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { businessDataApi } from "../../services/apiClient";
import { saveBusinessItem } from "../../services/businessRecords";

const requiredColumns = ["itemname"];
const maxRows = 500;
const OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v2/product";
const UPCITEMDB_URL = "https://api.upcitemdb.com/prod/trial/lookup";
const maxBarcodeImageBytes = 10 * 1024 * 1024;
const cameraFormats = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
];

function createBarcodeReader() {
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, cameraFormats],
  ]);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 100,
    delayBetweenScanSuccess: 250,
    tryPlayVideoTimeout: 2500,
  });
}

function rowsToItems(rows) {
  const cleanedRows = rows.map((row) => row.map((value) => String(value ?? "").trim()));
  const rowsWithValues = cleanedRows.filter((row) => row.some(Boolean));
  if (rowsWithValues.length < 2) throw new Error("The file must include a header row and at least one item.");
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headers = rowsWithValues[0].map(normalize);
  const column = (...names) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    name: column("item", "itemname", "name", "product", "productname"),
    code: column("itemcode", "code", "sku", "productcode"),
    type: column("type", "itemtype"),
    category: column("category", "itemcategory"),
    unit: column("unit", "baseunit", "measurementunit"),
    salePrice: column("saleprice", "sellingprice", "price", "rate"),
    purchasePrice: column("purchaseprice", "costprice", "purchasecost"),
    quantity: column("quantity", "openingquantity", "openingstock", "stock"),
  };
  if (requiredColumns.some((name) => !headers.includes(name)) || indexes.name < 0) {
    throw new Error("The file must include an Item Name column.");
  }
  return rowsWithValues.slice(1).map((values, rowIndex) => {
    const get = (key) => indexes[key] < 0 ? "" : String(values[indexes[key]] || "").trim();
    const type = get("type").toLowerCase() === "service" ? "service" : "product";
    return {
      rowNumber: rowIndex + 2,
      itemName: get("name"),
      itemCode: get("code"),
      type,
      category: get("category"),
      unit: get("unit"),
      salePrice: get("salePrice"),
      purchasePrice: get("purchasePrice"),
      openingQuantity: get("quantity"),
    };
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rowsToItems(rows);
}

async function parseExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The Excel workbook does not contain a worksheet.");
  return rowsToItems(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", raw: false }));
}

function validateRows(rows) {
  const seen = new Set();
  return rows.map((row) => {
    const errors = [];
    if (!row.itemName) errors.push("Item Name is required");
    if (row.salePrice && (!Number.isFinite(Number(row.salePrice)) || Number(row.salePrice) < 0)) errors.push("Sale Price must be a non-negative number");
    if (row.purchasePrice && (!Number.isFinite(Number(row.purchasePrice)) || Number(row.purchasePrice) < 0)) errors.push("Purchase Price must be a non-negative number");
    if (row.openingQuantity && (!Number.isFinite(Number(row.openingQuantity)) || Number(row.openingQuantity) < 0)) errors.push("Quantity must be a non-negative number");
    const key = row.itemCode
      ? `code:${row.itemCode.toLowerCase()}`
      : `name:${row.itemName.toLowerCase()}|${row.unit.toLowerCase()}`;
    if (seen.has(key)) errors.push("Duplicate item in this file");
    seen.add(key);
    return { ...row, errors };
  });
}

function barcodeReviewFromProduct(product, barcode, source) {
  const category = product.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "").replace(/-/g, " ")
    || product.category
    || "";
  const unit = product.quantity?.match(/[a-zA-Z]+/)?.[0] || "";
  const itemName = product.product_name?.trim() || product.title?.trim() || "";
  return {
    itemName,
    itemCode: barcode,
    category,
    unit,
    salePrice: "",
    purchasePrice: "",
    taxRate: "",
    openingQuantity: "",
    lookupNote: itemName
      ? `Details found via ${source}. Review the imported product details and complete prices before saving.`
      : "This barcode was found, but the product name is missing. Enter it before saving.",
  };
}

async function lookupWithProviders(barcode) {
  const providers = [
    {
      name: "Open Food Facts",
      request: () => fetch(`${OPEN_FOOD_FACTS_URL}/${encodeURIComponent(barcode)}.json`),
      read: (result) => {
        const product = result?.status === 1 ? result.product : null;
        return product && (product.product_name || product.product_name_en || product.brands || product.categories_tags)
          ? product
          : null;
      },
    },
    {
      name: "UPCitemdb",
      request: () => fetch(UPCITEMDB_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ upc: barcode }),
      }),
      read: (result) => {
        const product = result?.items?.[0];
        return product && (product.title || product.name || product.brand || product.category)
          ? product
          : null;
      },
    },
  ];
  let lastError = null;
  let receivedValidResponse = false;
  for (const provider of providers) {
    try {
      const response = await provider.request();
      if (!response.ok) {
        if (response.status !== 404) lastError = new Error(`${provider.name} lookup failed (${response.status}).`);
        continue;
      }
      const result = await response.json();
      receivedValidResponse = true;
      const product = provider.read(result);
      if (product) return { product, source: provider.name };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && !receivedValidResponse) throw lastError;
  return null;
}

function emptyBarcodeReview(barcode) {
  return {
    itemName: "",
    itemCode: barcode,
    category: "",
    unit: "",
    purchasePrice: "",
    salePrice: "",
    taxRate: "",
    openingQuantity: "",
    lookupNote: "No provider returned product details. Enter and review the item details before saving.",
  };
}

function ImportItems() {
  const fileInput = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileError, setFileError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [lookupState, setLookupState] = useState({ status: "idle", message: "" });
  const [reviewItem, setReviewItem] = useState(null);
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState({ status: "idle", message: "" });
  const [imagePreview, setImagePreview] = useState("");
  const cameraVideo = useRef(null);
  const cameraControls = useRef(null);
  const nativeStream = useRef(null);
  const nativeScanActive = useRef(false);
  const imageInput = useRef(null);
  const validRows = useMemo(() => rows.filter((row) => !row.errors.length), [rows]);
  const invalidRows = rows.length - validRows.length;

  const stopCamera = () => {
    nativeScanActive.current = false;
    cameraControls.current?.stop();
    cameraControls.current = null;
    nativeStream.current?.getTracks().forEach((track) => track.stop());
    nativeStream.current = null;
    const stream = cameraVideo.current?.srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (cameraVideo.current) cameraVideo.current.srcObject = null;
    setCameraOpen(false);
  };

  useEffect(() => () => {
    nativeScanActive.current = false;
    cameraControls.current?.stop();
    nativeStream.current?.getTracks().forEach((track) => track.stop());
    const stream = cameraVideo.current?.srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    if (!cameraOpen || !cameraVideo.current) return undefined;
    let active = true;
    setCameraState({ status: "loading", message: "Requesting camera permission..." });
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        focusMode: { ideal: "continuous" },
      },
      audio: false,
    };
    const NativeDetector = globalThis.BarcodeDetector;
    const nativeFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
    const useNativeDetector = NativeDetector && typeof NativeDetector.getSupportedFormats === "function";
    const requestCamera = () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new Error("Camera access is not supported by this browser."));
      }
      return Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("Camera permission timed out. Check the browser permission or connect a camera.")), 10000)),
      ]);
    };

    if (useNativeDetector) {
      NativeDetector.getSupportedFormats().then(async (supported) => {
        if (!active) return;
        const formats = nativeFormats.filter((format) => supported.includes(format));
        if (!formats.length) throw new Error("Native barcode formats are unavailable.");
        const detector = new NativeDetector({ formats });
        const stream = await requestCamera();
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        nativeStream.current = stream;
        cameraVideo.current.srcObject = stream;
        await cameraVideo.current.play();
        nativeScanActive.current = true;
        setCameraState({ status: "loading", message: "Scanning..." });
        const scanFrame = async () => {
          if (!active || !nativeScanActive.current) return;
          try {
            const results = await detector.detect(cameraVideo.current);
            if (results.length) {
              const detected = results[0].rawValue;
              setBarcode(detected);
              setCameraState({ status: "success", message: `Barcode detected: ${detected}` });
              stopCamera();
              return;
            }
          } catch {
            setCameraState({ status: "error", message: "The camera frame could not be decoded. Adjust the distance and lighting." });
          }
          if (active && nativeScanActive.current) {
            if (cameraVideo.current.requestVideoFrameCallback) cameraVideo.current.requestVideoFrameCallback(scanFrame);
            else window.setTimeout(scanFrame, 50);
          }
        };
        scanFrame();
      }).catch((error) => {
        if (!active) return;
        if (error.name === "NotAllowedError" || error.message?.includes("Camera permission timed out") || error.message?.includes("not supported")) {
          setCameraState({ status: "error", message: error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access and try again." : error.message });
          return;
        }
        startZxingScan();
      });
    } else {
      startZxingScan();
    }

    async function startZxingScan() {
      if (!active) return;
      const reader = createBarcodeReader();
      let stream;
      try {
        stream = await requestCamera();
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        nativeStream.current = stream;
        cameraVideo.current.srcObject = stream;
        await cameraVideo.current.play();
        setCameraState({ status: "loading", message: "Scanning..." });
      } catch (error) {
        if (!active) return;
        setCameraState({
          status: "error",
          message: error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access and try again."
            : error.message || "Camera is unavailable. Check that a camera is connected and permission is allowed.",
        });
        return;
      }
      reader.decodeFromStream(stream, cameraVideo.current, (result, error) => {
        if (!active) return;
        if (result) {
          setBarcode(result.getText());
          setCameraState({ status: "success", message: `Barcode detected: ${result.getText()}` });
          stopCamera();
        } else if (error?.name === "NotAllowedError") {
          setCameraState({ status: "error", message: "Camera permission was denied. Allow camera access and try again." });
        }
      }).then((controls) => {
        if (active) cameraControls.current = controls;
        else controls.stop();
      }).catch((error) => {
        setCameraState({ status: "error", message: error.name === "NotAllowedError" ? "Camera permission was denied." : "Camera is unavailable in this browser or device." });
      });
    }

    return () => {
      active = false;
      nativeScanActive.current = false;
      cameraControls.current?.stop();
      cameraControls.current = null;
      nativeStream.current?.getTracks().forEach((track) => track.stop());
      nativeStream.current = null;
    };
  }, [cameraOpen]);

  const startCamera = () => {
    setCameraState({ status: "idle", message: "" });
    setCameraOpen(true);
  };

  const decodeImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setLookupState({ status: "image-error", message: "Choose a PNG or JPG barcode image." });
      return;
    }
    if (file.size > maxBarcodeImageBytes) {
      setLookupState({ status: "image-error", message: "Barcode images must be 10 MB or smaller." });
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setLookupState({ status: "loading", message: "Reading barcode from image..." });
    try {
      const image = new Image();
      image.src = previewUrl;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The selected image could not be opened."));
      });
      const result = await createBarcodeReader().decodeFromImageElement(image);
      setBarcode(result.getText());
      setLookupState({ status: "success", message: `Barcode detected: ${result.getText()}. Click Look Up to retrieve product details.` });
    } catch {
      setLookupState({ status: "image-error", message: "No supported barcode was detected. You can enter the barcode and details manually or import the product using an Excel/CSV file." });
    }
  };

  const lookupBarcode = async () => {
    const value = barcode.trim();
    if (!/^\d{8,14}$/.test(value)) {
      setLookupState({ status: "error", message: "Enter a valid numeric barcode between 8 and 14 digits." });
      setReviewItem(null);
      return;
    }
    setLookupState({ status: "loading", message: "Looking up product details..." });
    setReviewItem(null);
    try {
      const found = await lookupWithProviders(value);
      if (!found) {
        setReviewItem(emptyBarcodeReview(value));
        setLookupState({
          status: "not-found",
          message: "Product details not found for this barcode. You can enter the details manually or import products using Excel/CSV.",
        });
        return;
      }
      setReviewItem(barcodeReviewFromProduct(found.product, value, found.source));
      setLookupState({ status: "success", message: "Product found. Review and complete the fields before saving." });
    } catch {
      setReviewItem(emptyBarcodeReview(value));
      setLookupState({
        status: "error",
        message: "Barcode lookup could not be completed because the product databases are unavailable. You can fill in the details manually or import the product using an Excel/CSV file.",
      });
    }
  };

  const updateReviewField = (field, value) => {
    setReviewItem((current) => ({ ...current, [field]: value }));
  };

  const approveBarcodeItem = async () => {
    if (!reviewItem?.itemName.trim()) {
      setLookupState({ status: "error", message: "Product name is required before saving." });
      return;
    }
    if (!reviewItem.itemCode.trim()) {
      setLookupState({ status: "error", message: "Barcode/item code is required before saving." });
      return;
    }
    const numericFields = [
      ["purchasePrice", "Purchase price"],
      ["salePrice", "Selling price"],
      ["taxRate", "Tax rate"],
      ["openingQuantity", "Opening stock"],
    ];
    for (const [field, label] of numericFields) {
      if (reviewItem[field] !== "" && (!Number.isFinite(Number(reviewItem[field])) || Number(reviewItem[field]) < 0)) {
        setLookupState({ status: "error", message: `${label} must be a non-negative number.` });
        return;
      }
    }
    setBarcodeSaving(true);
    setLookupState({ status: "loading", message: "Checking duplicates and saving the approved item..." });
    try {
      const existingItems = await businessDataApi.list("items");
      const duplicate = existingItems.some((item) => (
        String(item.itemCode || "").trim().toLowerCase() === reviewItem.itemCode.trim().toLowerCase()
        || (
          String(item.itemName || "").trim().toLowerCase() === reviewItem.itemName.trim().toLowerCase()
          && String(item.unit || "").trim().toLowerCase() === reviewItem.unit.trim().toLowerCase()
        )
      ));
      if (duplicate) throw new Error("An item with this barcode or name and unit already exists.");
      await saveBusinessItem({
        ...reviewItem,
        type: "product",
        code: reviewItem.itemCode,
        stock: reviewItem.openingQuantity,
        id: undefined,
      });
      setReviewItem(null);
      setBarcode("");
      setLookupState({ status: "success", message: "Approved item saved successfully. It will not be saved again unless you perform a new lookup." });
    } catch (error) {
      setLookupState({ status: "error", message: error.message || "Could not save the approved item. Your review data is still available." });
    } finally {
      setBarcodeSaving(false);
    }
  };

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError("");
    setMessage("");
    setRows([]);
    try {
      const fileName = file.name.toLowerCase();
      const parsed = fileName.endsWith(".csv")
        ? parseCsv(await file.text())
        : fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
          ? await parseExcel(file)
          : (() => { throw new Error("Choose a .xlsx, .xls, or .csv file."); })();
      if (parsed.length > maxRows) throw new Error(`Import up to ${maxRows} rows at a time.`);
      setRows(validateRows(parsed));
    } catch (error) {
      setFileError(error.message || "Could not read this file.");
    } finally {
      event.target.value = "";
    }
  };

  const importItems = async () => {
    if (!validRows.length) {
      setMessage("There are no valid rows to import.");
      return;
    }
    setSaving(true);
    setMessage("");
    let imported = 0;
    const failures = [];
    let existingItems;
    try {
      existingItems = await businessDataApi.list("items");
    } catch (error) {
      setSaving(false);
      setMessage(`Import stopped before saving because existing items could not be checked: ${error.message || "backend/database unavailable"}`);
      return;
    }
    const existingKeys = new Set(existingItems.flatMap((item) => [
      item.itemCode ? `code:${String(item.itemCode).trim().toLowerCase()}` : "",
      `name:${String(item.itemName || "").trim().toLowerCase()}|${String(item.unit || "").trim().toLowerCase()}`,
    ].filter(Boolean)));
    for (const row of validRows) {
      const codeKey = row.itemCode ? `code:${row.itemCode.toLowerCase()}` : "";
      const nameKey = `name:${row.itemName.toLowerCase()}|${row.unit.toLowerCase()}`;
      if ((codeKey && existingKeys.has(codeKey)) || existingKeys.has(nameKey)) {
        failures.push(`Row ${row.rowNumber}: item already exists`);
        continue;
      }
      try {
        await saveBusinessItem({
          ...row,
          id: undefined,
          code: row.itemCode,
          stock: row.openingQuantity,
        });
        imported += 1;
        if (codeKey) existingKeys.add(codeKey);
        existingKeys.add(nameKey);
      } catch (error) {
        failures.push(`Row ${row.rowNumber}: ${error.message || "save failed"}`);
      }
    }
    setSaving(false);
    setMessage(`${imported} item${imported === 1 ? "" : "s"} imported.${failures.length ? ` ${failures.length} item${failures.length === 1 ? "" : "s"} failed: ${failures.join(" | ")}` : ""}`);
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Import Items</h1>
          <p className="mt-1 text-sm text-slate-500">Review item rows before saving them through the existing inventory API.</p>
        </header>
        <Card className="p-5">
          <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
            Upload an Excel workbook or CSV with these columns: <strong>Item Name</strong>, Item Code, Type, Category, Unit, Sale Price, Purchase Price, Quantity.
          </div>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={selectFile} />
          <Button onClick={() => fileInput.current?.click()} className="mt-5 bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiUpload /> Choose Excel or CSV</Button>
          {fileError && <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><FiAlertCircle />{fileError}</p>}
          {message && <p role="status" className="mt-4 flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><FiCheckCircle />{message}</p>}
        </Card>
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Import From Barcode</h2>
              <p className="mt-1 text-sm text-slate-500">Enter a barcode, use a USB scanner focused on this field, scan with your camera, or upload a barcode image.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Open Food Facts + UPCitemdb</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <input aria-label="Barcode to look up" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") lookupBarcode(); }} placeholder="Scan or enter 8–14 digits" className="h-10 min-w-64 flex-1 rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <Button onClick={lookupBarcode} disabled={lookupState.status === "loading"} className="bg-[#1A1F71] text-white hover:bg-[#14185D]"><FiSearch /> Look Up</Button>
            <Button onClick={startCamera} disabled={cameraOpen} className="border border-slate-300 text-slate-700 hover:bg-white"><FiCamera /> Scan with Camera</Button>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={decodeImage} />
            <Button onClick={() => imageInput.current?.click()} className="border border-slate-300 text-slate-700 hover:bg-white"><FiImage /> Upload Barcode Image</Button>
          </div>
          {imagePreview && <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><img src={imagePreview} alt="Selected barcode" className="max-h-28 max-w-xs rounded object-contain" /><button type="button" aria-label="Remove barcode image" onClick={() => { URL.revokeObjectURL(imagePreview); setImagePreview(""); }} className="rounded p-1 text-slate-500 hover:bg-white"><FiX /></button></div>}
          {lookupState.message && <p role={lookupState.status === "error" || lookupState.status === "not-found" || lookupState.status === "image-error" ? "alert" : "status"} className={`mt-4 flex gap-2 rounded-lg p-3 text-sm ${lookupState.status === "success" ? "bg-emerald-50 text-emerald-800" : lookupState.status === "loading" ? "bg-blue-50 text-blue-800" : "bg-rose-50 text-rose-800"}`}>{lookupState.status === "success" ? <FiCheckCircle /> : <FiAlertCircle />}{lookupState.message}</p>}
          {(lookupState.status === "not-found" || lookupState.status === "error" || lookupState.status === "image-error") && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Choose how to continue:</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={() => { setReviewItem(emptyBarcodeReview(barcode.trim())); setLookupState({ status: "idle", message: "Enter the item details, then review and approve them before saving." }); }} className="bg-[#1A1F71] text-white hover:bg-[#14185D]">Enter Details Manually</Button>
                <Button onClick={() => fileInput.current?.click()} className="border border-slate-300 text-slate-700 hover:bg-white"><FiUpload /> Import Excel/CSV</Button>
                <Button onClick={() => /^\d{8,14}$/.test(barcode.trim()) ? lookupBarcode() : imageInput.current?.click()} className="border border-slate-300 text-slate-700 hover:bg-white"><FiSearch /> Try Again</Button>
                <Button onClick={() => { setReviewItem(null); setLookupState({ status: "idle", message: "Barcode lookup canceled. Nothing was saved." }); }} className="border border-slate-300 text-slate-700 hover:bg-white"><FiX /> Cancel</Button>
              </div>
            </div>
          )}
          {reviewItem && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-800">Review before saving</h3><p className="text-xs text-slate-500">{reviewItem.lookupNote}</p></div><button type="button" aria-label="Cancel barcode review" onClick={() => { setReviewItem(null); setLookupState({ status: "idle", message: "Pending barcode item discarded. Nothing was saved." }); }} className="rounded p-2 text-slate-500 hover:bg-white"><FiX /></button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[["itemName", "Product name"], ["itemCode", "Barcode / item code"], ["category", "Category"], ["unit", "Unit"], ["purchasePrice", "Purchase price"], ["salePrice", "Selling price"], ["taxRate", "Tax"], ["openingQuantity", "Opening quantity"]].map(([field, label]) => <label key={field} className="text-sm font-semibold text-slate-700">{label}<input value={reviewItem[field]} onChange={(event) => updateReviewField(field, event.target.value)} className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 font-normal outline-none focus:border-blue-500" /></label>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-3"><Button onClick={approveBarcodeItem} disabled={barcodeSaving} className="bg-emerald-600 text-white hover:bg-emerald-700">{barcodeSaving ? "Saving..." : "Save / Approve"}</Button><Button onClick={() => { setReviewItem(null); setLookupState({ status: "idle", message: "Pending barcode item discarded. Nothing was saved." }); }} className="border border-slate-300 text-slate-700 hover:bg-white">Cancel</Button></div>
            </div>
          )}
        </Card>
        {cameraOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Scan barcode with camera">
            <Card className="w-full max-w-xl p-5">
              <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-800">Scan with Camera</h2><p className="text-sm text-slate-500">Place a supported barcode inside the guide.</p></div><button type="button" aria-label="Close camera scanner" onClick={stopCamera} className="rounded p-2 text-slate-500 hover:bg-slate-100"><FiX /></button></div>
              <div className="relative mt-4 overflow-hidden rounded-lg bg-black"><video ref={cameraVideo} autoPlay muted playsInline className="aspect-video w-full object-cover" /><div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-emerald-400" /></div>
              {cameraState.message && <p role={cameraState.status === "error" ? "alert" : "status"} className={`mt-3 text-sm ${cameraState.status === "error" ? "text-rose-600" : "text-slate-600"}`}>{cameraState.message}</p>}
              <div className="mt-4 flex justify-end gap-3"><Button onClick={stopCamera} className="border border-slate-300 text-slate-700 hover:bg-slate-50">Close</Button><Button onClick={() => { stopCamera(); startCamera(); }} className="bg-[#1A1F71] text-white hover:bg-[#14185D]">Retry</Button></div>
            </Card>
          </div>
        )}
        {rows.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div><h2 className="font-bold text-slate-800">Preview</h2><p className="text-sm text-slate-500">{validRows.length} valid, {invalidRows} invalid</p></div>
              <Button disabled={saving || !validRows.length} onClick={importItems} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? "Importing..." : "Import Valid Items"}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Row", "Item Name", "Item Code", "Type", "Unit", "Sale Price", "Status"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
                <tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t border-slate-100"><td className="px-4 py-3">{row.rowNumber}</td><td className="px-4 py-3">{row.itemName || "-"}</td><td className="px-4 py-3">{row.itemCode || "-"}</td><td className="px-4 py-3">{row.type}</td><td className="px-4 py-3">{row.unit || "-"}</td><td className="px-4 py-3">{row.salePrice || "-"}</td><td className={`px-4 py-3 ${row.errors.length ? "text-rose-600" : "text-emerald-600"}`}>{row.errors.length ? row.errors.join("; ") : "Ready"}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default ImportItems;
