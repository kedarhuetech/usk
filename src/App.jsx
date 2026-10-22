import BusinessGrowthGuard from "./pages/BusinessGrowth/BusinessGrowthGuard";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ComingSoon from "./pages/ComingSoon";
import Dashboard from "./pages/Dashboard/Dashboard";
import GoogleProfileManager from "./pages/BusinessGrowth/GoogleProfileManager";
import MarketingStudioEditor from "./pages/BusinessGrowth/MarketingStudioEditor";
import MarketingStudioHome from "./pages/BusinessGrowth/MarketingStudioHome";
import CustomerStorefront from "./pages/BusinessGrowth/OnlineStore/CustomerStorefront";
import OnlineStore from "./pages/BusinessGrowth/OnlineStore/OnlineStore";
import SmartAds from "./pages/BusinessGrowth/SmartAds/SmartAds";
import WhatsAppMarketing from "./pages/BusinessGrowth/WhatsAppMarketing";
import Home from "./pages/Home/Home";
import ItemsDashboard from "./pages/Items/ItemsDashboard";
import VyaparNetwork from "./pages/Parties/VyaparNetwork";
import PartyDetails from "./pages/Parties/PartyDetails";
import WhatsAppConnect from "./pages/Parties/WhatsAppConnect";
import AddPurchase from "./pages/Purchase/AddPurchase";
import AddSale from "./pages/Sales/AddSale";
import SalePreview from "./pages/Sales/SalePreview";
import SaleInvoices from "./pages/Sales/SaleInvoices";
import BarcodeGenerator from "./pages/Utilities/BarcodeGenerator";
import PlansPricing from "./pages/PlansPricing/PlansPricing";
import {
  DataDeletion,
  PrivacyPolicy,
  TermsOfService,
} from "./pages/Legal/LegalPages";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/store/:storeId" element={<CustomerStorefront />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/data-deletion" element={<DataDeletion />} />

        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="items" element={<ItemsDashboard />} />
          <Route path="parties/party-details" element={<PartyDetails />} />
          <Route
            path="parties/whatsapp-connect"
            element={<WhatsAppConnect />}
          />
          <Route path="parties/business-network" element={<VyaparNetwork />} />

          {/* Protected Business Growth Section */}
          <Route element={<BusinessGrowthGuard />}>
            <Route
              path="business-growth/google-profile-manager"
              element={<GoogleProfileManager />}
            />
            <Route
              path="business-growth/marketing-tools"
              element={<MarketingStudioHome />}
            />
            <Route
              path="business-growth/marketing-tools/editor/:templateId"
              element={<MarketingStudioEditor />}
            />
            <Route
              path="business-growth/whatsapp-marketing"
              element={<WhatsAppMarketing />}
            />
            <Route
              path="business-growth/online-store"
              element={<OnlineStore />}
            />
            <Route path="business-growth/smart-ads" element={<SmartAds />} />
          </Route>

          <Route path="sales/sale-invoices" element={<SaleInvoices />} />
          <Route path="sales/sale-invoices/new" element={<AddSale />} />
          <Route path="sales/sale-invoices/preview" element={<SalePreview />} />
          <Route
            path="purchase-expense/purchase-bills"
            element={<AddPurchase />}
          />
          <Route
            path="purchase-expense/purchase-bills/new"
            element={<AddPurchase />}
          />
          <Route
            path="utilities/barcode-generator"
            element={<BarcodeGenerator />}
          />
          <Route path="plans-pricing" element={<PlansPricing />} />
          <Route path="reports" element={<ComingSoon />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
