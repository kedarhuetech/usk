// Renders the input interface.
function Input({ label, prefix, className = "", ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-medium text-[#546048]">{label}</span>}
      <div className="flex h-11 items-center rounded-lg border border-[#EAE2D6] bg-[#EEEEEE] px-3 focus-within:border-[#8B9A6E] focus-within:ring-2 focus-within:ring-[#8B9A6E]/20 transition">
        {prefix && <span className="mr-2 text-sm font-semibold text-[#242C1D]">{prefix}</span>}
        <input className={`w-full bg-transparent text-sm outline-none text-[#242C1D] placeholder:text-[#8C9881] ${className}`} {...props} />
      </div>
    </label>
  );
}

export default Input;
