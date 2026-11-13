// Renders the topbar interface component.
import {
  FiArrowRight,
  FiBarChart2,
  FiFileText,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiShoppingCart,
  FiUser,
  FiUsers,
  FiX,
  FiMoon,
  FiSun,
} from "react-icons/fi";
import { useTheme } from "../../context/ThemeContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
} from "../../services/companyProfileStorage";
import { sidebarNavigation } from "../Sidebar/SidebarData";
import { getAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../../services/appSettingsStorage";
import { getParties } from "../../services/partiesStorage";
import { getInventoryItems } from "../../services/itemsStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";
import { getSaleOrders, getPurchaseOrders } from "../../services/transactionRepository.js";
import { isReportVisible } from "../../config/reportVisibility.js";

const navItems = ["Company", "Help"];
const transactionRoutes = [
  "/sales/sale-invoices/new",
  "/purchase-expense/purchase-bills/new",
];

const reportList = [
  "Sale Report",
  "Purchase Report",
  "Day Book",
  "All Transactions",
  "Sale/Purchase Orders",
  "Profit And Loss",
  "Bill Wise Profit",
  "Cash Flow",
  "Trial Balance Report",
  "Balance Sheet",
  "Party Statement",
  "Stock Summary",
  "GSTR 3 B",
  "GSTR 4",
  "GSTR 9A",
];

// Renders the topbar interface.
export default function Topbar({ onRefresh }) {
  const navigate = useNavigate();
  const { theme, toggleTheme, isDark } = useTheme();
  const { pathname } = useLocation();
  const [companyProfile, setCompanyProfile] = useState(getCompanyProfile);
  const [logoError, setLogoError] = useState(false);
  const [comingSoon, setComingSoon] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef(null);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsVersion, setSettingsVersion] = useState(0);
  const settings = useMemo(() => getAppSettings(), [settingsVersion]);

  useEffect(() => {
    const bump = () => setSettingsVersion((v) => v + 1);
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef(null);

  const handleNavClick = (item) => {
    if (item === "Company") {
      navigate("/company-profile");
    } else {
      setComingSoon(item);
    }
  };

  // Opens transaction.
  const openTransaction = (path) => {
    const state = transactionRoutes.includes(pathname)
      ? undefined
      : { from: pathname };
    navigate(path, state ? { state } : undefined);
  };

  useEffect(() => {
    // Refreshes company profile.
    const refreshCompanyProfile = () => setCompanyProfile(getCompanyProfile());
    window.addEventListener("storage", refreshCompanyProfile);
    window.addEventListener(companyProfileUpdatedEvent, refreshCompanyProfile);
    return () => {
      window.removeEventListener("storage", refreshCompanyProfile);
      window.removeEventListener(
        companyProfileUpdatedEvent,
        refreshCompanyProfile
      );
    };
  }, []);

  useEffect(() => {
    setLogoError(false);
  }, [companyProfile?.logo]);

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const refreshCurrentPage = () => {
    onRefresh?.();
    setRefreshing(true);
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), 700);
  };

  // Build searchable database from navigation, parties, items, transactions, and reports
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const results = [];

    // 1. Search Pages / Navigation
    sidebarNavigation.forEach((nav) => {
      if (nav.path && nav.label.toLowerCase().includes(query)) {
        results.push({
          type: "Page",
          icon: FiFileText,
          title: nav.label,
          subtitle: `Go to ${nav.label}`,
          path: nav.path,
        });
      }
      if (nav.children) {
        nav.children.forEach((child) => {
          if (
            child.label.toLowerCase().includes(query) ||
            nav.label.toLowerCase().includes(query)
          ) {
            results.push({
              type: "Menu",
              icon: FiFileText,
              title: child.label,
              subtitle: `${nav.label} → ${child.label}`,
              path: child.path,
            });
          }
        });
      }
    });

    // 2. Search Parties
    try {
      const parties = getParties();
      parties.forEach((party) => {
        const name = party.partyName || party.name || "";
        const phone = party.phone || "";
        if (
          name.toLowerCase().includes(query) ||
          phone.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Party",
            icon: FiUsers,
            title: name,
            subtitle: phone ? `Phone: ${phone}` : "Party Details",
            path: "/parties/party-details",
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 3. Search Inventory Items
    try {
      const items = getInventoryItems();
      items.forEach((item) => {
        const name = item.itemName || item.name || "";
        const code = item.itemCode || item.code || "";
        const barcode = item.barcode || item.barCode || "";
        const matchName = name.toLowerCase().includes(query);
        const matchCode = code.toLowerCase().includes(query);
        const matchBarcode = (settings.enableBarcodeScanning ?? true) && barcode.toLowerCase().includes(query);
        if (matchName || matchCode || matchBarcode) {
          results.push({
            type: "Item",
            icon: FiPackage,
            title: name,
            subtitle: `${code ? `Code: ${code} · ` : ""}${barcode && (settings.enableBarcodeScanning ?? true) ? `Barcode: ${barcode} · ` : ""}Sale Price: ₹${item.salePrice || item.price || 0}`,
            path: "/items",
            state: { itemId: item.id },
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 4. Search Sale Invoices
    try {
      const invoices = getSaleInvoices();
      invoices.forEach((inv) => {
        const num = String(inv.invoiceNumber || inv.form?.invoiceNumber || "");
        const cust = inv.customer || inv.form?.customer || "";
        if (
          num.toLowerCase().includes(query) ||
          cust.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Sale",
            icon: FiFileText,
            title: `Sale Invoice #${num || "—"}`,
            subtitle: `${cust || "Cash Sale"} · ₹${inv.totalAmount || inv.totals?.grandTotal || 0}`,
            path: "/sales/sale-invoices",
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 5. Search Purchase Bills
    try {
      const bills = getPurchaseBills();
      bills.forEach((bill) => {
        const num = String(bill.invoiceNumber || bill.form?.invoiceNumber || "");
        const supplier = bill.partyName || bill.form?.customer || "";
        if (
          num.toLowerCase().includes(query) ||
          supplier.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Purchase",
            icon: FiShoppingCart,
            title: `Purchase Bill #${num || "—"}`,
            subtitle: `${supplier || "Supplier"} · ₹${bill.totalAmount || bill.totals?.finalTotal || 0}`,
            path: "/purchase-expense/purchase-bills",
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 5b. Search Sale Orders
    try {
      const saleOrders = getSaleOrders();
      saleOrders.forEach((so) => {
        const num = String(so.orderNumber || so.orderNo || so.invoiceNumber || "");
        const customer = so.customer || so.partyName || "";
        if (
          num.toLowerCase().includes(query) ||
          customer.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Sale Order",
            icon: FiFileText,
            title: `Sale Order #${num || "—"}`,
            subtitle: `${customer || "Customer"} · ₹${so.totalAmount || so.totals?.grandTotal || 0} (${so.status || "Open"})`,
            path: "/sales/sale-order",
            state: { editOrder: so },
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 5c. Search Purchase Orders
    try {
      const purchaseOrders = getPurchaseOrders();
      purchaseOrders.forEach((po) => {
        const num = String(po.orderNumber || po.orderNo || po.invoiceNumber || "");
        const supplier = po.partyName || po.supplier || po.customer || "";
        if (
          num.toLowerCase().includes(query) ||
          supplier.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Purchase Order",
            icon: FiShoppingCart,
            title: `Purchase Order #${num || "—"}`,
            subtitle: `${supplier || "Supplier"} · ₹${po.totalAmount || po.totals?.finalTotal || 0} (${po.status || "Open"})`,
            path: "/purchase-expense/purchase-order",
            state: { editOrder: po },
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    // 6. Search Reports
    reportList.filter(isReportVisible).forEach((rep) => {
      if (rep.toLowerCase().includes(query)) {
        results.push({
          type: "Report",
          icon: FiBarChart2,
          title: rep,
          subtitle: "View financial & GST report",
          path:
            rep === "Bill Wise Profit"
              ? "/reports/bill-wise-profit"
              : rep === "Balance Sheet"
              ? "/reports/balance-sheet"
              : rep === "GSTR 3 B"
              ? "/reports/gstr-3b"
              : rep === "Sale/Purchase Orders"
              ? "/reports/sale-purchase-orders"
              : "/reports",
        });
      }
    });

    return results.slice(0, 10); // Top 10 results
  }, [searchQuery]);

  const handleSelectResult = (result) => {
    setIsSearchFocused(false);
    setSearchQuery("");
    if (result.state) {
      navigate(result.path, { state: result.state });
    } else {
      navigate(result.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsSearchFocused(false);
    } else if (e.key === "Enter" && searchResults.length > 0) {
      handleSelectResult(searchResults[0]);
    }
  };

  return (
    <header
      className={`relative shrink-0 border-b border-[#252B37] bg-[#12151B] text-white select-none ${
        isSearchFocused && searchQuery.trim() ? "z-[60]" : "z-30"
      }`}
    >
      

      <div className="flex h-[52px] items-center justify-between px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5A1F] shadow-[0_0_8px_rgba(255,90,31,0.6)]" />
          <span
            onClick={() => navigate("/company-profile")}
            title="Click to view Company Profile"
            className="hidden text-sm font-semibold text-slate-100 sm:block cursor-pointer hover:text-[#FF5A1F] transition"
          >
            {companyProfile.businessName ||
              companyProfile.companyName ||
              "Sai Kirana Stores"}
          </span>

          {/* Functional Search Bar */}
          <div
            ref={searchContainerRef}
            className="relative ml-3 hidden max-w-md flex-1 lg:block"
          >
            <div
              className={`flex h-9 items-center gap-2 rounded-lg bg-[#1A1E27] px-3 border border-[#2B313F] transition ${
                isSearchFocused
                  ? "border-[#FF5A1F] bg-[#1A1E27] shadow-xs ring-2 ring-[#FF5A1F]/20"
                  : "border-transparent"
              }`}
            >
              <FiSearch className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-white"
                placeholder={settings.enableBarcodeScanning ? "Search transactions, items, barcode, parties" : "Search transactions, reports, parties"}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Results Dropdown */}
            {isSearchFocused && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-[#2B313F] bg-[#161922] text-slate-100 shadow-2xl z-[100] p-1.5">
                {searchResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {searchResults.map((result, idx) => {
                      const IconComponent = result.icon;
                      const badgeColors = {
                        Page: "bg-blue-900/40 text-blue-300 border border-blue-700/50",
                        Menu: "bg-indigo-900/40 text-indigo-300 border border-indigo-700/50",
                        Party: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50",
                        Item: "bg-amber-900/40 text-amber-300 border border-amber-700/50",
                        Sale: "bg-rose-900/40 text-rose-300 border border-rose-700/50",
                        Purchase: "bg-teal-900/40 text-teal-300 border border-teal-700/50",
                        Report: "bg-purple-900/40 text-purple-300 border border-purple-700/50",
                      };
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectResult(result)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-[#202532] transition cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#252B37] text-slate-300 group-hover:bg-[#FF5A1F]/20 group-hover:text-[#FF5A1F]">
                              <IconComponent className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-white group-hover:text-[#FF5A1F]">
                                {result.title}
                              </p>
                              <p className="truncate text-[11px] text-slate-400 group-hover:text-slate-300">
                                {result.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                badgeColors[result.type] ||
                                "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {result.type}
                            </span>
                            <FiArrowRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    <p className="font-medium text-slate-200">
                      No matching records found
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      No transactions, parties, items, or reports match "
                      <span className="font-semibold text-white">
                        {searchQuery}
                      </span>
                      "
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openTransaction("/sales/sale-invoices/new")}
            className="hidden rounded-full bg-[#FF5A1F] hover:bg-[#E84E0F] active:bg-[#D4430B] px-4 py-2 text-[13px] font-bold text-white md:block transition-all shadow-[0_3px_12px_rgba(255,90,31,0.35)] hover:shadow-[0_4px_16px_rgba(255,90,31,0.5)] hover:scale-[1.02] active:scale-95 cursor-pointer tracking-wide"
          >
            + Add Sale
          </button>
          <button
            type="button"
            onClick={() =>
              openTransaction("/purchase-expense/purchase-bills/new")
            }
            className="hidden rounded-full bg-[#161921] hover:bg-[#202530] border border-[#2F3646] hover:border-[#FF5A1F]/60 px-4 py-2 text-[13px] font-semibold text-white md:block transition-all shadow-xs hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            + Add Purchase
          </button>
          
          
      
          {/* Light / Dark Mode Switch */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle dark/light mode"
            className="rounded-full bg-[#1A1E27] border border-[#2B313F] p-2 text-slate-300 hover:text-[#FF5A1F] hover:border-[#FF5A1F]/50 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-xs"
          >
            {isDark ? (
              <FiSun className="h-4 w-4 text-amber-500 transition-transform rotate-0 hover:rotate-45" />
            ) : (
              <FiMoon className="h-4 w-4 text-slate-600 transition-transform hover:-rotate-12" />
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/company-profile")}
            title={companyProfile?.businessName || companyProfile?.companyName || "Company Profile"}
            aria-label="Company Profile"
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#161921] border-2 border-[#FF5A1F] text-[#FF5A1F] hover:bg-[#202530] transition cursor-pointer hover:scale-105 active:scale-95 shadow-xs"
          >
            {companyProfile?.logo && !logoError ? (
              <img
                src={companyProfile.logo}
                alt={companyProfile?.businessName || companyProfile?.companyName || "Company Logo"}
                onError={() => setLogoError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <FiUser className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
