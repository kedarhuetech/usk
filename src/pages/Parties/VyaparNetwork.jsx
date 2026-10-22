import { FiChevronDown, FiFileText, FiSearch } from "react-icons/fi";
import Card from "../../components/Common/Card";

const connectedUsers = [];
const filters = ["All Invoices", "Sent Invoices", "Received Invoices"];

function InvoiceEmptyState() {
  return (
    <div className="flex min-h-[520px] items-center justify-center p-6 text-center">
      <div>
        <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-blue-100 text-blue-500">
          <div className="rounded-2xl bg-blue-400/20 p-5">
            <FiFileText className="h-14 w-14" />
          </div>
        </div>
        <h2 className="mt-7 text-lg font-bold text-slate-800">No Invoice Shared</h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
          You have not sent or received any invoice with this party yet.
        </p>
      </div>
    </div>
  );
}

function NetworkUsersPanel({ users }) {
  return (
    <Card className="min-h-[calc(100vh-11rem)] overflow-hidden">
      <div className="border-b border-slate-100 p-4">
        <label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 focus-within:border-blue-500">
          <FiSearch className="h-5 w-5 text-slate-400" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search Network"
          />
        </label>
      </div>

      <div className="grid grid-cols-[1fr_120px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
        <span>Connected Users</span>
        <span className="text-right">Balance</span>
      </div>

      <div>
        {users.length ? (
          users.map((user) => (
            <button
              key={user.id}
              type="button"
              className="grid w-full grid-cols-[1fr_120px] items-center border-b border-slate-100 px-4 py-3 text-left hover:bg-blue-50"
            >
              <span className="truncate text-sm font-medium text-slate-700">{user.name}</span>
              <span className="text-right text-sm font-semibold text-slate-800">{user.balance}</span>
            </button>
          ))
        ) : (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No connected users yet.</div>
        )}
      </div>
    </Card>
  );
}

function InvoicePanel() {
  return (
    <div className="space-y-1">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-800">Filter By :</span>
          <button
            type="button"
            className="inline-flex h-10 min-w-48 items-center justify-between gap-3 rounded-full bg-blue-50 px-5 text-sm font-semibold text-slate-600 hover:bg-blue-100"
          >
            {filters[0]}
            <FiChevronDown className="h-4 w-4" />
          </button>
        </div>
      </Card>

      <Card className="min-h-[calc(100vh-16rem)]">
        <InvoiceEmptyState />
      </Card>
    </div>
  );
}

function VyaparNetwork() {
  return (
    <div className="bg-slate-200 p-1">
      <div className="mb-1 bg-white px-6 py-5">
        <h1 className="text-xl font-bold text-slate-800">Your Ledgerly Network</h1>
      </div>

      <div className="grid gap-1 lg:grid-cols-[450px_1fr]">
        <NetworkUsersPanel users={connectedUsers} />
        <InvoicePanel />
      </div>
    </div>
  );
}

export default VyaparNetwork;
