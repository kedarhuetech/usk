// Implements the marketing studio home page.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiGrid,
  FiLayers,
  FiPackage,
  FiPlus,
  FiSearch,
  FiTag,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import {
  businessCategoryTargets,
  discoverySections,
  discoveryTabs,
  quickCreateActions,
  recentDesigns,
  resolveDiscoveryTemplates,
} from "../../constants/marketingStudioData";
import { getLocalMarketingEvents, loadMarketingEvents } from "../../services/marketingStudio/eventCalendarService";
import { convertImageToLayers, createImageToLayersDesign, validateImageToLayersFile } from "../../services/marketingStudio/imageToLayersService";
import { deleteSessionDesign, getRecentImageToLayersDesigns, saveSessionDesign } from "../../services/marketingStudio/sessionDesignService";

const toneStyles = {
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

const quickCreateIcons = {
  "festival-post": FiCalendar,
  "product-promotion": FiPackage,
  "business-offer": FiTag,
  "blank-design": FiGrid,
};

// Makes the result value consistent.
function normalize(value) {
  return value.toLowerCase().trim();
}

// This helper handles search logic.
function matchesSearch(value, query) {
  return normalize(value || "").includes(query);
}

// Gets event date key.
function getEventDateKey(event) {
  return `${String(event.monthNumber).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`;
}

// Gets event date items.
function getEventDateItems(events) {
  const byDate = new Map();

  events.forEach((event) => {
    const key = getEventDateKey(event);
    const current = byDate.get(key);
    if (!current) {
      byDate.set(key, {
        key,
        date: event.date,
        dateLabel: event.dateLabel,
        month: event.month,
        monthNumber: event.monthNumber,
        day: event.day,
        eventCount: 1,
      });
      return;
    }

    current.eventCount += 1;
  });

  return [...byDate.values()].sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
}

// Gets nearest relevant date key.
function getNearestRelevantDateKey(dates) {
  if (!dates || !dates.length) return "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = dates.find((item) => item.date >= todayStr);
  return upcoming ? upcoming.key : dates[0].key;
}

// Renders the studio header interface.
function StudioHeader({ searchQuery, onSearchChange }) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1A1F71]/10 px-2.5 py-1 text-xs font-bold text-[#1A1F71]">
              Grow Your Business
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Template discovery
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Marketing Studio</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Discover festival posts, product promotions, business offers, and reusable design ideas from one compact workspace.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 shadow-sm sm:w-[420px]">
            <FiSearch className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Search templates, sections, tags"
            />
          </label>
          <Button className="h-11 rounded-full bg-[#1A1F71] px-5 text-white hover:bg-[#14185D]">
            <FiPlus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>
    </header>
  );
}

// Renders the section title interface.
function SectionTitle({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
        </div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          {action}
          <FiArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Renders the quick create grid interface.
function QuickCreateGrid() {
  return (
    <Card className="p-5 shadow-sm">
      <SectionTitle icon={FiPlus} title="Quick Create" description="Start common marketing designs quickly." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickCreateActions.map((action) => {
          const Icon = quickCreateIcons[action.id];
          return (
            <button
              key={action.id}
              type="button"
              className="flex min-h-[92px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#1A1F71]/20 hover:shadow-md"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${toneStyles[action.tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-800">{action.title}</span>
                <span className="mt-1 block text-sm leading-5 text-slate-500">{action.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <ImageToLayersBetaCard />
    </Card>
  );
}

// Formats file size.
function formatFileSize(bytes = 0) {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Renders the image to layers beta card interface.
function ImageToLayersBetaCard() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [requirements, setRequirements] = useState([]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  // Handles result.
  const resetResult = () => {
    setResult(null);
    setSelectedLayerIds([]);
    setError("");
    setRequirements([]);
  };

  // Handles file change.
  const handleFileChange = (event) => {
    const [nextFile] = event.target.files || [];
    event.target.value = "";
    if (!nextFile) return;

    const validationError = validateImageToLayersFile(nextFile);
    resetResult();

    if (validationError) {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
      setError(validationError);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  };

  // Handles convert.
  const handleConvert = async () => {
    if (!file || isProcessing) return;

    setIsProcessing(true);
    setError("");
    setRequirements([]);

    try {
      const nextResult = await convertImageToLayers(file);
      setResult(nextResult);
      setSelectedLayerIds(nextResult.layers.map((layer) => layer.id));
    } catch (caughtError) {
      setError(caughtError.message || "Image to Layers failed.");
      setRequirements(caughtError.requirements || []);
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggles layer.
  const toggleLayer = (layerId) => {
    setSelectedLayerIds((current) => (current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId]));
  };

  // Handles open editor.
  const handleOpenEditor = async () => {
    if (!result || !selectedLayerIds.length) return;
    const design = createImageToLayersDesign(result, selectedLayerIds);
    try {
      await saveSessionDesign(design);
      navigate(`/business-growth/marketing-tools/editor/${design.id}`);
    } catch (error) { setError(error.message || "Unable to save this design."); }
  };

  return (
    <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#1A1F71] shadow-sm">
              <FiLayers className="h-4 w-4" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-slate-900">Image to Layers</h3>
                <span className="rounded-full bg-[#F97316]/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#C2410C]">
                  Beta
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">Upload a poster and separate its detected objects and text into movable, editable layers.</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full bg-white px-5 text-[#1A1F71] ring-1 ring-indigo-100 hover:bg-indigo-50">
              <FiUpload className="h-4 w-4" />
              Upload Image
            </Button>
            <Button type="button" onClick={handleConvert} disabled={!file || isProcessing} className="rounded-full bg-[#1A1F71] px-5 text-white hover:bg-[#14185D] disabled:opacity-50">
              {isProcessing ? "Analyzing..." : "Convert to Layers"}
            </Button>
            {result && (
              <Button type="button" onClick={handleOpenEditor} disabled={!selectedLayerIds.length} className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                Open in Editor
                <FiArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {previewUrl && (
          <div className="flex w-full max-w-sm gap-3 rounded-lg border border-white bg-white/80 p-2 shadow-sm lg:w-80">
            <img src={previewUrl} alt="Uploaded poster preview" className="h-24 w-20 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{file?.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{formatFileSize(file?.size)}</p>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl("");
                  resetResult();
                }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600"
              >
                <FiX className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {isProcessing && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3 text-sm font-semibold text-slate-600">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[#1A1F71]" />
          </div>
          <p className="mt-2">Analyzing the image and asking the AI segmentation service for foreground objects...</p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">{error}</p>
              {requirements.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold">
                  {requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FiCheckCircle className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-bold text-slate-800">{result.layers.length} extracted layer{result.layers.length === 1 ? "" : "s"}</p>
            </div>
            <p className="text-xs font-semibold text-slate-400">{result.width} x {result.height}px · {result.model}</p>
          </div>
          {/* Development Debug View: Original | Removal Mask | Clean Background | Reconstructed Poster */}
          <div className="mt-3 mb-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-900">
              Debug View: Pipeline Inspection (Original | Removal Mask | Clean Background | Reconstructed Poster)
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. ORIGINAL */}
              <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-2 text-center">
                <span className="mb-1 text-xs font-bold text-slate-700">1. Original Uploaded Poster</span>
                <div className="relative grid h-44 w-full place-items-center overflow-hidden rounded bg-slate-100 p-1">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Original uploaded poster" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-400">No original preview</span>
                  )}
                </div>
              </div>

              {/* 2. REMOVAL MASK */}
              <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-2 text-center">
                <span className="mb-1 text-xs font-bold text-slate-700">2. Removal Mask</span>
                <div className="relative grid h-44 w-full place-items-center overflow-hidden rounded bg-slate-900 p-1">
                  {result.removalMaskSrc ? (
                    <img src={result.removalMaskSrc} alt="Removal mask" className="max-h-full max-w-full object-contain filter invert" />
                  ) : (
                    <span className="text-xs text-slate-400">Mask not generated</span>
                  )}
                </div>
              </div>

              {/* 3. CLEAN BACKGROUND */}
              <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-2 text-center">
                <span className="mb-1 text-xs font-bold text-slate-700">3. Clean Background</span>
                <div className="relative grid h-44 w-full place-items-center overflow-hidden rounded bg-slate-100 p-1">
                  {result.background?.src || result.backgroundSrc ? (
                    <img src={result.background?.src || result.backgroundSrc} alt="Cleaned reconstructed background" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-400">No background generated</span>
                  )}
                </div>
              </div>

              {/* 4. RECONSTRUCTED POSTER */}
              <div className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-2 text-center">
                <span className="mb-1 text-xs font-bold text-slate-700">4. Reconstructed Poster</span>
                <div className="relative grid h-44 w-full place-items-center overflow-hidden rounded bg-slate-100 p-1">
                  <div
                    className="relative max-h-full max-w-full overflow-hidden"
                    style={{
                      aspectRatio: `${result.width} / ${result.height}`,
                      width: "100%",
                      maxHeight: "100%",
                    }}
                  >
                    <img
                      src={result.background?.src || result.backgroundSrc}
                      alt="Reconstructed preview background"
                      className="h-full w-full object-contain"
                    />
                    {result.layers.map((layer) => {
                      if (!selectedLayerIds.includes(layer.id)) return null;
                      const relX = (layer.x / result.width) * 100;
                      const relY = (layer.y / result.height) * 100;
                      const relW = (layer.width / result.width) * 100;
                      const relH = (layer.height / result.height) * 100;

                      return (
                        <div
                          key={layer.id}
                          className="absolute flex items-center justify-center pointer-events-none"
                          style={{
                            left: `${relX}%`,
                            top: `${relY}%`,
                            width: `${relW}%`,
                            height: `${relH}%`,
                          }}
                        >
                          {layer.type === "text" ? (
                            <span
                              className="w-full text-center leading-tight font-bold"
                              style={{
                                color: layer.fill || "#0f172a",
                                fontSize: `clamp(8px, 1.2vw, 18px)`,
                                textAlign: layer.align || "center",
                              }}
                            >
                              {layer.text}
                            </span>
                          ) : (
                            <img src={layer.src} alt={layer.name} className="h-full w-full object-contain" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {result.layers.map((layer, index) => {
              const selected = selectedLayerIds.includes(layer.id);
              const isTextLayer = layer.type === "text";
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => toggleLayer(layer.id)}
                  className={`rounded-lg border p-2 text-left transition ${
                    selected ? "border-[#1A1F71] bg-indigo-50" : "border-slate-200 bg-slate-50 hover:bg-white"
                  }`}
                >
                  <span className="grid h-24 place-items-center rounded-md bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0]">
                    {isTextLayer ? (
                      <span className="line-clamp-3 px-3 text-center text-sm font-bold text-slate-700">{layer.text}</span>
                    ) : (
                      <img src={layer.src} alt={`Extracted object ${index + 1}`} className="max-h-24 max-w-full object-contain" loading="lazy" />
                    )}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
                    <span className="truncate">{layer.name || (isTextLayer ? `Text ${index + 1}` : `Object ${index + 1}`)}</span>
                    <span className={`shrink-0 ${selected ? "text-[#1A1F71]" : "text-slate-400"}`}>{selected ? "Keep" : "Removed"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-medium leading-5 text-slate-500">
            Object cutouts use ISNet by default, or SAM 2 when it is installed and configured on the backend. OCR creates editable text layers; decorative fonts may need adjustment, and complex background areas may need manual cleanup.
          </p>
        </div>
      )}
    </div>
  );
}

// Renders the business category selector interface.
function BusinessCategorySelector({ categories, selectedCategory, onCategoryChange }) {
  return (
    <Card className="px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Business category</p>
          <p className="text-xs font-medium text-slate-500">Rows prioritize templates using data tags and category metadata.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => {
            const active = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onCategoryChange(category.id)}
                className={`h-9 shrink-0 rounded-full border px-5 text-xs font-bold transition ${
                  active ? "border-[#1A1F71] bg-[#1A1F71] text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// Renders the event date strip interface.
function EventDateStrip({ dates, selectedDateKey, onSelectDate }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {dates.map((date) => {
          const active = selectedDateKey === date.key;
          return (
            <button
              key={date.key}
              type="button"
              onClick={() => onSelectDate(active ? "" : date.key)}
              className={`w-24 rounded-lg border px-3 py-2 text-center transition ${
                active ? "border-[#1A1F71] bg-[#1A1F71] text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              <span className="block text-lg font-bold">{date.dateLabel}</span>
              <span className={`block text-xs font-semibold ${active ? "text-white/75" : "text-slate-400"}`}>
                {date.eventCount} event{date.eventCount === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Renders the festival event cards interface.
function FestivalEventCards({ events, selectedEventId, onSelectEvent }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {events.map((event) => {
        const active = selectedEventId === event.id;
        return (
          <article
            key={event.id}
            className={`overflow-hidden rounded-lg border bg-white shadow-sm transition ${
              active ? "border-[#1A1F71] ring-2 ring-[#1A1F71]/10" : "border-slate-200"
            }`}
          >
            <button type="button" onClick={() => onSelectEvent(active ? "" : event.id)} className="block w-full text-left">
              <div className={`relative h-24 bg-gradient-to-br ${event.visualClass}`}>
                <span className={`absolute left-3 top-3 h-2.5 w-2.5 rounded-full ${event.accentClass}`} />
                <span className="absolute bottom-3 left-3 rounded-lg bg-white/85 px-3 py-2 text-lg font-bold text-slate-900 shadow-sm">
                  {event.dateLabel}
                </span>
              </div>
              <div className="p-3">
                <h3 className="truncate font-bold text-slate-800">{event.name}</h3>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                  {event.type} - {event.region}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{event.templateCount} templates</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                    {active ? "Selected" : "Explore"}
                  </span>
                </div>
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}

// Renders the empty festival date state interface.
function EmptyFestivalDateState({ selectedDateLabel }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
          <FiCalendar className="h-5 w-5" />
        </span>
        <h3 className="mt-3 font-bold text-slate-800">No relevant events for this date</h3>
        <p className="mt-1 text-sm text-slate-500">
          {selectedDateLabel ? `${selectedDateLabel} has no currently ranked marketing events.` : "Choose another date from the calendar."}
        </p>
      </div>
    </div>
  );
}

// Renders the festival discovery interface.
function FestivalDiscovery({
  events,
  dates,
  selectedDateKey,
  selectedDateLabel,
  selectedEventId,
  onSelectDate,
  onSelectEvent,
  isLoading,
  errorMessage,
  fallbackUsed,
}) {
  return (
    <Card className="p-4 shadow-sm">
      <SectionTitle
        icon={FiCalendar}
        title="Festival Calendar"
        description="Hybrid India-focused events from Calendarific, Wikimedia, and local curated fallback data."
        action={selectedDateKey || selectedEventId ? "Clear selection" : ""}
        onAction={() => {
          onSelectDate("");
          onSelectEvent("");
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
        {isLoading && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Loading live events...</span>}
        {fallbackUsed && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Using curated fallback</span>}
        {errorMessage && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{errorMessage}</span>}
      </div>
      <EventDateStrip dates={dates} selectedDateKey={selectedDateKey} onSelectDate={onSelectDate} />
      <div className="mt-3">
        {events.length ? (
          <FestivalEventCards events={events} selectedEventId={selectedEventId} onSelectEvent={onSelectEvent} />
        ) : (
          <EmptyFestivalDateState selectedDateLabel={selectedDateLabel} />
        )}
      </div>
    </Card>
  );
}

// Renders the discovery tabs interface.
function DiscoveryTabs({ tabs, activeTab, onTabChange }) {
  return (
    <Card className="p-2 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-lg border px-4 py-4 text-left transition ${
                active ? "border-[#1A1F71] bg-[#1A1F71] text-white shadow-sm" : "border-slate-100 bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/70" : "text-slate-400"}`}>{tab.description}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// Renders the template card interface.
function TemplateCard({ template }) {
  const navigate = useNavigate();

  return (
    <article className="flex h-[338px] w-[250px] shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#1A1F71]/20 hover:shadow-md sm:w-[270px]">
      <div className="flex h-[210px] items-center justify-center bg-slate-50 p-3">
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-100 bg-white/80 p-2.5">
          <img src={template.thumbnail} alt={template.thumbnailAlt} className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
      </div>
      <div className="flex h-[128px] shrink-0 flex-col justify-between border-t border-slate-100 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 min-w-0 text-sm font-bold leading-5 text-slate-900">{template.title || template.name}</h3>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {template.category}
          </span>
        </div>
        <p className="text-xs font-semibold capitalize text-slate-500">{template.editMode.replace("-", " ")}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase text-slate-400">{template.templateType}</span>
          <button
            type="button"
            onClick={() => navigate(`/business-growth/marketing-tools/editor/${template.id}`)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Customize
            <FiArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

// Renders the template rail interface.
function TemplateRail({ children }) {
  const railRef = useRef(null);
  // Handles rail.
  const scrollRail = (direction) => {
    railRef.current?.scrollBy({
      left: direction * 300,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollRail(-1)}
        className="absolute -left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:bg-slate-50 lg:grid"
        aria-label="Scroll templates left"
      >
        <FiChevronLeft className="h-5 w-5" />
      </button>
      <div ref={railRef} className="-mx-4 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-4">
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollRail(1)}
        className="absolute -right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:bg-slate-50 lg:grid"
        aria-label="Scroll templates right"
      >
        <FiChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

// Renders the filter chips interface.
function FilterChips({ sectionId, filters, activeFilter, onFilterChange }) {
  if (!filters?.length) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {filters.map((filter) => {
        const active = activeFilter === filter;
        return (
          <button
            key={`${sectionId}-${filter}`}
            type="button"
            onClick={() => onFilterChange(sectionId, active ? "" : filter)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
              active ? "border-[#1A1F71] bg-[#1A1F71] text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
            }`}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}

// Renders the template section interface.
function TemplateSection({ section, activeFilter, onFilterChange }) {
  const filteredTemplates = useMemo(() => {
    if (!activeFilter) return section.templates;
    const filterQuery = normalize(activeFilter);
    return section.templates.filter((templateItem) =>
      [templateItem.category, ...templateItem.tags].some((value) => matchesSearch(value, filterQuery)),
    );
  }, [activeFilter, section.templates]);

  if (!filteredTemplates.length) return null;

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">{section.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{section.subtitle}</p>
        </div>
        {section.viewAllEnabled && (
          <button type="button" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
            View all
            <FiArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <FilterChips sectionId={section.id} filters={section.filters} activeFilter={activeFilter} onFilterChange={onFilterChange} />
      <div className="mt-3">
        <TemplateRail>
          {filteredTemplates.map((templateItem) => (
            <TemplateCard key={templateItem.id} template={templateItem} />
          ))}
        </TemplateRail>
      </div>
    </Card>
  );
}

// Renders the dynamic sections renderer interface.
function DynamicSectionsRenderer({ sections, activeFilters, onFilterChange, searchQuery, emptyTitle, emptyDescription }) {
  if (!sections.length) {
    return (
      <Card className="grid min-h-52 place-items-center p-6 text-center shadow-sm">
        <div>
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
            <FiSearch className="h-5 w-5" />
          </span>
          <h3 className="mt-3 font-bold text-slate-800">{emptyTitle || "No templates found"}</h3>
          <p className="mt-1 text-sm text-slate-500">{emptyDescription || `Try a different search than "${searchQuery}".`}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <TemplateSection
          key={section.id}
          section={section}
          activeFilter={activeFilters[section.id] || ""}
          onFilterChange={onFilterChange}
        />
      ))}
    </div>
  );
}

// Gets search filtered sections.
function getSearchFilteredSections(sections, query) {
  if (!query) return sections;

  return sections
    .map((section) => {
      const sectionMatches =
        matchesSearch(section.title, query) ||
        matchesSearch(section.subtitle, query) ||
        matchesSearch(section.id, query) ||
        section.filters.some((filter) => matchesSearch(filter, query));

      const matchingTemplates = section.templates.filter((templateItem) =>
        [
          templateItem.title,
          templateItem.name,
          templateItem.category,
          templateItem.templateType,
          templateItem.editMode,
          templateItem.format,
          ...(templateItem.businessCategories || []),
          ...(templateItem.discoveryTabs || []),
          ...(templateItem.sections || []),
          ...templateItem.tags,
        ].some((value) => matchesSearch(value, query)),
      );

      if (sectionMatches) return section;
      if (!matchingTemplates.length) return null;
      return { ...section, templates: matchingTemplates };
    })
    .filter(Boolean);
}

// Renders the marketing discovery interface.
function MarketingDiscovery({ activeTab, onTabChange, searchQuery, selectedBusinessCategory }) {
  const eventYear = new Date().getFullYear();
  const [eventState, setEventState] = useState(() => ({
    events: getLocalMarketingEvents(eventYear),
    isLoading: true,
    fallbackUsed: true,
    errorMessage: "",
  }));
  const normalizedQuery = normalize(searchQuery);

  const visibleEvents = useMemo(() => {
    if (activeTab !== "festivals") return eventState.events;
    if (!normalizedQuery) return eventState.events;

    return eventState.events.filter((event) =>
      [event.name, event.title, event.type, event.region, event.dateLabel, event.month, event.source, ...event.tags].some((value) =>
        matchesSearch(value, normalizedQuery),
      ),
    );
  }, [activeTab, eventState.events, normalizedQuery]);

  const visibleEventDates = useMemo(() => getEventDateItems(visibleEvents), [visibleEvents]);

  const [selectedDateKey, setSelectedDateKey] = useState(() => {
    const initialEvents = getLocalMarketingEvents(eventYear);
    const initialDates = getEventDateItems(initialEvents);
    return getNearestRelevantDateKey(initialDates);
  });
  const [selectedEventId, setSelectedEventId] = useState("");
  const [activeFilters, setActiveFilters] = useState({});

  useEffect(() => {
    const controller = new AbortController();

    loadMarketingEvents({ year: eventYear, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setEventState({
          events: result.events,
          isLoading: false,
          fallbackUsed: result.fallbackUsed,
          errorMessage: result.calendarificSucceeded
            ? ""
            : "Calendarific unavailable. Showing curated fallback events.",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setEventState({
          events: getLocalMarketingEvents(eventYear),
          isLoading: false,
          fallbackUsed: true,
          errorMessage: "Live event sources failed. Showing curated events.",
        });
      });

    return () => controller.abort();
  }, [eventYear]);

  useEffect(() => {
    if (!visibleEventDates.length) return;
    const isCurrentKeyValid = visibleEventDates.some((dateItem) => dateItem.key === selectedDateKey);
    if (!isCurrentKeyValid && selectedDateKey !== "") {
      setSelectedDateKey(getNearestRelevantDateKey(visibleEventDates));
    }
  }, [visibleEventDates, selectedDateKey]);

  const selectedDateLabel = useMemo(
    () => visibleEventDates.find((date) => date.key === selectedDateKey)?.dateLabel || "",
    [selectedDateKey, visibleEventDates],
  );

  const dateFilteredEvents = useMemo(() => {
    if (activeTab !== "festivals" || !selectedDateKey) return [];
    return visibleEvents.filter((event) => getEventDateKey(event) === selectedDateKey);
  }, [activeTab, selectedDateKey, visibleEvents]);

  const visibleSections = useMemo(() => {
    const tabSections = discoverySections
      .filter((section) => section.tab === activeTab)
      .map((section) => ({
        ...section,
        templates: resolveDiscoveryTemplates(section.templateIds, {
          businessCategory: selectedBusinessCategory,
          section,
        }),
      }));
    const eventFilteredSections =
      activeTab === "festivals" && selectedEventId
        ? tabSections
            .map((section) => ({
              ...section,
              templates: section.templates.filter(
                (templateItem) => templateItem.eventId === selectedEventId || templateItem.eventIds?.includes(selectedEventId),
              ),
            }))
            .filter((section) => section.templates.length)
        : tabSections;

    return getSearchFilteredSections(eventFilteredSections, normalizedQuery);
  }, [activeTab, normalizedQuery, selectedBusinessCategory, selectedEventId]);

  // Handles filter change.
  const handleFilterChange = (sectionId, filter) => {
    setActiveFilters((current) => ({ ...current, [sectionId]: filter }));
  };

  // Handles select date.
  const handleSelectDate = (dateKey) => {
    setSelectedDateKey(dateKey);
    setSelectedEventId("");
  };

  return (
    <section className="space-y-4">
      <div>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Template Discovery</h2>
            <p className="text-sm text-slate-500">Browse reusable template sections powered by local data records.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{visibleSections.length} sections shown</span>
        </div>
        <DiscoveryTabs tabs={discoveryTabs} activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {activeTab === "festivals" && (
        <FestivalDiscovery
          events={dateFilteredEvents}
          dates={visibleEventDates}
          selectedDateKey={selectedDateKey}
          selectedDateLabel={selectedDateLabel}
          selectedEventId={selectedEventId}
          onSelectDate={handleSelectDate}
          onSelectEvent={setSelectedEventId}
          isLoading={eventState.isLoading}
          errorMessage={eventState.errorMessage}
          fallbackUsed={eventState.fallbackUsed}
        />
      )}

      <DynamicSectionsRenderer
        sections={visibleSections}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        searchQuery={searchQuery}
        emptyTitle={selectedEventId ? "No templates linked yet" : ""}
        emptyDescription={
          selectedEventId
            ? "This event is available in the calendar, but no template has been assigned to it yet."
            : ""
        }
      />
    </section>
  );
}

// Renders the recent designs interface.
function RecentDesigns() {
  return (
    <Card className="p-5 shadow-sm">
      <SectionTitle icon={FiClock} title="Recent Designs" description="Drafts and saved designs will appear here after you create them." />
      {recentDesigns.length ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-4">
            {recentDesigns.map((design) => (
              <TemplateCard key={design.id} template={design} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[190px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
              <FiEdit3 className="h-5 w-5" />
            </span>
            <h3 className="mt-3 font-bold text-slate-800">No recent designs yet</h3>
            <p className="mt-1 text-sm text-slate-500">Create or customize a template to see it here.</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// Renders the recent image to layers interface.
function RecentImageToLayers() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  // Handles delete.
  const handleDelete = async (id) => {
    setDeletingId(id);
    setDeleteError("");
    try {
      await deleteSessionDesign(id);
      setDesigns((current) => current.filter((design) => design.id !== id));
    } catch (deleteRequestError) {
      setDeleteError(deleteRequestError.message || "Unable to delete this edit.");
    } finally {
      setDeletingId("");
    }
  };

  useEffect(() => {
    let active = true;
    getRecentImageToLayersDesigns()
      .then((saved) => {
        if (active) setDesigns(saved.slice(0, 6));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Unable to load recent Image to Layers designs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <Card className="p-5 shadow-sm">
      <SectionTitle icon={FiLayers} title="Recent Image to Layers" description="Your six most recent edits are autosaved and available when you return." />
      {loading ? (
        <p className="rounded-lg bg-slate-50 p-5 text-sm font-semibold text-slate-500">Loading saved edits…</p>
      ) : error ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error}</p>
      ) : designs.length ? (
        <>
        {deleteError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{deleteError}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {designs.map((design) => {
            const thumbnail = design.thumbnail || design.elements?.find((element) => element.type === "image")?.src;
            const savedAt = design.updatedAt ? new Date(design.updatedAt).toLocaleString() : "Saved";
            return (
              <article key={design.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid h-16 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100">
                  {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-contain" loading="lazy" /> : <FiLayers className="h-5 w-5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{design.title || design.name || "Image to Layers edit"}</p>
                  <p className="mt-1 text-xs text-slate-500">Saved {savedAt}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/business-growth/marketing-tools/editor/${design.id}`)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    Continue editing <FiArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(design.id)}
                    disabled={Boolean(deletingId)}
                    className="mt-2 ml-3 inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 disabled:cursor-wait disabled:opacity-50"
                    aria-label={`Delete ${design.title || design.name || "Image to Layers edit"}`}
                  >
                    <FiTrash2 className="h-3.5 w-3.5" /> {deletingId === design.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          No recent edits.
        </div>
      )}
    </Card>
  );
}

// Renders the marketing studio home interface.
function MarketingStudioHome() {
  const [activeTab, setActiveTab] = useState("for-you");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBusinessCategory, setSelectedBusinessCategory] = useState("clothes");

  return (
    <div className="min-h-full bg-slate-100">
      <StudioHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <QuickCreateGrid />
          <RecentDesigns />
        </div>
        <RecentImageToLayers />
        <BusinessCategorySelector
          categories={businessCategoryTargets}
          selectedCategory={selectedBusinessCategory}
          onCategoryChange={setSelectedBusinessCategory}
        />
        <MarketingDiscovery
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          selectedBusinessCategory={selectedBusinessCategory}
        />
      </main>
    </div>
  );
}

export default MarketingStudioHome;
