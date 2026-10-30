// Defines the main layout application layout.
import { cloneElement, useState } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import Sidebar from "../components/Sidebar/Sidebar";
import Topbar from "../components/Topbar/Topbar";

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

  // Fullscreen routes (like POS) take over the entire screen without Sidebar or Topbar
  const isFullscreenRoute = pathname === "/sales/pos";
  const isTransactionRoute = transactionRoutes.includes(pathname);
  const isReportsRoute = pathname.startsWith("/reports");
  const hasExistingBackAction = routesWithExistingBackAction.includes(pathname)
    || pathname.startsWith("/business-growth/marketing-tools/editor/");
  const showBackButton = pathname !== "/" && !hasExistingBackAction
    && Number(window.history.state?.idx) > 0;

  if (isFullscreenRoute) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        {outlet && cloneElement(outlet, { key: refreshKey })}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {!isTransactionRoute && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onRefresh={() => setRefreshKey((key) => key + 1)} />

        {showBackButton && (
          <div className="flex h-10 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Go back to the previous page"
            >
              <FiArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        )}

        <main className={`min-h-0 min-w-0 flex-1 ${isReportsRoute ? "overflow-hidden" : "overflow-y-auto"}`}>
          {outlet && cloneElement(outlet, { key: refreshKey })}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
