import React, { useState, useEffect, useRef, useCallback } from "react";
import { FiSearch, FiCheck, FiLoader } from "react-icons/fi";
import { searchHsnCodes, lookupHsnCode } from "../../services/hsnService.js";

/**
 * Reusable HSN & SAC Autocomplete input component.
 * Fully supports Goods (HSN) and Services (SAC) with instant search,
 * interactive category filter tabs (All / HSN Goods / SAC Services),
 * and keyboard navigation.
 */
export default function HsnAutocomplete({
  value = "",
  onChange,
  onSelect,
  type = null, // "HSN" | "SAC" | null
  placeholder = "Search HSN/SAC code or item/service name...",
  className = "",
  containerClassName = "",
  disabled = false,
  compact = false,
  autoFocus = false,
  showIcon = true,
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [activeFilter, setActiveFilter] = useState(type || "ALL");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync internal query state if parent value changes externally
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Sync type filter if prop changes
  useEffect(() => {
    setActiveFilter(type || "ALL");
  }, [type]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(
    async (searchTerm, filterType) => {
      setLoading(true);
      const effectiveType = filterType === "ALL" ? null : filterType;
      try {
        const data = await searchHsnCodes(searchTerm, effectiveType, 30);
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightIndex(-1);
      } catch (err) {
        console.warn("Autocomplete search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (onChange) onChange(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(val, activeFilter);
    }, 200);
  };

  const handleFilterTabClick = (tab) => {
    setActiveFilter(tab);
    fetchSuggestions(query, tab);
  };

  const handleSelect = (item) => {
    setQuery(item.code);
    setIsOpen(false);
    if (onChange) onChange(item.code);
    if (onSelect) onSelect(item);
  };

  const handleDirectCodeLookup = useCallback(async (codeToLookup) => {
    if (!codeToLookup || !onSelect) return;
    const clean = String(codeToLookup).trim().replace(/\s+/g, "");
    if (/^\d{2,8}$/.test(clean)) {
      try {
        const res = await lookupHsnCode(clean);
        if (res && res.valid && res.data) {
          onSelect(res.data);
        }
      } catch (err) {
        // silent fallback
      }
    }
  }, [onSelect]);

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "ArrowDown" && query.trim()) {
        fetchSuggestions(query, activeFilter);
      } else if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
        handleDirectCodeLookup(query);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        handleSelect(results[highlightIndex]);
      } else if (query.trim()) {
        setIsOpen(false);
        handleDirectCodeLookup(query);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    // Timeout gives click events on dropdown items time to execute first
    setTimeout(() => {
      if (query.trim()) {
        handleDirectCodeLookup(query);
      }
    }, 250);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${containerClassName}`}
    >
      <div className="relative flex items-center w-full">
        <input
          type="text"
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
            else if (query.trim()) fetchSuggestions(query, activeFilter);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={
            className ||
            (compact
              ? "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              : "w-full h-11 rounded-md border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none")
          }
        />

        {showIcon && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-slate-400">
            {loading ? (
              <FiLoader className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <FiSearch className="h-4 w-4 text-slate-400" />
            )}
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* Header with Type Switcher Tabs */}
          <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => handleFilterTabClick("ALL")}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  activeFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handleFilterTabClick("HSN")}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  activeFilter === "HSN"
                    ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "text-slate-600 hover:text-blue-700"
                }`}
              >
                HSN (Goods)
              </button>
              <button
                type="button"
                onClick={() => handleFilterTabClick("SAC")}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  activeFilter === "SAC"
                    ? "bg-purple-600 text-white shadow-2xs font-bold"
                    : "text-slate-600 hover:text-purple-700"
                }`}
              >
                SAC (Services)
              </button>
            </div>

            <span className="text-[10px] text-slate-400 font-medium">
              Top {results.length} matches (searched across entire database)
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {results.map((item, index) => {
              const isHighlighted = index === highlightIndex;
              const isSac = item.type === "SAC" || String(item.code).startsWith("99");

              return (
                <li
                  key={`${item.code}-${index}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={`px-3.5 py-2.5 text-left cursor-pointer transition flex items-start justify-between gap-3 ${
                    isHighlighted
                      ? isSac
                        ? "bg-purple-50 text-slate-900"
                        : "bg-blue-50 text-slate-900"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-slate-900 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                        {item.code}
                      </span>

                      {/* Explicit HSN vs SAC badge with clear label */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border ${
                          isSac
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {isSac ? "SAC · Service" : "HSN · Goods"}
                      </span>

                      {item.gst_rate !== null && item.gst_rate !== undefined && (
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {item.gst_rate}% GST
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-normal">
                      {item.description}
                    </p>
                  </div>

                  {value === item.code && (
                    <FiCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
