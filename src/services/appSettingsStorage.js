// Manages application settings, configuration persistence, and auto-backup snapshots.
import { getCompanyProfile } from "./companyProfileStorage.js";
import { recordAuditTrail } from "./auditTrailStorage.js";

export const APP_SETTINGS_KEY = "ledgerly:appSettings.v1";
export const APP_SETTINGS_UPDATED_EVENT = "ledgerly:app-settings-updated";
export const AUTO_BACKUP_HISTORY_KEY = "ledgerly:autoBackupSnapshots.v1";

const defaultCompany = () => {
  try {
    const profile = getCompanyProfile();
    return profile?.companyName || "Sai Kirana Stores";
  } catch {
    return "Sai Kirana Stores";
  }
};

export const DEFAULT_SETTINGS = {
  // General -> Application
  currency: "INR",
  currencySymbol: "₹",
  amountDecimalPlaces: 2,
  enableGstin: true,
  stopSaleOnNegativeStock: false,
  blockNewItemsFromTxn: false,
  blockNewPartiesFromTxn: false,

  // General -> More Transactions
  enableEstimateQuotation: true,
  enableProformaInvoice: true,
  enableSalePurchaseOrder: true,
  enableOtherIncome: false,
  enableFixedAssets: false,
  enableDeliveryChallan: true,
  goodsReturnOnDeliveryChallan: false,
  printAmountInDeliveryChallan: false,

  // General -> Multi Firm
  multiFirmEnabled: false,
  firms: [
    { id: "firm-1", name: defaultCompany(), isDefault: true, devices: "ALL DEVICES" }
  ],

  // General -> Godowns / Stock Transfer
  godownManagementEnabled: false,
  godowns: [
    { id: "godown-1", name: "Main Store", isDefault: true }
  ],

  // General -> Backup & History
  autoBackup: true,
  autoBackupDays: 13,
  lastBackupDate: "22/10/2026 | 10:10 AM",
  lastBackupTimestamp: null,
  auditTrail: true,

  // General -> Screen Zoom
  screenZoom: "100%",

  // Transaction -> Transaction Header
  enableInvoiceBillNo: true,
  addTimeOnTransactions: false,
  cashSaleByDefault: false,
  billingNameOfParties: false,
  customerPoDetails: false,

  // Transaction -> Items Table
  inclusiveTaxOnRate: true,
  displayPurchasePriceOfItems: true,
  showLast5SalePrice: false,
  showLast5PurchasePrice: false,
  enableFreeItemQuantity: false,
  enableItemCount: false,
  itemCountLabel: "Count",

  // Transaction -> More Transaction Features
  enableEwayBillNo: true,
  enableQuickEntry: false,
  doNotShowInvoicePreview: false,
  enableRepeatInvoices: false,
  passcodeForTxnEditDelete: false,
  discountDuringPayments: false,
  linkPaymentsToInvoices: true,
  dueDatesAndPaymentTerms: false,
  showProfitWhileMakingSaleInvoice: false,
  showWholesalePriceToggle: false,
  enableTermsAndConditions: true,
  termsTitle: "Standard Terms",
  termsAndConditions: "1. Goods once sold will not be taken back without original bill.\n2. Interest @ 18% p.a. will be charged after due date.",
  termsApplicableFor: {
    saleInvoice: true,
    saleOrder: false,
    deliveryChallan: false,
    estimateQuotation: false,
    purchaseBill: false,
    purchaseOrder: false,
    proformaInvoice: false,
  },
  additionalFields: [
    { id: "poNumber", label: "PO Number", enabled: false },
    { id: "vehicleNumber", label: "Vehicle Number", enabled: false },
    { id: "driverName", label: "Driver Name", enabled: false },
  ],
  transportationDetails: {
    enabled: false,
    transporterName: "",
    lrNumber: "",
    vehicleNumber: "",
    dateOfSupply: "",
  },
  additionalCharges: [
    { id: "shipping", label: "Shipping / Freight", amount: 0, enabled: false },
    { id: "packaging", label: "Packaging Charges", amount: 0, enabled: false },
    { id: "insurance", label: "Insurance", amount: 0, enabled: false },
  ],

  // Transaction -> Transaction Prefixes
  selectedPrefixFirm: "firm-1",
  salePrefix: "None",
  creditNotePrefix: "None",
  saleOrderPrefix: "None",
  purchaseOrderPrefix: "None",
  proformaInvoicePrefix: "None",
  deliveryChallanPrefix: "None",
  paymentInPrefix: "None",

  // Transaction -> Taxes, Discount & Totals
  transactionWiseTax: false,
  transactionWiseDiscount: false,
  roundOffTotal: true,
  roundOffMode: "Nearest", // Nearest, Up, Down
  roundOffTo: 1, // 1, 5, 10, 0.5
  roundOffTransaction: true,
  roundOffRule: "Nearest",
  invoicePrefix: "INV-",
  defaultPaymentMode: "Cash",
  enableTransactionDiscount: true,
  enableItemDiscount: true,

  // Transaction -> Billing Type
  billingType: "Full Sale", // "Lite Sale" or "Full Sale"

  // Print (Matching Vyapar Desktop)
  printActiveTab: "regular",
  printSubTab: "layout",
  selectedTheme: "GST Theme 5",
  themeColor: "#881337",
  makeRegularPrinterDefault: true,
  printRepeatHeader: true,
  printCompanyName: true,
  companyNamePrint: "sai kirana stores",
  printCompanyLogo: true,
  printAddress: true,
  addressPrint: "",
  printEmail: true,
  emailPrint: "",
  printPhoneNumber: true,
  phoneNumberPrint: "8369501991",
  printGstinOnSale: true,
  printerType: "Regular",
  paperSize: "A4",
  orientation: "Portrait",
  companyNameTextSize: "Large",
  invoiceTextSize: "Medium",
  printOriginalDuplicate: false,
  extraSpaceTopPdf: 0,
  transactionNames: {
    saleInvoice: "Sale",
    estimateQuotation: "Estimate / Quotation",
    deliveryChallan: "Delivery Challan",
    saleOrder: "Sale Order",
    purchaseOrder: "Purchase Order",
    purchaseBill: "Purchase Bill",
  },

  // Print -> Item Table
  expandTableWholePage: true,
  minRowsItemTable: 0,

  // Print -> Totals & Taxes
  printTotalItemQty: true,
  printAmountWithDecimal: true,
  printReceivedAmount: true,
  printBalanceAmount: true,
  printCurrentBalanceParty: false,
  printTaxDetails: true,
  printYouSaved: true,
  printAmountWithGrouping: true,
  amountInWordsFormat: "Indian",

  // Print -> Footer
  printDescription: true,
  printTermsAndConditions: true,
  printReceivedByDetails: true,
  printDeliveredByDetails: true,
  printSignature: true,
  printSignatureText: "Authorized Signature",
  printPaymentMode: false,
  printAcknowledgement: false,
  printBankDetails: true,
  printGstSummary: true,

  // Taxes & GST (Matching Vyapar GST Settings)
  enableGst: true,
  enableHsnSacCode: true,
  additionalCessOnItem: true,
  reverseCharge: true,
  reverseChargeApplicable: true,
  enablePlaceOfSupply: true,
  compositeScheme: true,
  compositeSchemeType: "Manufacturer 1.0%",
  enableTcs: false,
  enableTds: false,
  tcsRate: 0.1,
  tdsRate: 0.1,
  defaultTaxRate: "18%",
  taxRatesList: [
    { id: "tax-0", name: "Exempt (0%)", rate: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, isDefault: false },
    { id: "tax-0.25", name: "GST @ 0.25%", rate: 0.25, igst: 0.25, cgst: 0.125, sgst: 0.125, cess: 0, isDefault: false },
    { id: "tax-3", name: "GST @ 3%", rate: 3, igst: 3, cgst: 1.5, sgst: 1.5, cess: 0, isDefault: false },
    { id: "tax-5", name: "GST @ 5%", rate: 5, igst: 5, cgst: 2.5, sgst: 2.5, cess: 0, isDefault: false },
    { id: "tax-12", name: "GST @ 12%", rate: 12, igst: 12, cgst: 6, sgst: 6, cess: 0, isDefault: false },
    { id: "tax-18", name: "GST @ 18%", rate: 18, igst: 18, cgst: 9, sgst: 9, cess: 0, isDefault: true },
    { id: "tax-28", name: "GST @ 28%", rate: 28, igst: 28, cgst: 14, sgst: 14, cess: 0, isDefault: false },
    { id: "tax-28-cess12", name: "GST @ 28% + Cess 12%", rate: 28, igst: 28, cgst: 14, sgst: 14, cess: 12, isDefault: false },
  ],

  // Transaction Message
  sendSmsOnSale: false,
  sendWhatsappOnSale: true,
  saleMessageTemplate: "Dear {customer}, thank you for your order of {amount} with {company}. Invoice #{invoice}.",

  // Party
  enablePartyGrouping: true,
  enableCreditLimitWarning: true,
  enableLoyaltyPoints: false,

  // Item
  enableBarcodeScanning: true,
  enableItemCategory: true,
  defaultItemUnit: "PCS",
  enableItemDescription: true,
  enableBatchTracking: false,
  enableSerialTracking: false,

  // Service Reminders
  serviceRemindersEnabled: false,
  reminderDaysBefore: 3,

  // Accounting
  financialYearStart: "01/04",
  closeBooksEnabled: false,

  // Multi Currency
  multiCurrencyEnabled: false,
  baseCurrency: "INR",
};

export function getAppSettings() {
  if (typeof window === "undefined" || !window.localStorage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    console.warn("Failed to load settings from storage, using defaults.", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(updates) {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_SETTINGS;
  const current = getAppSettings();
  const next = { ...current, ...updates };
  try {
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
    if (updates.screenZoom) {
      applyScreenZoom(updates.screenZoom);
    }
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_UPDATED_EVENT, { detail: next }));
    recordAuditTrail({
      action: "Settings Updated",
      entity: "Settings",
      details: Object.keys(updates).join(", "),
      user: "Current User",
    });
  } catch (error) {
    console.error("Failed to save settings to storage", error);
  }
  return next;
}

export function applyScreenZoom(zoomString) {
  if (typeof document === "undefined") return;
  const zoomClean = String(zoomString || "100%").trim();
  const zoomDecimal = (parseFloat(zoomClean) || 100) / 100;
  try {
    document.documentElement.style.zoom = zoomClean;
  } catch {
    document.documentElement.style.transform = `scale(${zoomDecimal})`;
    document.documentElement.style.transformOrigin = "top left";
  }
}

export function formatCurrency(value) {
  const settings = getAppSettings();
  const sym = settings.currencySymbol || "₹";
  const decimals = settings.amountDecimalPlaces ?? 2;
  const num = Number(value || 0);
  if (isNaN(num)) return `${sym} ${(0).toFixed(decimals)}`;
  return `${sym} ${num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// -------------------------------------------------------------
// AUTO BACKUP ENGINE
// -------------------------------------------------------------
export function getAutoBackupHistory() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(AUTO_BACKUP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function createAutoBackupSnapshot(label = "Manual Snapshot") {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const snapshotData = {};
  let keyCount = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("ledgerly:") || key.startsWith("usk:"))) {
      snapshotData[key] = window.localStorage.getItem(key);
      keyCount++;
    }
  }

  const now = new Date();
  const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} | ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const snapshotRecord = {
    id: `snapshot-${Date.now()}`,
    label,
    date: formattedDate,
    timestamp: now.toISOString(),
    keysCount: keyCount,
    data: snapshotData,
  };

  try {
    const history = getAutoBackupHistory();
    const updatedHistory = [snapshotRecord, ...history].slice(0, 10); // keep last 10 rolling snapshots
    window.localStorage.setItem(AUTO_BACKUP_HISTORY_KEY, JSON.stringify(updatedHistory));

    // Update settings timestamp
    const current = getAppSettings();
    const nextSettings = {
      ...current,
      lastBackupDate: formattedDate,
      lastBackupTimestamp: now.toISOString(),
    };
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(nextSettings));
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_UPDATED_EVENT, { detail: nextSettings }));

    recordAuditTrail({
      action: "Auto Backup Executed",
      entity: "Backup",
      details: `${label}: ${keyCount} storage collections archived`,
      user: "System Daemon",
    });

    return snapshotRecord;
  } catch (error) {
    console.warn("Could not save auto-backup snapshot", error);
    return null;
  }
}

export function checkAndRunAutoBackup() {
  const settings = getAppSettings();
  if (!settings.autoBackup) return null;

  const now = new Date();
  const lastTime = settings.lastBackupTimestamp ? new Date(settings.lastBackupTimestamp).getTime() : 0;
  const daysInterval = Math.max(1, Number(settings.autoBackupDays) || 13);
  const msInterval = daysInterval * 24 * 60 * 60 * 1000;

  // Run auto backup if interval has elapsed or never run
  if (!lastTime || (now.getTime() - lastTime) >= msInterval) {
    return createAutoBackupSnapshot("Scheduled Auto Backup");
  }
  return null;
}

export function restoreSnapshot(snapshotId) {
  const history = getAutoBackupHistory();
  const snapshot = history.find((s) => s.id === snapshotId);
  if (!snapshot || !snapshot.data) throw new Error("Snapshot not found or invalid");

  Object.entries(snapshot.data).forEach(([k, v]) => {
    if (typeof v === "string") {
      window.localStorage.setItem(k, v);
    }
  });

  recordAuditTrail({
    action: "Snapshot Restored",
    entity: "Backup",
    details: `Restored snapshot from ${snapshot.date}`,
    user: "User",
  });

  window.dispatchEvent(new Event("storage"));
  return true;
}

export function exportBackupData() {
  if (typeof window === "undefined" || !window.localStorage) return;
  // Also create a local snapshot
  createAutoBackupSnapshot("Manual Export Backup");

  const backup = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("ledgerly:") || key.startsWith("usk:"))) {
      backup[key] = window.localStorage.getItem(key);
    }
  }
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Vyapar_Backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const now = new Date();
  const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} | ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return formattedDate;
}

export async function restoreBackupData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (typeof data !== "object" || data === null) throw new Error("Invalid backup format");
        Object.entries(data).forEach(([key, val]) => {
          if (typeof val === "string") {
            window.localStorage.setItem(key, val);
          }
        });
        recordAuditTrail({
          action: "Backup Restored from File",
          entity: "Backup",
          details: file.name,
          user: "User",
        });
        window.dispatchEvent(new Event("storage"));
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
