import React from "react";
import { FiFileText } from "react-icons/fi";
import {
  FiCalendar,
  FiChevronDown,
  FiChevronRight,
  FiPlus,

  FiSearch,
  FiSettings,
  FiX,
} from "react-icons/fi";

const shortcuts = [
  "Change Quantity [F2]",
  "Item Discount [F3]",
  "Remove Item [F4]",
  "Change Unit [F6]",
  "Additional Charges [F8]",
  "Bill Discount [F9]",
  "Loyalty Points [F10]",
  "Remarks [F12]",
];

function ActionButton({ children, primary = false }) {
  return (
    <button
      type="button"
      className={`min-h-[54px] rounded-md border px-3 py-2 text-center text-sm font-semibold sm:text-base ${
        primary
          ? "border-emerald-500 bg-emerald-200 text-slate-700"
          : "border-blue-300 bg-blue-100 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function PointOfSale() {
  return (
    <main className="flex h-screen min-h-[600px] flex-col overflow-hidden bg-[#e8edf5] text-[#41485d]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 text-sm">
        <div className="flex items-center gap-5 text-slate-700">
          <span className="font-semibold">Company</span>
          <span>Help</span>
          <span>Versions</span>
          <span className="hidden sm:inline">Shortcuts</span>
          <span className="text-lg">⟳</span>
        </div>
        <div className="hidden items-center gap-2 text-xs md:flex">
          <span>Customer Support:</span>
          <a className="text-blue-600 underline" href="tel:+919333911911">
            +91-9333911911
          </a>
          <a className="text-blue-600 underline" href="#support">
            Get Instant Online Support
          </a>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <FiSettings size={19} />
          <span className="text-xl">−</span>
          <FiX size={20} />
        </div>
      </header>

      <nav className="flex h-[48px] shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <div className="flex h-full items-center gap-4 rounded-t-md bg-[#f8f9fc] px-4">
          <span className="font-semibold">#8</span>
          <span className="text-xs text-slate-400">Ctrl+W</span>
          <FiX className="text-slate-500" />
        </div>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 font-semibold text-slate-500 shadow-sm"
        >
          <FiPlus className="text-blue-600" /> New Bill [Ctrl+T]
        </button>
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 p-1.5 lg:grid-cols-[minmax(0,1.82fr)_minmax(380px,1fr)]">
        <section className="flex min-h-0 flex-col gap-1.5">
          <label className="flex h-[58px] shrink-0 items-center gap-3 rounded-md border-2 border-blue-500 bg-white px-3">
            <input
              aria-label="Search items"
              readOnly
              placeholder="Search by item name, item code, hsn code, mrp, sale price, purchase price... [F1]"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-lg"
            />
            <FiSearch size={24} className="shrink-0 text-blue-500" />
          </label>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-300 bg-white">
            <table className="h-full min-w-[920px] w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 bg-[#f3f4f6] text-left font-semibold text-slate-500">
                <tr className="h-[78px]">
                  <th className="w-[6%] border border-slate-200 px-3">#</th>
                  <th className="w-[15%] border border-slate-200 px-3">ITEM CODE</th>
                  <th className="w-[28%] border border-slate-200 px-3">ITEM NAME</th>
                  <th className="w-[8%] border border-slate-200 px-3">QTY</th>
                  <th className="w-[8%] border border-slate-200 px-3">UNIT</th>
                  <th className="w-[13%] border border-slate-200 px-2 text-center">
                    PRICE/UNIT(₹)
                    <div className="font-normal">Without Tax</div>
                  </th>
                  <th className="w-[10%] border border-slate-200 px-2">
                    DISCOUNT (₹)
                  </th>
                  <th className="w-[12%] border border-slate-200 px-2">
                    TAX APPLIED(₹)
                  </th>
                  <th className="w-[9%] border border-slate-200 px-2">SIZE</th>
                </tr>
              </thead>
              <tbody>
                <tr className="h-[56px] bg-[#e3f1ff]">
                  <td className="border border-slate-200 px-3">1</td>
                  <td className="border border-slate-200 px-3">a102</td>
                  <td className="border border-slate-200 px-3">Item 2</td>
                  <td className="border border-slate-200 px-3">1.00</td>
                  <td className="border border-slate-200 px-3">-</td>
                  <td className="border border-slate-200 px-3">30.00</td>
                  <td className="border border-slate-200 px-3">0.00</td>
                  <td className="border border-slate-200 px-3">0.00</td>
                  <td className="border border-slate-200 px-3">-</td>
                </tr>
                <tr className="h-full">
                  <td colSpan={9} className="border-x border-slate-200" />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-4">
            {shortcuts.map((label) => (
              <ActionButton key={label}>{label}</ActionButton>
            ))}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-1.5">
          <div className="shrink-0 rounded-md border border-slate-200 bg-white p-3">
            <div className="flex h-[52px] items-center justify-between rounded-xl border border-slate-300 px-4">
              <span>29/10/2026</span>
              <FiCalendar className="text-blue-500" size={19} />
            </div>
            <div className="mt-3 flex h-[56px] items-center justify-between rounded-xl border border-slate-300 px-3 text-sm text-slate-400 sm:text-base">
              <span>Search for a customer by name, phone number [F11]</span>
              <FiChevronDown className="shrink-0 text-blue-500" />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-500">
                <FiFileText size={25} />
              </span>
              <div>
                <div className="text-lg font-semibold">Total ₹ 30.00</div>
                <div className="text-sm font-medium">Items: 1, Quantity: 1</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-right font-semibold leading-5 text-blue-600">
              <span>
                Full Breakup
                <br />
                [Ctrl+F]
              </span>
              <FiChevronRight size={22} />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200 bg-white">
            <div className="grid grid-cols-2 gap-3 p-3">
              <label className="text-sm text-slate-500 sm:text-base">
                Payment Mode
                <div className="mt-2 flex h-[58px] items-center justify-between rounded-xl border border-slate-300 px-4 font-semibold text-slate-700">
                  Cash <FiChevronDown className="text-blue-500" />
                </div>
              </label>
              <label className="text-sm text-slate-500 sm:text-base">
                Amount Received
                <div className="mt-2 flex h-[58px] items-center justify-between rounded-xl border border-slate-300 px-4 font-semibold text-slate-700">
                  <span>₹</span>
                  <span>30.00</span>
                </div>
              </label>
            </div>
            <div className="flex flex-1 items-end justify-between border-t border-slate-100 bg-[#fafafa] px-3 py-3 text-base font-semibold sm:text-lg">
              <span>Change to Return:</span>
              <span>₹ 0.00</span>
            </div>
          </div>

          <div className="grid shrink-0 gap-2 rounded-md border border-slate-200 bg-white p-2">
            <ActionButton primary>Save &amp; Print Bill [Ctrl+P]</ActionButton>
            <ActionButton>Other/Credit Payments [Ctrl+M]</ActionButton>
          </div>
        </aside>
      </div>
    </main>
  );
}