import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar/Sidebar";
import Topbar from "../components/Topbar/Topbar";

const transactionRoutes = ["/sales/sale-invoices/new", "/purchase-expense/purchase-bills/new"];

function MainLayout() {
  const { pathname } = useLocation();
  const isTransactionRoute = transactionRoutes.includes(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {!isTransactionRoute && <Sidebar />}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
