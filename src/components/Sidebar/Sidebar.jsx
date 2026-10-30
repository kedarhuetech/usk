// Renders the sidebar interface component.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiEdit3, FiZap, FiX } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import {
  companySwitcher,
  sidebarBrand,
  sidebarNavigation,
  sidebarSearch,
  sidebarTrial,
} from "./SidebarData";
import SidebarItem from "./SidebarItem";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
  saveCompanyProfile,
} from "../../services/companyProfileStorage";

// Renders the sidebar interface.
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

  const searchableItems = useMemo(
    () =>
      sidebarNavigation.flatMap((item) =>
        item.path
          ? [{ id: item.id, label: item.label, path: item.path }]
          : (item.children || []).map((child) => ({
              id: child.id,
              label: child.label,
              path: child.path,
              parentLabel: item.label,
            })),
      ),
    [],
  );
  const filteredItems = searchableItems.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    // Handles shortcut.
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setQuery("");
        setSearchOpen(true);
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

  useEffect(() => {
    // Refreshes company profile.
    const refreshCompanyProfile = () => setCompanyProfile(getCompanyProfile());
    window.addEventListener("storage", refreshCompanyProfile);
    window.addEventListener(companyProfileUpdatedEvent, refreshCompanyProfile);
    return () => {
      window.removeEventListener("storage", refreshCompanyProfile);
      window.removeEventListener(companyProfileUpdatedEvent, refreshCompanyProfile);
    };
  }, []);

  // Opens search.
  const openSearch = () => {
    setQuery("");
    setSearchOpen(true);
  };

  // Opens search result.
  const openSearchResult = (path) => {
    setSearchOpen(false);
    navigate(path);
  };

  // Opens company profile.
  const openCompanyProfile = () => {
    navigate("/company-profile");
  };

  return (
    <>
      <aside className="hidden h-screen w-52 shrink-0 flex-col bg-gradient-to-b from-[#1A1F71] to-[#14185D] text-white xl:w-56 lg:flex">
      <div className="shrink-0 px-3 py-3">
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-[#1A1F71]">
            L
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{sidebarBrand.name}</p>
            <p className="truncate text-xs text-white/60">
              {companyProfile.businessName || companyProfile.companyName}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-2.5 text-left text-[13px] text-white/80 hover:bg-white/15"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{sidebarSearch.label}</span>
          <span className="text-[11px] text-white/45">{sidebarSearch.shortcut}</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
        {sidebarNavigation.map((item) => (
          <SidebarItem key={item.id} item={item} />
        ))}
      </nav>

      <div className="shrink-0 space-y-2.5 p-2.5">
        {/* Grab Sale Banner matching screenshot */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#e00826] via-[#be051c] to-[#7f0010] p-3 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-bold text-white">
              <span className="text-xs text-amber-300">⚡</span> Vyapar
            </span>
            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-rose-950 leading-none">
              Upto 60% OFF
            </span>
          </div>

          <p className="mt-1 text-sm font-black italic tracking-wide text-white drop-shadow-sm">
            GRAB SALE
          </p>

          <div className="mt-2 flex items-end justify-between gap-1">
            <div className="space-y-0.5 text-[10px] text-white/90">
              <div className="flex items-center gap-1 font-medium">
                <span>📅</span>
                <span>29 Oct 2026</span>
              </div>
              <div className="flex items-center gap-1 font-medium">
                <span>⏰</span>
                <span>12:00 AM - 11:59 PM</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/plans-pricing")}
              className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-900 shadow-sm transition hover:bg-amber-300 active:scale-95"
            >
              Buy Now
            </button>
          </div>
        </div>

        {/* Company Switcher / Profile Button */}
        <button
          type="button"
          onClick={openCompanyProfile}
          className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-semibold transition ${
            isProfileActive
              ? "bg-[#1d4ed8] text-white shadow-sm ring-1 ring-white/20"
              : "bg-white/10 text-white hover:bg-white/15"
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[#1A1F71]">
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
          <FiChevronRight className="h-4 w-4 text-white/70" />
        </button>
      </div>
      </aside>

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open Anything"
            className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <SearchIcon className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && filteredItems[0]) {
                    openSearchResult(filteredItems[0].path);
                  }
                }}
                placeholder="Search pages"
                aria-label="Search pages"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
                    onClick={() => openSearchResult(item.path)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-100"
                  >
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    {item.parentLabel && (
                      <span className="text-xs text-slate-400">{item.parentLabel}</span>
                    )}
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No pages found
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