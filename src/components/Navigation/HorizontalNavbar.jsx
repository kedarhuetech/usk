import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  sidebarBrand,
  sidebarNavigation,
} from "../Sidebar/SidebarData";

export default function HorizontalNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const navContainerRef = useRef(null);

  // Close dropdown when route/location changes
  useEffect(() => {
    setActiveDropdown(null);
  }, [location.pathname]);

  // Click outside listener: closes dropdown when clicking anywhere outside the navbar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut listener: Ctrl+F and Escape
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setQuery("");
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        setActiveDropdown(null);
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
            }))
      ),
    []
  );

  const filteredItems = searchableItems.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <nav
        ref={navContainerRef}
        aria-label="Main Navigation"
        className="relative z-50 shrink-0 border-b border-[#0f1345] bg-[#1A1F71] text-white shadow-md select-none overflow-visible"
      >
        <div className="flex h-11 items-center justify-between px-4 overflow-visible">
          {/* Left Brand Badge + Navigation Items */}
          <div className="flex items-center gap-1 overflow-visible">
            {/* Brand Logo Pill */}
            <div
              onClick={() => {
                setActiveDropdown(null);
                navigate("/dashboard");
              }}
              className="mr-3 flex cursor-pointer items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold tracking-wide transition hover:bg-white/20 shrink-0"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-[11px] font-black text-[#1A1F71]">
                {sidebarBrand.name[0]}
              </div>
              <span>{sidebarBrand.name}</span>
            </div>

            {/* Nav Items */}
            {sidebarNavigation.map((item) => {
              const Icon = item.icon;
              const hasChildren = Boolean(item.children?.length);
              const isChildActive = hasChildren
                ? item.children.some((child) => location.pathname === child.path)
                : false;
              const isDirectActive = item.path === location.pathname;
              const isActive = isDirectActive || isChildActive;
              const isOpen = activeDropdown === item.id;

              if (!hasChildren) {
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={() => setActiveDropdown(null)}
                    className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-white/20 text-white shadow-xs font-semibold"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              }

              return (
                <div
                  key={item.id}
                  className="relative overflow-visible shrink-0"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDropdown((prev) => (prev === item.id ? null : item.id));
                    }}
                    className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isActive || isOpen
                        ? "bg-white/20 text-white shadow-xs font-semibold"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                    <FiChevronDown
                      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu — stays open until clicked or clicked outside */}
                  {isOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 min-w-[210px] rounded-lg border border-[#2c3396] bg-[#14185D] p-1.5 shadow-2xl z-[9999] overflow-hidden"
                      style={{ filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.5))" }}
                    >
                      {item.children.map((child) => {
                        const isChildLinkActive = location.pathname === child.path;
                        return (
                          <NavLink
                            key={child.id}
                            to={child.path}
                            onClick={() => setActiveDropdown(null)}
                            className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors whitespace-nowrap ${
                              isChildLinkActive
                                ? "bg-rose-600 font-semibold text-white"
                                : "text-white/85 hover:bg-white/15 hover:text-white"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Actions: Quick Open (Ctrl+F) */}
          <div className="flex items-center gap-2 pl-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveDropdown(null);
                setQuery("");
                setSearchOpen(true);
              }}
              className="flex h-7 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 text-[11px] font-medium text-white/80 transition hover:bg-white/20 hover:text-white cursor-pointer"
              title="Open Anything (Ctrl+F)"
            >
              <FiSearch className="h-3 w-3" />
              <span className="hidden sm:inline">Open Anything</span>
              <kbd className="hidden rounded bg-black/25 px-1 py-0.5 text-[10px] text-white/70 md:inline">
                Ctrl+F
              </kbd>
            </button>
          </div>
        </div>
      </nav>

      {/* Global Shortcut Search Modal (Ctrl+F) */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <FiSearch className="h-5 w-5 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menus, features, transactions..."
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No matching screens or actions found.
                </p>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      navigate(item.path);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer"
                  >
                    <span className="font-medium">{item.label}</span>
                    {item.parentLabel && (
                      <span className="text-[10px] text-slate-400">
                        {item.parentLabel}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
