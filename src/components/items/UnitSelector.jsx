import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import { units } from "../../constants/itemsData";

function UnitSelector({ label, value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  const filteredUnits = useMemo(
    () => units.filter((unit) => unit.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase text-blue-600">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-slate-700 outline-none transition hover:border-blue-300 focus:border-blue-500"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || "None"}</span>
        <FiChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
          <label className="flex h-10 items-center gap-2 border-b border-slate-100 px-3">
            <FiSearch className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search unit"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="max-h-44 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
            >
              None
            </button>
            {filteredUnits.map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => {
                  onChange(unit);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default UnitSelector;
