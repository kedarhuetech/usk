// Defines the main layout application layout.
import { cloneElement, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import Sidebar from "../components/Sidebar/Sidebar";
import Topbar from "../components/Topbar/Topbar";

const transactionRoutes = ["/sales/sale-invoices/new", "/purchase-expense/purchase-bills/new"];

// Renders the main layout interface.
function MainLayout() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const [refreshKey, setRefreshKey] = useState(0);

  // Fullscreen routes (like POS) take over the entire screen without Sidebar or Topbar
  const isFullscreenRoute = pathname === "/sales/pos";
  const isTransactionRoute = transactionRoutes.includes(pathname);
  const isReportsRoute = pathname.startsWith("/reports");

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

        <main className={`min-h-0 min-w-0 flex-1 ${isReportsRoute ? "overflow-hidden" : "overflow-y-auto"}`}>
          {outlet && cloneElement(outlet, { key: refreshKey })}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
