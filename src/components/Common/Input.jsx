// Renders the input interface.
function Input({ label, prefix, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>}
      <div className="flex h-11 items-center rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 focus-within:border-[#FF5A1F] focus-within:ring-2 focus-within:ring-[#FF5A1F]/20 dark:border-slate-700 dark:bg-[#1A1E27] transition">
        {prefix && <span className="mr-2 text-sm font-semibold text-[#0F172A] dark:text-slate-200">{prefix}</span>}
        <input className={`w-full bg-transparent text-sm outline-none text-[#0F172A] dark:text-white placeholder:text-slate-400 ${className}`} {...props} />
      </div>
    </label>
  );
}

export default Input;
