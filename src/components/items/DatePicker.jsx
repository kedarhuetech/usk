import { useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function DatePicker({ label, value, onChange }) {
  const initial = value ? new Date(value) : new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const rootRef = useRef(null);

  const days = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return Array.from({ length: start.getDay() }, () => null).concat(
      Array.from({ length: end.getDate() }, (_, index) => index + 1)
    );
  }, [cursor]);

  const setMonth = (month) => {
    setCursor(new Date(cursor.getFullYear(), month, 1));
    setView("days");
  };

  const setYear = (year) => {
    setCursor(new Date(year, cursor.getMonth(), 1));
    setView("months");
  };

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
    <div ref={rootRef} className="relative">
      {label && <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-left text-sm outline-none transition focus:border-blue-500"
      >
        {value || "Select date"}
        <FiCalendar className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <FiChevronLeft />
            </button>
            <button type="button" onClick={() => setView(view === "days" ? "months" : "years")} className="text-sm font-bold text-slate-800">
              {months[cursor.getMonth()]} {cursor.getFullYear()}
            </button>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <FiChevronRight />
            </button>
          </div>

          {view === "years" && (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, index) => cursor.getFullYear() - 5 + index).map((year) => (
                <button key={year} type="button" onClick={() => setYear(year)} className="rounded-md py-2 text-sm hover:bg-blue-50">
                  {year}
                </button>
              ))}
            </div>
          )}

          {view === "months" && (
            <div className="grid grid-cols-4 gap-2">
              {months.map((month, index) => (
                <button key={month} type="button" onClick={() => setMonth(index)} className="rounded-md py-2 text-sm hover:bg-blue-50">
                  {month}
                </button>
              ))}
            </div>
          )}

          {view === "days" && (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {days.map((day, index) =>
                  day ? (
                    <button
                      key={`${day}-${index}`}
                      type="button"
                      onClick={() => {
                        onChange(toInputDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)));
                        setOpen(false);
                      }}
                      className="rounded-md py-1.5 text-sm hover:bg-blue-50"
                    >
                      {day}
                    </button>
                  ) : (
                    <span key={`blank-${index}`} />
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DatePicker;
