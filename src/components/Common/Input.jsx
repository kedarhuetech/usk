function Input({ label, prefix, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>}
      <div className="flex h-11 items-center rounded-md border border-slate-300 bg-white px-3 focus-within:border-blue-500">
        {prefix && <span className="mr-2 text-sm font-semibold text-slate-700">{prefix}</span>}
        <input className={`w-full bg-transparent text-sm outline-none ${className}`} {...props} />
      </div>
    </label>
  );
}

export default Input;
