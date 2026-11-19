// Renders the vertical sidebar navigation component.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiX } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import {
  companySwitcher,
  sidebarBrand,
  sidebarNavigation,
  sidebarSearch,
} from "./SidebarData";
import SidebarItem from "./SidebarItem";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
} from "../../services/companyProfileStorage";
import { getAppSettings, APP_SETTINGS_UPDATED_EVENT } from "../../services/appSettingsStorage";
import { getInventoryItems } from "../../services/itemsStorage";

function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [companyProfile, setCompanyProfile] = useState(getCompanyProfile);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const SearchIcon = sidebarSearch.icon;
  const CompanyIcon = companySwitcher.icon;
  const isProfileActive = pathname === "/company-profile" || pathname === "/edit-profile";

  // Counter to force re-reading settings
  const [settingsVersion, setSettingsVersion] = useState(0);
  const settings = useMemo(() => getAppSettings(), [settingsVersion]);

  // Refresh settings when storage or custom event fires
  useEffect(() => {
    const bump = () => setSettingsVersion((v) => v + 1);
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  // Also re-read settings when navigating
  useEffect(() => {
    setSettingsVersion((v) => v + 1);
  }, [pathname]);

  // Filter navigation groups according to settings toggles
  const filteredNavigation = useMemo(() => {
    return sidebarNavigation.map((group) => {
      if (group.id === "sales") {
        return {
          ...group,
          children: (group.children || []).filter((child) => {
            if (child.id === "estimate-quotation" && !settings.enableEstimateQuotation) return false;
            if (child.id === "proforma-invoice" && !settings.enableProformaInvoice) return false;
            if (child.id === "sale-order" && !settings.enableSalePurchaseOrder) return false;
            if (child.id === "delivery-challan" && !settings.enableDeliveryChallan) return false;
            return true;
          }),
        };
      }
      if (group.id === "purchase-expense") {
        return {
          ...group,
          children: (group.children || []).filter((child) => {
            if (child.id === "purchase-order" && !settings.enableSalePurchaseOrder) return false;
            return true;
          }),
        };
      }
      return group;
    });
  }, [settings]);

  // Flattened list of searchable navigation items + inventory items
  const searchableNavItems = useMemo(
    () =>
      filteredNavigation.flatMap((item) =>
        item.path
          ? [{ id: item.id, label: item.label, path: item.path }]
          : (item.children || []).map((child) => ({
              id: child.id,
              label: child.label,
              path: child.path,
              parentLabel: item.label,
            })),
      ),
    [filteredNavigation],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const navMatches = searchableNavItems.filter((item) =>
      item.label.toLowerCase().includes(q)
    );

    let itemMatches = [];
    try {
      const items = getInventoryItems();
      items.forEach((item) => {
        const name = String(item.itemName || item.name || "");
        const code = String(item.itemCode || item.code || "");
        if (name.toLowerCase().includes(q) || code.toLowerCase().includes(q)) {
          itemMatches.push({
            id: `item-${item.id}`,
            label: name,
            parentLabel: code ? `Code: ${code} · Inventory` : "Inventory Item",
            path: "/items",
            state: { itemId: item.id },
          });
        }
      });
    } catch {
      // Ignore storage error
    }

    return [...navMatches, ...itemMatches.slice(0, 10)];
  }, [searchableNavItems, query]);

  // Keyboard shortcut listener: Ctrl+K / Ctrl+F
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "k")) {
        event.preventDefault();
        setQuery("");
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // Keep company profile in sync
  useEffect(() => {
    const refreshCompanyProfile = () => setCompanyProfile(getCompanyProfile());
    window.addEventListener("storage", refreshCompanyProfile);
    window.addEventListener(companyProfileUpdatedEvent, refreshCompanyProfile);
    return () => {
      window.removeEventListener("storage", refreshCompanyProfile);
      window.removeEventListener(companyProfileUpdatedEvent, refreshCompanyProfile);
    };
  }, []);

  const openSearch = () => {
    setQuery("");
    setSearchOpen(true);
  };

  const openSearchResult = (item) => {
    setSearchOpen(false);
    if (item.state) {
      navigate(item.path, { state: item.state });
    } else {
      navigate(item.path);
    }
  };

  const openCompanyProfile = () => {
    navigate("/company-profile");
  };

  return (
    <>
      <aside
        aria-label="Sidebar Navigation"
        className="hidden md:flex h-full w-52 shrink-0 flex-col bg-[#12151B] border-r border-[#222733] text-white select-none z-30 overflow-hidden"
      >
        {/* Top Header: Brand & Search */}
        <div className="shrink-0 p-3 border-b border-[#222733]/70">
          <div
            onClick={() => navigate("/dashboard")}
            className="mb-2.5 flex items-center gap-2.5 px-1 cursor-pointer group"
            title="Go to Dashboard"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF5A1F] text-sm font-black text-white shadow-[0_0_12px_rgba(255,90,31,0.5)] group-hover:scale-105 transition-transform">
              {sidebarBrand.name[0] || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold tracking-wide group-hover:text-[#FF5A1F] transition-colors">
                {sidebarBrand.name}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {companyProfile.businessName || companyProfile.companyName || "Sai Kirana Stores"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openSearch}
            className="flex h-8.5 w-full items-center gap-2 rounded-lg bg-[#1A1E27] border border-[#2B313F] px-2.5 text-left text-xs text-slate-300 hover:border-[#FF5A1F]/50 hover:text-white transition cursor-pointer shadow-xs"
          >
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{sidebarSearch.label}</span>
            <span className="text-[10px] text-slate-400 bg-white/10 px-1.5 py-0.5 rounded font-mono">
              Ctrl+K
            </span>
          </button>
        </div>

        {/* Scrollable Navigation Items */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2.5">
          {filteredNavigation.map((item) => (
            <SidebarItem key={item.id} item={item} />
          ))}
        </nav>

        {/* Bottom Section: Grab Sale Promo & Company Profile */}
        <div className="shrink-0 space-y-2 p-2.5 border-t border-[#222733]/70">
          {/* USK Promo Card */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1E232E] via-[#151820] to-[#0E1015] border border-[#FF5A1F]/30 p-2.5 text-white shadow-md">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                <span className="text-xs text-amber-400">⚡</span> USK Premium
              </span>
              <span className="rounded bg-[#FF5A1F] px-1.5 py-0.5 text-[9px] font-black text-white leading-none">
                PRO
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300 font-medium truncate">
                Upgrade for GST & cloud
              </span>
              <button
                type="button"
                onClick={() => navigate("/plans-pricing")}
                className="rounded-full bg-[#FF5A1F] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#E84E0F] active:scale-95 cursor-pointer shrink-0"
              >
                Upgrade
              </button>
            </div>
          </div>

          {/* Company Profile Shortcut */}
          <button
            type="button"
            onClick={openCompanyProfile}
            title={companyProfile.businessName || companyProfile.companyName || "Company Profile"}
            className={`flex h-9.5 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold transition cursor-pointer ${
              isProfileActive
                ? "bg-[#FF5A1F] text-white shadow-xs"
                : "bg-[#1A1E27] text-slate-200 hover:bg-[#222733] hover:text-white"
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF5A1F] text-white">
              {companyProfile.logo ? (
                <img
                  src={companyProfile.logo}
                  alt="Logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <CompanyIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {companyProfile.businessName || companyProfile.companyName || "Sai Kirana Stores"}
            </span>
            <FiChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Global Search Dialog Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs px-4 pt-[10vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open Anything"
            className="w-full max-w-xl overflow-hidden rounded-xl bg-white dark:bg-[#161922] border border-slate-200 dark:border-[#2B313F] shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-[#252B37] px-4 py-3 bg-slate-50 dark:bg-[#12151B]">
              <SearchIcon className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && filteredItems[0]) {
                    openSearchResult(filteredItems[0]);
                  }
                }}
                placeholder="Search pages or items (e.g. Sales, Parties, Inventory)..."
                aria-label="Search pages"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1A1E27] hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openSearchResult(item)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-[#202532] transition cursor-pointer"
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {item.label}
                    </span>
                    {item.parentLabel && (
                      <span className="text-xs text-slate-400 dark:text-slate-400 font-mono">
                        {item.parentLabel}
                      </span>
                    )}
                  </button>
                ))
              ) : query.trim() ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No matching pages or items found
                </p>
              ) : (
                <p className="px-3 py-6 text-center text-xs text-slate-400">
                  Type to search navigation pages, transactions, or inventory items...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
