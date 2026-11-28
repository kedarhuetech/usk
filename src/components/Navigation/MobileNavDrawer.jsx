import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiChevronDown,
  FiPlus,
  FiSearch,
  FiUser,
  FiX,
  FiArrowRight,
} from "react-icons/fi";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  sidebarBrand,
  sidebarNavigation,
} from "../Sidebar/SidebarData";
import {
  getAppSettings,
  APP_SETTINGS_UPDATED_EVENT,
} from "../../services/appSettingsStorage";

export default function MobileNavDrawer({
  isOpen,
  onClose,
  companyProfile,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({
    sales: true,
    "purchase-expense": false,
    "cash-bank": false,
    utilities: false,
    "business-growth": false,
    settings: false,
  });

  // Settings reactivity
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

  // Filter navigation items based on settings
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

  // Flattened searchable navigation list
  const searchableItems = useMemo(() => {
    const list = [];
    filteredNavigation.forEach((group) => {
      if (group.children?.length) {
        group.children.forEach((child) => {
          list.push({
            id: child.id,
            label: child.label,
            path: child.path,
            parentLabel: group.label,
            icon: group.icon,
          });
        });
      } else {
        list.push({
          id: group.id,
          label: group.label,
          path: group.path,
          parentLabel: null,
          icon: group.icon,
        });
      }
    });
    return list;
  }, [filteredNavigation]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return searchableItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.parentLabel && item.parentLabel.toLowerCase().includes(q))
    );
  }, [searchQuery, searchableItems]);

  // Close drawer on route change
  useEffect(() => {
    onClose();
    setSearchQuery("");
  }, [location.pathname]);

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background body scrolling when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-[990] bg-black/60 backdrop-blur-xs transition-opacity duration-300 lg:hidden opacity-100 pointer-events-auto"
      />

      {/* Drawer Panel */}
      <aside
        role="dialog"
        aria-label="Mobile Navigation Menu"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-[1000] flex w-[86%] max-w-[340px] flex-col border-r border-[#252B37] bg-[#12151B] text-slate-100 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden select-none translate-x-0"
      >
        {/* Header */}
        <div className="flex h-[60px] items-center justify-between border-b border-[#252B37] px-4 py-3">
          <div
            onClick={() => handleNavigate("/company-profile")}
            className="flex items-center gap-2.5 cursor-pointer min-w-0"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF5A1F] text-xs font-black text-white shadow-[0_0_12px_rgba(255,90,31,0.5)]">
              {sidebarBrand.name}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white leading-tight">
                {companyProfile?.businessName ||
                  companyProfile?.companyName ||
                  sidebarBrand.companyName}
              </h2>
              <p className="text-[10px] text-slate-400">Vyapaar Cloud ERP</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-slate-400 hover:bg-[#1A1E27] hover:text-white transition cursor-pointer"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Transaction Action Buttons */}
        <div className="border-b border-[#252B37] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleNavigate("/sales/sale-invoices/new")}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2.5 px-3 text-xs font-semibold text-white shadow-xs transition cursor-pointer"
            >
              <FiPlus className="h-3.5 w-3.5" />
              <span>Add Sale</span>
            </button>
            <button
              type="button"
              onClick={() => handleNavigate("/purchase-expense/purchase-bills/new")}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1A1E27] hover:bg-[#202530] border border-[#2B313F] hover:border-blue-500/50 py-2.5 px-3 text-xs font-semibold text-white transition cursor-pointer"
            >
              <FiPlus className="h-3.5 w-3.5" />
              <span>Add Purchase</span>
            </button>
          </div>

          {/* Quick Search in Drawer */}
          <div className="relative mt-2">
            <div className="flex h-9 items-center gap-2 rounded-lg bg-[#1A1E27] px-3 border border-[#2B313F] text-slate-300">
              <FiSearch className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search menus or pages..."
                className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          {searchQuery.trim() ? (
            /* Search Results in Drawer */
            <div className="space-y-1">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Matching Screens ({searchResults.length})
              </p>
              {searchResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">
                  No matching menus found for "{searchQuery}"
                </p>
              ) : (
                searchResults.map((item) => {
                  const Icon = item.icon || FiArrowRight;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-[#1A1E27] hover:text-[#FF5A1F] transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.label}</p>
                          {item.parentLabel && (
                            <p className="truncate text-[10px] text-slate-400">
                              {item.parentLabel}
                            </p>
                          )}
                        </div>
                      </div>
                      <FiArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            /* Standard Grouped Navigation */
            filteredNavigation.map((group) => {
              const Icon = group.icon;
              const hasChildren = Boolean(group.children?.length);
              const isChildActive = hasChildren
                ? group.children.some(
                    (child) =>
                      location.pathname === child.path ||
                      `${location.pathname}${location.search}` === child.path
                  )
                : false;
              const isDirectActive = location.pathname === group.path;
              const isActive = isDirectActive || isChildActive;
              const isExpanded = expandedGroups[group.id] ?? false;

              if (!hasChildren) {
                return (
                  <NavLink
                    key={group.id}
                    to={group.path}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition cursor-pointer ${
                      isActive
                        ? "bg-[#FF5A1F]/20 text-[#FF5A1F] font-bold border border-[#FF5A1F]/40 shadow-xs"
                        : "text-slate-300 hover:bg-[#1A1E27] hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{group.label}</span>
                  </NavLink>
                );
              }

              return (
                <div key={group.id} className="rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition cursor-pointer ${
                      isActive
                        ? "bg-[#1A1E27] text-white font-semibold"
                        : "text-slate-300 hover:bg-[#1A1E27] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>{group.label}</span>
                    </div>
                    <FiChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-180 text-[#FF5A1F]" : ""
                      }`}
                    />
                  </button>

                  {/* Accordion Children */}
                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l border-[#2B313F] my-1 space-y-0.5">
                      {group.children.map((child) => {
                        const isChildLinkActive =
                          location.pathname === child.path ||
                          `${location.pathname}${location.search}` === child.path;
                        return (
                          <NavLink
                            key={child.id}
                            to={child.path}
                            onClick={onClose}
                            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition cursor-pointer ${
                              isChildLinkActive
                                ? "bg-[#FF5A1F] text-white font-semibold shadow-xs"
                                : "text-slate-400 hover:bg-[#1A1E27] hover:text-slate-100"
                            }`}
                          >
                            <span className="h-1 w-1 rounded-full bg-current opacity-70" />
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Profile */}
        <div className="border-t border-[#252B37] p-3 bg-[#0E1116]">
          <button
            type="button"
            onClick={() => handleNavigate("/company-profile")}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1A1E27] border border-[#2B313F] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <FiUser className="h-4 w-4 text-[#FF5A1F]" />
            <span>Profile</span>
          </button>
        </div>
      </aside>
    </>
  );
}
