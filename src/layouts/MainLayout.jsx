// Defines the main layout application layout.
import { cloneElement, useEffect, useState } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import Sidebar from "../components/Sidebar/Sidebar";
import Topbar from "../components/Topbar/Topbar";
import { autoDispatchDueRemindersViaMeta } from "../services/serviceRemindersService.js";
import { toast } from "../components/Common/Toast.jsx";

const transactionRoutes = ["/sales/sale-invoices/new", "/purchase-expense/purchase-bills/new"];
const routesWithExistingBackAction = [
  "/company-profile",
  "/edit-profile",
  "/sales/pos",
  "/business-growth/online-store",
  "/business-growth/smart-ads",
];

// Renders the main layout interface.
function MainLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [refreshKey, setRefreshKey] = useState(0);

  // Background Auto-Dispatcher for Service Due Date Reminders (Meta WhatsApp)
  useEffect(() => {
    let timer = null;
    let lastToastAt = 0;
    const runAutoDispatch = async () => {
      try {
        const res = await autoDispatchDueRemindersViaMeta();
        const now = Date.now();
        if (res?.dispatched > 0 && now - lastToastAt > 30000) {
          lastToastAt = now;
          toast.success(
            `⚡ Automatically sent ${res.dispatched} due service reminder${res.dispatched > 1 ? "s" : ""} via WhatsApp!`,
            { duration: 5000 }
          );
        }
      } catch {
        // Background task catches silently
      }
    };

    const initialTimer = setTimeout(runAutoDispatch, 3000);
    timer = setInterval(runAutoDispatch, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
    };
  }, []);

  // Fullscreen routes (like POS) take over the entire screen without Sidebar or Topbar
  const isFullscreenRoute = pathname === "/sales/pos";
  const isTransactionRoute = transactionRoutes.includes(pathname);
  const isReportsRoute = pathname.startsWith("/reports");
  const hasExistingBackAction = routesWithExistingBackAction.includes(pathname)
    || pathname.startsWith("/business-growth/marketing-tools/editor/");
  const showBackButton = pathname !== "/" && pathname !== "/dashboard" && !hasExistingBackAction
    && Number(window.history.state?.idx) > 0;

  if (isFullscreenRoute) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#0B0D11] text-slate-100">
        {outlet && cloneElement(outlet, { key: refreshKey })}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0B0D11] dark:text-slate-100 print:h-auto print:overflow-visible print:bg-white">
      {!isTransactionRoute && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden w-full">
        <div className="print:hidden sticky top-0 z-40 shrink-0 w-full">
          <Topbar onRefresh={() => setRefreshKey((key) => key + 1)} />
        </div>

        {showBackButton && (
          <div className="flex h-10 shrink-0 items-center border-b border-slate-200 bg-white text-slate-800 dark:border-[#252B37] dark:bg-[#12151B] dark:text-slate-100 px-4 sm:px-6 print:hidden">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1A1E27] dark:hover:text-[#FF5A1F]"
              aria-label="Go back to the previous page"
            >
              <FiArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        )}

        <main className={`min-h-0 min-w-0 flex-1 ${isReportsRoute ? "overflow-hidden" : "overflow-y-auto"} print:h-auto print:overflow-visible`}>
          {outlet && cloneElement(outlet, { key: refreshKey })}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
