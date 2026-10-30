// Renders the topbar interface component.
import {
  FiArrowRight,
  FiBarChart2,
  FiBell,
  FiFileText,
  FiHelpCircle,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiShoppingCart,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
} from "../../services/companyProfileStorage";
import { sidebarNavigation } from "../Sidebar/SidebarData";
import { getParties } from "../../services/partiesStorage";
import { getInventoryItems } from "../../services/itemsStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";

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
  const { pathname } = useLocation();
  const [companyProfile, setCompanyProfile] = useState(getCompanyProfile);
  const [comingSoon, setComingSoon] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef(null);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState("");
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
        if (
          name.toLowerCase().includes(query) ||
          code.toLowerCase().includes(query)
        ) {
          results.push({
            type: "Item",
            icon: FiPackage,
            title: name,
            subtitle: `Code: ${code || "N/A"} · Sale Price: ₹${item.salePrice || item.price || 0}`,
            path: "/items",
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

    // 6. Search Reports
    reportList.forEach((rep) => {
      if (rep.toLowerCase().includes(query)) {
        results.push({
          type: "Report",
          icon: FiBarChart2,
          title: rep,
          subtitle: "View financial & GST report",
          path: "/reports",
        });
      }
    });

    return results.slice(0, 10); // Top 10 results
  }, [searchQuery]);

  const handleSelectResult = (result) => {
    setIsSearchFocused(false);
    setSearchQuery("");
    navigate(result.path);
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
      className={`relative shrink-0 border-b border-slate-200 bg-white select-none ${
        isSearchFocused && searchQuery.trim() ? "z-[60]" : "z-30"
      }`}
    >
      

      <div className="flex h-[52px] items-center justify-between px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="hidden text-sm font-medium text-slate-500 sm:block">
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
              className={`flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 border transition ${
                isSearchFocused
                  ? "border-blue-500 bg-white shadow-xs"
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
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-800"
                placeholder="Search transactions, reports, parties"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Results Dropdown */}
            {isSearchFocused && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl z-[100] p-1.5">
                {searchResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {searchResults.map((result, idx) => {
                      const IconComponent = result.icon;
                      const badgeColors = {
                        Page: "bg-blue-100 text-blue-700",
                        Menu: "bg-indigo-100 text-indigo-700",
                        Party: "bg-emerald-100 text-emerald-700",
                        Item: "bg-amber-100 text-amber-800",
                        Sale: "bg-rose-100 text-rose-700",
                        Purchase: "bg-teal-100 text-teal-800",
                        Report: "bg-purple-100 text-purple-700",
                      };
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectResult(result)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600">
                              <IconComponent className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-800 group-hover:text-blue-600">
                                {result.title}
                              </p>
                              <p className="truncate text-[11px] text-slate-400">
                                {result.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                badgeColors[result.type] ||
                                "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {result.type}
                            </span>
                            <FiArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-xs text-slate-500">
                    <p className="font-medium text-slate-600">
                      No matching records found
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      No transactions, parties, items, or reports match "
                      <span className="font-semibold text-slate-600">
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
            className="hidden rounded-full bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-[13px] font-semibold text-white md:block transition cursor-pointer"
          >
            + Add Sale
          </button>
          <button
            type="button"
            onClick={() =>
              openTransaction("/purchase-expense/purchase-bills/new")
            }
            className="hidden rounded-full bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-[13px] font-semibold text-white md:block transition cursor-pointer"
          >
            + Add Purchase
          </button>
          <button
            type="button"
            className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            <FiHelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            <FiBell className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full bg-[#1A1F71] p-2 text-white hover:bg-[#14185D] transition cursor-pointer"
          >
            <FiUser className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
