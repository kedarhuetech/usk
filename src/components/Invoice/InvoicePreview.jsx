function InvoicePreview({ invoice, form }) {
  return (
    <section className="rounded-lg bg-slate-100 p-6">
      <h2 className="mb-5 text-center text-lg font-semibold text-slate-950">
        1Cr businesses have created invoices on Ledgerly
      </h2>
      <div className="mx-auto min-h-[680px] max-w-xl bg-white p-8 shadow-xl shadow-slate-300/50">
        <p className="text-center text-sm font-bold text-slate-950">Tax Invoice</p>
        <h3 className="mt-16 text-center text-lg font-bold uppercase text-slate-900">Tax Invoice</h3>

        <div className="mt-10 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold text-slate-900">Bill To</p>
            <p className="mt-3 text-slate-600">{form.customerName || "Customer Name"}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">Invoice Details</p>
            <p className="mt-3 text-blue-600">Invoice No. #{invoice.invoiceNumber}</p>
            <p className="mt-2 text-slate-700">Date : {invoice.invoiceDate}</p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-slate-200">
          <div className="grid grid-cols-12 bg-indigo-500 px-3 py-2 text-xs font-semibold text-white">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Item name</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-2 text-right">Price</span>
            <span className="col-span-2 text-right">Amt</span>
          </div>
          <div className="grid grid-cols-12 px-3 py-3 text-xs text-slate-600">
            <span className="col-span-1">1</span>
            <span className="col-span-5">{invoice.item.name}</span>
            <span className="col-span-2 text-right">{invoice.item.quantity}</span>
            <span className="col-span-2 text-right">Rs {form.amount || invoice.item.price}</span>
            <span className="col-span-2 text-right">Rs {form.amount || "0.00"}</span>
          </div>
        </div>

        <div className="mt-8 space-y-2 text-right text-sm">
          <p className="text-slate-600">Business: {form.businessName || "Business Name"}</p>
          <p className="font-semibold text-slate-950">Total: Rs {form.amount || "0.00"}</p>
          <p className="text-slate-600">Received: Rs {form.received || "0.00"}</p>
        </div>
      </div>
    </section>
  );
}

export default InvoicePreview;
