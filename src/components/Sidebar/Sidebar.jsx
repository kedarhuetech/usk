// Renders the sidebar interface component.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiEdit3, FiZap, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
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
  const [companyProfile, setCompanyProfile] = useState(getCompanyProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [companyName, setCompanyName] = useState(companyProfile.companyName);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const SearchIcon = sidebarSearch.icon;
  const CompanyIcon = companySwitcher.icon;

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
    // Refreshes profile from event.
    const refreshProfileFromEvent = () => {
      const profile = getCompanyProfile();
      setCompanyProfile(profile);
      setCompanyName(profile.companyName);
    };
    window.addEventListener("storage", refreshCompanyProfile);
    window.addEventListener(companyProfileUpdatedEvent, refreshProfileFromEvent);
    return () => {
      window.removeEventListener("storage", refreshCompanyProfile);
      window.removeEventListener(companyProfileUpdatedEvent, refreshProfileFromEvent);
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
    setCompanyName(companyProfile.companyName);
    setProfileOpen(true);
  };

  // Saves company name.
  const saveCompanyName = (event) => {
    event.preventDefault();
    const nextName = companyName.trim();
    if (!nextName) return;
    const profile = saveCompanyProfile({ companyName: nextName });
    setCompanyProfile(profile);
    setProfileOpen(false);
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
            <p className="truncate text-xs text-white/60">{companyProfile.companyName}</p>
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
        <div className="rounded-lg bg-amber-50 p-2.5 text-[#14185D]">
          <p className="text-[13px] font-semibold">{sidebarTrial.title}</p>
          <div className="mt-2 h-1.5 rounded-full bg-white">
            <div className="h-full w-5/12 rounded-full bg-amber-500" />
          </div>
          <button
            type="button"
            onClick={() => navigate("/plans-pricing")}
            className="mt-2 flex w-full items-center justify-between rounded-md bg-[#1A1F71] px-2.5 py-2 text-[13px] font-semibold text-white"
          >
            <span className="flex items-center gap-2">
              <FiZap className="h-4 w-4 text-amber-300" />
              {sidebarTrial.ctaLabel}
            </span>
            <FiChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={openCompanyProfile}
          className="flex h-10 w-full items-center gap-2.5 rounded-lg bg-white/10 px-2.5 text-left text-[13px] font-semibold hover:bg-white/15"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1A1F71]">
            <CompanyIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate">{companyProfile.companyName}</span>
          <FiChevronRight className="h-4 w-4 text-white/60" />
        </button>
      </div>
      </aside>

      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileOpen(false);
          }}
        >
          <form
            onSubmit={saveCompanyName}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-800">Company Profile</h2>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                aria-label="Close company profile"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="company-name">
              Company name
            </label>
            <input
              id="company-name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              autoFocus
              maxLength={120}
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-[#343B9A] focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-2 text-xs text-slate-500">
              Saved in this browser for now. This storage boundary can be connected to the database later.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!companyName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1A1F71] px-4 py-2 text-sm font-semibold text-white hover:bg-[#14185D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiEdit3 className="h-4 w-4" />
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

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