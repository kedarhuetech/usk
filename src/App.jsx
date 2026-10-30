// Connects each application page to its route.
import BusinessGrowthGuard from "./pages/BusinessGrowth/BusinessGrowthGuard";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Settings from "./pages/Settings/Settings";
import { AppPasscodeGuard, AppPasscodeProvider } from "./components/Passcode/AppPasscodeGate";
import ComingSoon from "./pages/ComingSoon";
import Reports from "./pages/Reports/Reports";
import AllTransactionsReport from "./pages/Reports/AllTransactionsReport";
import ProfitAndLossReport from "./pages/Reports/ProfitAndLossReport";
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
import PurchaseBills from "./pages/Purchase/PurchaseBills";
import PaymentOut from "./pages/Purchase/PaymentOut";
import Expenses from "./pages/Purchase/Expenses";
import PurchaseOrders from "./pages/Purchase/PurchaseOrders";
import PurchaseReturns from "./pages/Purchase/PurchaseReturns";
import BankAccounts from "./pages/CashBank/BankAccounts";
import CashInHand from "./pages/CashBank/CashInHand";
import Cheques from "./pages/CashBank/Cheques";
import LoanAccounts from "./pages/CashBank/LoanAccounts";
import AddSale from "./pages/Sales/AddSale";
import SalePreview from "./pages/Sales/SalePreview";
import SaleInvoices from "./pages/Sales/SaleInvoices";
import EstimateQuotation from "./pages/Sales/EstimateQuotation";
import ProformaInvoices from "./pages/Sales/ProformaInvoices";
import PaymentIn from "./pages/Sales/PaymentIn";
import SaleOrders from "./pages/Sales/SaleOrders";
import DeliveryChallans from "./pages/Sales/DeliveryChallans";
import SaleReturns from "./pages/Sales/SaleReturns";
import POS from "./pages/Sales/POS";
import BarcodeGenerator from "./pages/Utilities/BarcodeGenerator";
import ImportItems from "./pages/Utilities/ImportItems";
import ExportItems from "./pages/Utilities/ExportItems";
import ExportToTally from "./pages/Utilities/ExportToTally";
import ImportParties from "./pages/Utilities/ImportParties";
import UpdateItemsInBulk from "./pages/Utilities/UpdateItemsInBulk";
import ImportFromTally from "./pages/Utilities/ImportFromTally";
import VerifyMyData from "./pages/Utilities/VerifyMyData";
import BackupToComputer from "./pages/SyncShareBackup/BackupToComputer";
import BackupToDrive from "./pages/SyncShareBackup/BackupToDrive";
import RestoreBackup from "./pages/SyncShareBackup/RestoreBackup";
import PlansPricing from "./pages/PlansPricing/PlansPricing";
import EditProfile from "./pages/CompanyProfile/EditProfile";
import {
  DataDeletion,
  PrivacyPolicy,
  TermsOfService,
} from "./pages/Legal/LegalPages";

// Renders the app interface.
function App() {
  return (
    <AppPasscodeProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/store/:storeId" element={<CustomerStorefront />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/data-deletion" element={<DataDeletion />} />

        <Route path="/" element={<AppPasscodeGuard><MainLayout /></AppPasscodeGuard>}>
          <Route index element={<Home />} />
          <Route path="company-profile" element={<EditProfile />} />
          <Route path="edit-profile" element={<EditProfile />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cash-bank/bank-accounts" element={<BankAccounts />} />
          <Route path="cash-bank/cash-in-hand" element={<CashInHand />} />
          <Route path="cash-bank/cheques" element={<Cheques />} />
          <Route path="cash-bank/loan-accounts" element={<LoanAccounts />} />
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
          <Route path="sales/estimate-quotation" element={<EstimateQuotation />} />
          <Route path="sales/proforma-invoice" element={<ProformaInvoices />} />
          <Route path="sales/payment-in" element={<PaymentIn />} />
          <Route path="sales/sale-order" element={<SaleOrders />} />
          <Route path="sales/delivery-challan" element={<DeliveryChallans />} />
          <Route path="sales/sale-return-credit-note" element={<SaleReturns />} />
          <Route path="sales/sale-invoices/new" element={<AddSale />} />
          <Route path="sales/sale-invoices/preview" element={<SalePreview />} />
          <Route path="sales/pos" element={<POS />} />
          <Route path="purchase-expense/purchase-bills" element={<PurchaseBills />} />
          <Route
            path="purchase-expense/purchase-bills/new"
            element={<AddPurchase localOnly />}
          />
          <Route path="purchase-expense/payment-out" element={<PaymentOut />} />
          <Route path="purchase-expense/expenses" element={<Expenses />} />
          <Route path="purchase-expense/purchase-order" element={<PurchaseOrders />} />
          <Route
            path="purchase-expense/purchase-return-debit-note"
            element={<PurchaseReturns />}
          />
          <Route
            path="utilities/barcode-generator"
            element={<BarcodeGenerator />}
          />
          <Route path="utilities/import-items" element={<ImportItems />} />
          <Route path="utilities/export-items" element={<ExportItems />} />
          <Route path="utilities/export-to-tally" element={<ExportToTally />} />
          <Route path="utilities/import-parties" element={<ImportParties />} />
          {/* Tally imports live with the other Utilities pages. */}
          <Route path="utilities/import-from-tally" element={<ImportFromTally />} />
          <Route path="utilities/verify-my-data" element={<VerifyMyData />} />
          <Route path="utilities/update-items-in-bulk" element={<UpdateItemsInBulk />} />
          <Route path="plans-pricing" element={<PlansPricing />} />
          <Route path="settings" element={<Settings />} />
          <Route path="sync-share-backup/backup-to-computer" element={<BackupToComputer />} />
          <Route path="sync-share-backup/backup-to-drive" element={<BackupToDrive />} />
          <Route path="sync-share-backup/restore-backup" element={<RestoreBackup />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/all-transactions" element={<Reports defaultReport="All Transactions" />} />
          <Route path="reports/profit-and-loss" element={<Reports defaultReport="Profit And Loss" />} />
          <Route path="reports/cash-flow" element={<Reports defaultReport="Cash flow" />} />
          <Route path="reports/all-parties" element={<Reports defaultReport="All parties" />} />
          <Route path="reports/party-report-by-item" element={<Reports defaultReport="Party Report By Item" />} />
          <Route path="reports/sale-purchase-by-party" element={<Reports defaultReport="Sale Purchase By Party" />} />
          <Route path="reports/sale-purchase-by-party-group" element={<Reports defaultReport="Sale Purchase By Party Group" />} />
          <Route path="reports/stock-summary" element={<Reports defaultReport="Stock summary" />} />
          <Route path="reports/item-report-by-party" element={<Reports defaultReport="Item Report By Party" />} />
          <Route path="reports/item-wise-profit-and-loss" element={<Reports defaultReport="Item Wise Profit And Loss" />} />
            <Route path="reports/low-stock-summary" element={<Reports defaultReport="Low Stock Summary" />} />
            <Route path="reports/stock-detail" element={<Reports defaultReport="Stock Detail" />} />
            <Route path="reports/item-detail" element={<Reports defaultReport="Item Detail" />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </AppPasscodeProvider>
  );
}

export default App;
