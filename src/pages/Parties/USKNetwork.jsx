import { useMemo, useState } from "react";
import { FiChevronDown, FiExternalLink, FiFileText, FiFilter, FiSearch, FiUsers } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Common/Card";
import Button from "../../components/Common/Button";
import { getParties } from "../../services/partiesStorage";
import { getSaleInvoices } from "../../services/salesStorage";
import { getPurchaseBills } from "../../services/purchaseBillsStorage";

const filters = ["All Invoices", "Sent Invoices", "Received Invoices"];

const money = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "—";

function InvoiceEmptyState({ partyName }) {
  return (
    <div className="flex min-h-[480px] items-center justify-center p-6 text-center">
      <div>
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-blue-100 text-blue-500">
          <div className="rounded-2xl bg-blue-400/20 p-4">
            <FiFileText className="h-12 w-12" />
          </div>
        </div>
        <h2 className="mt-6 text-lg font-bold text-slate-800">
          {partyName ? `No Invoices Found for ${partyName}` : "No Party Selected"}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
          {partyName
            ? "You have not recorded any sales or purchases with this party yet."
            : "Select a connected party from the list on the left to view shared invoices."}
        </p>
      </div>
    </div>
  );
}

function NetworkUsersPanel({ parties, selectedParty, onSelectParty, search, onSearchChange }) {
  return (
    <Card className="min-h-[calc(100vh-11rem)] overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 focus-within:border-blue-500">
          <FiSearch className="h-5 w-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search Network Parties..."
          />
        </label>
      </div>

      <div className="grid grid-cols-[1fr_120px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
        <span>Connected Users ({parties.length})</span>
        <span className="text-right">Balance</span>
      </div>

      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
        {parties.length ? (
          parties.map((party) => {
            const isSelected = selectedParty?.id === party.id;
            const balanceNum = Number(party.openingBalance || 0);
            return (
              <button
                key={party.id}
                type="button"
                onClick={() => onSelectParty(party)}
                className={`grid w-full grid-cols-[1fr_120px] items-center border-b border-slate-100 px-4 py-3 text-left transition ${
                  isSelected ? "bg-blue-50/80 font-semibold text-blue-900 border-l-4 border-l-blue-600" : "hover:bg-slate-50"
                }`}
              >
                <div className="truncate">
                  <span className="block truncate text-sm font-medium text-slate-800">{party.name}</span>
                  {party.phone && <span className="block text-xs text-slate-400">{party.phone}</span>}
                </div>
                <span className={`text-right text-xs font-bold ${balanceNum < 0 ? "text-rose-600" : balanceNum > 0 ? "text-emerald-600" : "text-slate-500"}`}>
                  {money(balanceNum)}
                </span>
              </button>
            );
          })
        ) : (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            <FiUsers className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            No parties found.
          </div>
        )}
      </div>
    </Card>
  );
}

function InvoicePanel({ selectedParty, filter, onFilterChange, invoices, onOpenPreview }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="space-y-1">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-800">Filter By :</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="inline-flex h-10 min-w-48 items-center justify-between gap-3 rounded-full bg-blue-50 px-5 text-sm font-semibold text-slate-700 hover:bg-blue-100"
              >
                <span>{filter}</span>
                <FiChevronDown className="h-4 w-4" />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute left-0 top-12 z-40 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {filters.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          onFilterChange(f);
                          setDropdownOpen(false);
                        }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                          filter === f ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          {selectedParty && (
            <div className="text-xs text-slate-500">
              Showing <span className="font-bold text-slate-800">{invoices.length}</span> shared transactions with <span className="font-bold text-blue-700">{selectedParty.name}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="min-h-[calc(100vh-16rem)] overflow-hidden">
        {!selectedParty || !invoices.length ? (
          <InvoiceEmptyState partyName={selectedParty?.name} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Document No.</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 text-slate-500">{formatDate(inv.date)}</td>
                    <td className="p-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        inv.type === "Sent" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
                      }`}>
                        {inv.type === "Sent" ? "Sent (Sale)" : "Received (Purchase)"}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{inv.number}</td>
                    <td className="p-3.5 text-right font-bold text-slate-900">{money(inv.amount)}</td>
                    <td className="p-3.5">
                      <span className={`text-xs font-semibold ${
                        inv.status === "Paid" ? "text-emerald-600" : inv.status === "Unpaid" ? "text-rose-600" : "text-amber-600"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenPreview(inv)}
                        title="View Document"
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                      >
                        <FiExternalLink className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function USKNetwork() {
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState("users");
  const [search, setSearch] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [filter, setFilter] = useState("All Invoices");

  const rawParties = useMemo(() => getParties(), []);
  const allSales = useMemo(() => getSaleInvoices(), []);
  const allPurchases = useMemo(() => getPurchaseBills(), []);

  const parties = useMemo(() => {
    return rawParties
      .map((p) => ({
        id: p.id,
        name: p.partyName || p.name || "Unknown Party",
        phone: p.phone || "",
        openingBalance: p.openingBalance || 0,
      }))
      .filter((p) => {
        const query = search.trim().toLowerCase();
        return !query || p.name.toLowerCase().includes(query) || p.phone.includes(query);
      });
  }, [rawParties, search]);

  const selectedParty = useMemo(() => {
    if (!selectedPartyId && parties.length > 0) return parties[0];
    return parties.find((p) => p.id === selectedPartyId) || parties[0] || null;
  }, [parties, selectedPartyId]);

  const sharedInvoices = useMemo(() => {
    if (!selectedParty) return [];
    const pName = selectedParty.name.trim().toLowerCase();
    const pId = String(selectedParty.id).trim();

    const sent = allSales
      .filter((inv) => {
        const invParty = String(inv.partyName || inv.customer || inv.form?.customer || "").trim().toLowerCase();
        const invPartyId = String(inv.partyId || inv.form?.partyId || "").trim();
        return (pName && invParty === pName) || (pId && invPartyId === pId);
      })
      .map((inv) => ({
        id: inv.id,
        type: "Sent",
        date: inv.invoiceDate || inv.date || inv.createdAt,
        number: inv.invoiceNumber || inv.form?.invoiceNumber || inv.number || "INV-—",
        amount: Number(inv.totals?.finalTotal ?? inv.totalAmount ?? inv.total ?? 0),
        status: inv.status || (Number(inv.totals?.balance ?? inv.balanceAmount ?? 0) <= 0.01 ? "Paid" : "Unpaid"),
        source: inv,
      }));

    const received = allPurchases
      .filter((bill) => {
        const billParty = String(bill.partyName || bill.supplier || bill.form?.supplier || "").trim().toLowerCase();
        const billPartyId = String(bill.partyId || bill.form?.partyId || "").trim();
        return (pName && billParty === pName) || (pId && billPartyId === pId);
      })
      .map((bill) => ({
        id: bill.id,
        type: "Received",
        date: bill.billDate || bill.date || bill.createdAt,
        number: bill.billNumber || bill.invoiceNumber || bill.form?.billNumber || bill.number || "BILL-—",
        amount: Number(bill.totals?.finalTotal ?? bill.totalAmount ?? bill.total ?? 0),
        status: bill.status || (Number(bill.totals?.balance ?? bill.balanceAmount ?? 0) <= 0.01 ? "Paid" : "Unpaid"),
        source: bill,
      }));

    const combined = filter === "Sent Invoices"
      ? sent
      : filter === "Received Invoices"
      ? received
      : [...sent, ...received];

    return combined.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [selectedParty, allSales, allPurchases, filter]);

  const handleOpenPreview = (inv) => {
    if (inv.type === "Sent") {
      navigate("/sales/sale-invoices/preview", { state: { invoice: inv.source } });
    } else {
      navigate("/purchase-expense/purchase-bills");
    }
  };

  return (
    <div className="bg-slate-200 p-1">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3 bg-white px-4 sm:px-6 py-4 sm:py-5">
        <h1 className="text-lg sm:text-xl font-bold text-slate-800">Your Business Network</h1>
        {selectedParty && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Active Connection:</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              ● {selectedParty.name}
            </span>
          </div>
        )}
      </div>

      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden border-b border-slate-200 bg-white p-1.5 gap-1.5 shrink-0 z-10 shadow-xs mb-1">
        <button
          type="button"
          onClick={() => setMobileTab("users")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
            mobileTab === "users" ? "bg-[#14171E] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Connected Parties ({parties.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("invoices")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
            mobileTab === "invoices" ? "bg-[#FF5A1F] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Shared Invoices ({sharedInvoices.length})
        </button>
      </div>

      <div className="grid gap-1 lg:grid-cols-[380px_1fr]">
        <div className={mobileTab === "invoices" ? "hidden lg:block" : "block"}>
          <NetworkUsersPanel
            parties={parties}
            selectedParty={selectedParty}
            onSelectParty={(p) => {
              setSelectedPartyId(p.id);
              setMobileTab("invoices");
            }}
            search={search}
            onSearchChange={setSearch}
          />
        </div>
        <div className={mobileTab === "users" ? "hidden lg:block" : "block"}>
          <InvoicePanel
            selectedParty={selectedParty}
            filter={filter}
            onFilterChange={setFilter}
            invoices={sharedInvoices}
            onOpenPreview={handleOpenPreview}
          />
        </div>
      </div>
    </div>
  );
}

export default USKNetwork;
