import {
  FiBarChart2,
  FiBriefcase,
  FiCreditCard,
  FiFileText,
  FiGrid,
  FiHome,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShoppingCart,
  FiTool,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";

export const sidebarBrand = {
  name: "Ledgerly",
  companyName: "My Company",
};

export const sidebarSearch = {
  label: "Open Anything",
  shortcut: "Ctrl+F",
  icon: FiSearch,
};

export const sidebarNavigation = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    icon: FiHome,
  },
  {
    id: "parties",
    label: "Parties",
    icon: FiUsers,
    children: [
      {
        id: "party-details",
        label: "Party Details",
        path: "/parties/party-details",
      },
      {
        id: "whatsapp-connect",
        label: "WhatsApp Connect",
        path: "/parties/whatsapp-connect",
      },
      {
        id: "business-network",
        label: "Business Network",
        path: "/parties/business-network",
      },
    ],
  },
  {
    id: "items",
    label: "Items",
    path: "/items",
    icon: FiPackage,
  },
  {
    id: "sales",
    label: "Sales",
    icon: FiFileText,
    children: [
      {
        id: "sale-invoices",
        label: "Sale Invoices",
        path: "/sales/sale-invoices",
      },
      {
        id: "estimate-quotation",
        label: "Estimate / Quotation",
        path: "/sales/estimate-quotation",
      },
      {
        id: "proforma-invoice",
        label: "Proforma Invoice",
        path: "/sales/proforma-invoice",
      },
      {
        id: "payment-in",
        label: "Payment In",
        path: "/sales/payment-in",
      },
      {
        id: "sale-order",
        label: "Sale Order",
        path: "/sales/sale-order",
      },
      {
        id: "delivery-challan",
        label: "Delivery Challan",
        path: "/sales/delivery-challan",
      },
      {
        id: "sale-return-credit-note",
        label: "Sale Return / Credit Note",
        path: "/sales/sale-return-credit-note",
      },
      {
        id: "pos",
        label: "POS",
        path: "/sales/pos",
      },
    ],
  },
  {
    id: "purchase-expense",
    label: "Purchase & Expense",
    icon: FiShoppingCart,
    children: [
      {
        id: "purchase-bills",
        label: "Purchase Bills",
        path: "/purchase-expense/purchase-bills",
      },
      {
        id: "payment-out",
        label: "Payment Out",
        path: "/purchase-expense/payment-out",
      },
      {
        id: "expenses",
        label: "Expenses",
        path: "/purchase-expense/expenses",
      },
      {
        id: "purchase-order",
        label: "Purchase Order",
        path: "/purchase-expense/purchase-order",
      },
      {
        id: "purchase-return-debit-note",
        label: "Purchase Return / Debit Note",
        path: "/purchase-expense/purchase-return-debit-note",
      },
    ],
  },
  {
    id: "business-growth",
    label: "Business Growth",
    icon: FiTrendingUp,
    children: [
      {
        id: "google-profile-manager",
        label: "Google Profile Manager",
        path: "/business-growth/google-profile-manager",
      },
      {
        id: "marketing-tools",
        label: "Marketing Tools",
        path: "/business-growth/marketing-tools",
      },
      {
        id: "whatsapp-marketing",
        label: "WhatsApp Marketing",
        path: "/business-growth/whatsapp-marketing",
      },
      {
        id: "online-store",
        label: "Online Store",
        path: "/business-growth/online-store",
      },
      {
        id: "smart-ads",
        label: "Smart Ads",
        path: "/business-growth/smart-ads",
      },
      {
        id: "business-horoscope",
        label: "Business Horoscope",
        path: "/business-growth/business-horoscope",
      },
    ],
  },
  {
    id: "cash-bank",
    label: "Cash & Bank",
    icon: FiCreditCard,
    children: [
      {
        id: "bank-accounts",
        label: "Bank Accounts",
        path: "/cash-bank/bank-accounts",
      },
      {
        id: "cash-in-hand",
        label: "Cash In Hand",
        path: "/cash-bank/cash-in-hand",
      },
      {
        id: "cheques",
        label: "Cheques",
        path: "/cash-bank/cheques",
      },
      {
        id: "loan-accounts",
        label: "Loan Accounts",
        path: "/cash-bank/loan-accounts",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    path: "/reports",
    icon: FiBarChart2,
  },
  {
    id: "sync-share-backup",
    label: "Sync, Share & Backup",
    icon: FiRefreshCw,
    children: [
      {
        id: "sync-share",
        label: "Sync & Share",
        path: "/sync-share-backup/sync-share",
      },
      {
        id: "auto-backup",
        label: "Auto Backup",
        path: "/sync-share-backup/auto-backup",
      },
      {
        id: "backup-to-computer",
        label: "Backup To Computer",
        path: "/sync-share-backup/backup-to-computer",
      },
      {
        id: "backup-to-drive",
        label: "Backup To Drive",
        path: "/sync-share-backup/backup-to-drive",
      },
      {
        id: "restore-backup",
        label: "Restore Backup",
        path: "/sync-share-backup/restore-backup",
      },
    ],
  },
  {
    id: "utilities",
    label: "Utilities",
    icon: FiTool,
    children: [
      {
        id: "import-items",
        label: "Import Items",
        path: "/utilities/import-items",
      },
      {
        id: "set-up-my-business",
        label: "Set Up My Business",
        path: "/utilities/set-up-my-business",
      },
      {
        id: "accountant-access",
        label: "Accountant Access",
        path: "/utilities/accountant-access",
      },
      {
        id: "barcode-generator",
        label: "Barcode Generator",
        path: "/utilities/barcode-generator",
      },
      {
        id: "update-items-in-bulk",
        label: "Update Items In Bulk",
        path: "/utilities/update-items-in-bulk",
      },
      {
        id: "import-from-tally",
        label: "Import From Tally",
        path: "/utilities/import-from-tally",
      },
      {
        id: "import-parties",
        label: "Import Parties",
        path: "/utilities/import-parties",
      },
      {
        id: "track-your-salesmen",
        label: "Track Your Salesmen",
        path: "/utilities/track-your-salesmen",
      },
      {
        id: "export-to-tally",
        label: "Export To Tally",
        path: "/utilities/export-to-tally",
      },
      {
        id: "export-items",
        label: "Export Items",
        path: "/utilities/export-items",
      },
      {
        id: "verify-my-data",
        label: "Verify My Data",
        path: "/utilities/verify-my-data",
      },
      {
        id: "recycle-bin",
        label: "Recycle Bin",
        path: "/utilities/recycle-bin",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    icon: FiSettings,
  },
];

export const sidebarTrial = {
  title: "5 days free trial left",
  progress: 45,
  ctaLabel: "Get Premium",
};

export const companySwitcher = {
  label: "My Company",
  path: "/companies",
  icon: FiBriefcase,
};

export const sidebarData = sidebarNavigation;

export default sidebarNavigation;
