import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowUpRight, FiCalendar, FiChevronDown, FiTrendingUp } from "react-icons/fi";
import Card from "../Common/Card";
import { getSaleInvoices } from "../../services/salesStorage.js";
import { businessDataChangedEvent } from "../../services/businessDataChanged.js";

const PERIODS = ["This Month", "Last 30 Days", "This Week", "This Year"];

function parseInvoiceDate(invoice) {
  const value = invoice.form?.invoiceDate || invoice.createdAt || invoice.date;
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInvoiceAmount(invoice) {
  return Math.max(0, Number(invoice.totals?.finalTotal ?? invoice.totals?.amount ?? invoice.total ?? invoice.amount ?? 0));
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Renders the interactive, dynamic sales graph.
function GraphPlaceholder({ summary }) {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("This Month");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [localSales, setLocalSales] = useState([]);
  const dropdownRef = useRef(null);

  // Close dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  // Fetch sales if not provided via summary or refresh on businessDataChanged
  useEffect(() => {
    const updateSales = () => {
      try {
        const invoices = getSaleInvoices();
        setLocalSales(invoices || []);
      } catch {
        setLocalSales([]);
      }
    };
    updateSales();
    window.addEventListener(businessDataChangedEvent, updateSales);
    return () => window.removeEventListener(businessDataChangedEvent, updateSales);
  }, []);

  // Active sales list: prefer summary.activeSales if available, otherwise localSales
  const sales = useMemo(() => {
    if (summary?.activeSales && Array.isArray(summary.activeSales)) {
      return summary.activeSales;
    }
    return localSales.filter((inv) => !inv.isReturn && String(inv.status || "").toLowerCase() !== "cancelled");
  }, [summary, localSales]);

  // Build timeline buckets based on selected period
  const { buckets, periodTotal, peakAmount } = useMemo(() => {
    const today = new Date();
    const result = [];

    if (selectedPeriod === "This Month") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(year, month, day);
        result.push({
          key: toIsoDate(d),
          label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
          shortLabel: day % 5 === 1 || day === lastDay ? `${day}` : "",
          date: d,
          total: 0,
          count: 0,
        });
      }
    } else if (selectedPeriod === "Last 30 Days") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        result.push({
          key: toIsoDate(d),
          label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
          shortLabel: i % 5 === 0 ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "",
          date: d,
          total: 0,
          count: 0,
        });
      }
    } else if (selectedPeriod === "This Week") {
      const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
      const monday = new Date(today);
      monday.setDate(today.getDate() - dayOfWeek);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        result.push({
          key: toIsoDate(d),
          label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
          shortLabel: d.toLocaleDateString("en-IN", { weekday: "short" }),
          date: d,
          total: 0,
          count: 0,
        });
      }
    } else if (selectedPeriod === "This Year") {
      const year = today.getFullYear();
      for (let m = 0; m < 12; m++) {
        const d = new Date(year, m, 1);
        result.push({
          key: `${year}-${String(m + 1).padStart(2, "0")}`,
          label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
          shortLabel: d.toLocaleDateString("en-IN", { month: "short" }),
          date: d,
          total: 0,
          count: 0,
        });
      }
    }

    const lookup = new Map(result.map((b, idx) => [b.key, idx]));
    let total = 0;

    sales.forEach((inv) => {
      const d = parseInvoiceDate(inv);
      if (!d) return;
      const amt = parseInvoiceAmount(inv);
      const key = selectedPeriod === "This Year"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : toIsoDate(d);

      const idx = lookup.get(key);
      if (idx !== undefined) {
        result[idx].total += amt;
        result[idx].count += 1;
        total += amt;
      }
    });

    const max = Math.max(...result.map((b) => b.total), 0);
    return { buckets: result, periodTotal: total, peakAmount: max };
  }, [sales, selectedPeriod]);

  // Chart dimensions
  const height = 280;
  const padding = { top: 25, right: 24, bottom: 42, left: 24 };
  const viewWidth = 700;
  const plotW = viewWidth - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const scale = peakAmount > 0 ? peakAmount * 1.25 : 1000;

  const getX = (index) => padding.left + (buckets.length <= 1 ? plotW / 2 : (index / (buckets.length - 1)) * plotW);
  const getY = (val) => padding.top + plotH - (val / scale) * plotH;

  // Build SVG path
  const linePath = useMemo(() => {
    if (buckets.length === 0) return "";
    return buckets.map((b, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(b.total).toFixed(1)}`).join(" ");
  }, [buckets, scale]);

  const areaPath = useMemo(() => {
    if (buckets.length === 0) return "";
    const firstX = getX(0).toFixed(1);
    const lastX = getX(buckets.length - 1).toFixed(1);
    const baselineY = (padding.top + plotH).toFixed(1);
    return `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  }, [linePath, buckets]);

  const activePoint = hoveredIndex !== null ? buckets[hoveredIndex] : null;

  return (
    <Card className="p-6 select-none shadow-sm">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-500">Total Sale</p>
            <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <FiTrendingUp className="h-3 w-3" /> Live
            </span>
          </div>
          <p className="mt-1.5 text-2xl font-bold text-slate-950">
            ₹ {periodTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-[#1A1F71] hover:bg-blue-100 transition cursor-pointer"
            >
              <FiCalendar className="h-3.5 w-3.5 text-blue-600" />
              {selectedPeriod}
              <FiChevronDown className={`h-4 w-4 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg z-20">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(p);
                      setDropdownOpen(false);
                      setHoveredIndex(null);
                    }}
                    className={`block w-full px-4 py-2 text-left text-xs font-medium transition ${
                      selectedPeriod === p ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct link to invoices */}
          <button
            type="button"
            onClick={() => navigate("/sales/sale-invoices")}
            title="View Sale Invoices"
            className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition cursor-pointer"
          >
            Invoices <FiArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative mt-8 h-72 border-l border-b border-slate-200 bg-[linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[length:100%_56px] transition">
        {/* SVG Visualization */}
        <svg
          viewBox={`0 0 ${viewWidth} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          {peakAmount > 0 && <path d={areaPath} fill="url(#salesGradient)" />}

          {/* Baseline guide */}
          <line
            x1={padding.left}
            y1={padding.top + plotH}
            x2={viewWidth - padding.right}
            y2={padding.top + plotH}
            stroke="#3b82f6"
            strokeWidth="2"
          />

          {/* Trend line */}
          {peakAmount > 0 && (
            <path
              d={linePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive points & hover columns */}
          {buckets.map((b, i) => {
            const cx = getX(i);
            const cy = getY(b.total);
            const hasSale = b.total > 0;
            const isHovered = hoveredIndex === i;

            return (
              <g key={b.key}>
                {/* Invisible hover hitbox column */}
                <rect
                  x={cx - (plotW / buckets.length) / 2}
                  y={padding.top}
                  width={plotW / buckets.length}
                  height={plotH + 20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => navigate("/sales/sale-invoices")}
                />

                {/* Vertical hover line indicator */}
                {isHovered && (
                  <line
                    x1={cx}
                    y1={padding.top}
                    x2={cx}
                    y2={padding.top + plotH}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Point dot on days with sales or when hovered */}
                {(hasSale || isHovered) && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 5.5 : 4}
                    fill={isHovered ? "#1d4ed8" : "#2563eb"}
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="transition-all duration-150"
                  />
                )}

                {/* X-axis date tick text */}
                {b.shortLabel && (
                  <text
                    x={cx}
                    y={padding.top + plotH + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#64748b"
                    className="font-medium select-none pointer-events-none"
                  >
                    {b.shortLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Dynamic Badge (Vyapar style, reacts to hover or shows total) */}
        <div
          onClick={() => navigate("/sales/sale-invoices")}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-emerald-500 px-3.5 py-2 text-center text-xs font-semibold text-white shadow-md cursor-pointer hover:bg-emerald-600 transition"
        >
          {activePoint ? (
            <>
              <span>{activePoint.label}</span>
              <br />
              <span className="font-bold text-sm">
                ₹ {activePoint.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              {activePoint.count > 0 && <span className="opacity-90"> ({activePoint.count} sale{activePoint.count > 1 ? "s" : ""})</span>}
            </>
          ) : (
            <>
              <span>Total Sales</span>
              <br />
              <span className="font-bold text-sm">
                ₹ {periodTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default GraphPlaceholder;
