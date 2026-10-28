// Renders the topbar interface component.
import { FiBell, FiHelpCircle, FiRefreshCw, FiSearch, FiUser } from "react-icons/fi";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  companyProfileUpdatedEvent,
  getCompanyProfile,
} from "../../services/companyProfileStorage";

const navItems = ["Company", "Help"];
const transactionRoutes = ["/sales/sale-invoices/new", "/purchase-expense/purchase-bills/new"];

// Renders the topbar interface.
export default function Topbar({ onRefresh }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [companyProfile, setCompanyProfile] = useState(getCompanyProfile);
  const [comingSoon, setComingSoon] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef(null);
  // Opens transaction.
  const openTransaction = (path) => {
    const state = transactionRoutes.includes(pathname) ? undefined : { from: pathname };
    navigate(path, state ? { state } : undefined);
  };

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

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  const refreshCurrentPage = () => {
    onRefresh?.();
    setRefreshing(true);
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    <header className="shrink-0 border-b border-slate-200 bg-white">
      <div className="flex h-9 items-center justify-between border-b border-slate-100 px-4 text-[13px]">
        <div className="relative flex items-center gap-4 text-slate-700">
          {navItems.map((item) => (
            <button key={item} type="button" onClick={() => setComingSoon(item)} className="hover:text-[#1A1F71]">
              {item}
            </button>
          ))}
          <button type="button" onClick={refreshCurrentPage} aria-label="Refresh current page data" title="Refresh current page data" className="flex items-center justify-center border-0 bg-transparent p-0">
            <FiRefreshCw className={`h-4 w-4 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {comingSoon && <div role="status" aria-live="polite" className="absolute left-0 top-full z-20 mt-1 flex items-center gap-3 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">{comingSoon} is coming soon.<button type="button" onClick={() => setComingSoon("")} aria-label="Dismiss notice" className="font-bold text-slate-500 hover:text-slate-900">×</button></div>}
        </div>
        <div className="hidden items-center gap-2.5 text-xs text-slate-600 xl:flex">
          <span>Customer Support</span>
          <span className="font-medium text-blue-600">+91 93339 11911</span>
          <span className="text-slate-300">|</span>
          <button type="button" className="font-medium text-blue-600">
            Get Instant Online Support
          </button>
        </div>
      </div>

      <div className="flex h-[52px] items-center justify-between px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="hidden text-sm font-medium text-slate-500 sm:block">
            {companyProfile.companyName}
          </span>
          <div className="ml-3 hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 lg:flex">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Search transactions, reports, parties"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => openTransaction("/sales/sale-invoices/new")} className="hidden rounded-full bg-rose-600 px-3.5 py-2 text-[13px] font-semibold text-white md:block">
            + Add Sale
          </button>
          <button type="button" onClick={() => openTransaction("/purchase-expense/purchase-bills/new")} className="hidden rounded-full bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white md:block">
            + Add Purchase
          </button>
          <button type="button" className="rounded-full bg-slate-100 p-2 text-slate-600">
            <FiHelpCircle className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-full bg-slate-100 p-2 text-slate-600">
            <FiBell className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-full bg-[#1A1F71] p-2 text-white">
            <FiUser className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
