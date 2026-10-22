import { marketingEvents as localMarketingEvents } from "../../constants/marketingStudio/discoveryData.js";
import { marketingTemplates } from "../../constants/marketingStudio/templateRegistry.js";

const CALENDARIFIC_ENDPOINT = "https://calendarific.com/api/v2/holidays";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://9hdxck8r-5000.inc1.devtunnels.ms//api").replace(/\/api\/?$/, "");
const WIKIMEDIA_ON_THIS_DAY_ENDPOINT = "https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday";

const calendarCache = new Map();
const wikimediaCache = new Map();
const eventCache = new Map();

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted/i.test(error?.message || "");
}

function createAbortError() {
  const error = new Error("Marketing events request was aborted.");
  error.name = "AbortError";
  return error;
}

const EVENT_ALIASES = [
  { id: "independence-day", patterns: [/independence day/i] },
  { id: "republic-day", patterns: [/republic day/i] },
  { id: "ganesh-chaturthi", patterns: [/ganesh/i, /vinayaka/i] },
  { id: "diwali", patterns: [/diwali/i, /deepavali/i] },
  { id: "rakhi", patterns: [/raksha bandhan/i, /\brakhi\b/i] },
  { id: "gandhi-jayanti", patterns: [/gandhi jayanti/i, /mahatma gandhi/i] },
  { id: "ambedkar-jayanti", patterns: [/ambedkar/i] },
  { id: "teachers-day", patterns: [/teacher/i, /sarvepalli/i, /radhakrishnan/i] },
  { id: "customer-service-week", patterns: [/customer service/i] },
  { id: "festive-sale-season", patterns: [/festive sale/i] },
];

const IMPORTANT_KEYWORDS = [
  "india",
  "indian",
  "national",
  "festival",
  "hindu",
  "sikh",
  "jain",
  "buddhist",
  "muslim",
  "religious",
  "observance",
  "holiday",
  "diwali",
  "deepavali",
  "ganesh",
  "raksha",
  "rakhi",
  "holi",
  "eid",
  "christmas",
  "gandhi",
  "ambedkar",
  "nehru",
  "vivekananda",
  "tagore",
  "patel",
  "bhagat",
  "jallianwala",
  "republic",
  "independence",
];

const MARKETING_KEYWORDS = [
  "festival",
  "holiday",
  "observance",
  "sale",
  "season",
  "greeting",
  "customer",
  "business",
  "women",
  "yoga",
  "environment",
  "teacher",
  "mother",
  "father",
];

const MUST_INCLUDE_EVENT_IDS = ["independence-day", "republic-day", "ganesh-chaturthi", "diwali", "gandhi-jayanti", "ambedkar-jayanti"];

const WIKIMEDIA_PROBES = [
  { month: 1, day: 12, type: "births" },
  { month: 1, day: 30, type: "events" },
  { month: 4, day: 13, type: "events" },
  { month: 4, day: 14, type: "births" },
  { month: 8, day: 15, type: "events" },
  { month: 9, day: 5, type: "births" },
  { month: 10, day: 2, type: "births" },
  { month: 10, day: 31, type: "births" },
  { month: 11, day: 14, type: "births" },
];

const LOCAL_DYNAMIC_EVENTS = [
  {
    id: "independence-day",
    title: "Independence Day",
    fixedMonth: 8,
    fixedDay: 15,
    type: "National",
    importance: 98,
    tags: ["festival", "national", "seasonal", "greeting", "india"],
    visualClass: "from-orange-100 via-white to-emerald-100",
    accentClass: "bg-emerald-500",
  },
  {
    id: "republic-day",
    title: "Republic Day",
    fixedMonth: 1,
    fixedDay: 26,
    type: "National",
    importance: 96,
    tags: ["national", "india", "greeting"],
    visualClass: "from-orange-100 via-white to-emerald-100",
    accentClass: "bg-orange-500",
  },
  {
    id: "gandhi-jayanti",
    title: "Gandhi Jayanti",
    fixedMonth: 10,
    fixedDay: 2,
    type: "National",
    importance: 94,
    tags: ["national", "jayanti", "india", "gandhi"],
    visualClass: "from-emerald-50 via-white to-orange-100",
    accentClass: "bg-emerald-500",
  },
  {
    id: "ambedkar-jayanti",
    title: "Ambedkar Jayanti",
    fixedMonth: 4,
    fixedDay: 14,
    type: "Jayanti",
    importance: 88,
    tags: ["jayanti", "india", "ambedkar", "social"],
    visualClass: "from-blue-100 via-white to-indigo-100",
    accentClass: "bg-blue-500",
  },
  {
    id: "teachers-day",
    title: "Teachers' Day",
    fixedMonth: 9,
    fixedDay: 5,
    type: "Business",
    importance: 78,
    tags: ["teacher", "education", "business", "greeting"],
    visualClass: "from-cyan-100 via-white to-blue-100",
    accentClass: "bg-cyan-500",
  },
  {
    id: "customer-service-week",
    title: "Customer Service Week",
    dateByYear: { 2025: "2025-10-06", 2026: "2026-10-05", 2027: "2027-10-04" },
    type: "Business",
    importance: 68,
    tags: ["service", "reviews", "trust", "care", "business"],
    visualClass: "from-emerald-100 via-teal-50 to-cyan-100",
    accentClass: "bg-teal-500",
  },
  {
    id: "festive-sale-season",
    title: "Festive Sale Season",
    fixedMonth: 9,
    fixedDay: 1,
    type: "Campaign",
    importance: 66,
    tags: ["offer", "sale", "seasonal", "retail"],
    visualClass: "from-fuchsia-100 via-rose-50 to-orange-100",
    accentClass: "bg-fuchsia-500",
  },
  {
    id: "ganesh-chaturthi",
    title: "Ganesh Chaturthi",
    dateByYear: { 2025: "2025-08-27", 2026: "2026-09-14", 2027: "2027-09-04" },
    type: "Festival",
    importance: 90,
    tags: ["festival", "greeting", "seasonal", "ganesh"],
    visualClass: "from-amber-100 via-orange-50 to-rose-100",
    accentClass: "bg-amber-500",
  },
  {
    id: "diwali",
    title: "Diwali",
    dateByYear: { 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29" },
    type: "Festival",
    importance: 98,
    tags: ["festival", "sale", "discount", "seasonal", "diwali"],
    visualClass: "from-purple-100 via-amber-50 to-orange-100",
    accentClass: "bg-purple-500",
  },
  {
    id: "rakhi",
    title: "Rakhi",
    dateByYear: { 2025: "2025-08-09", 2026: "2026-08-28", 2027: "2027-08-17" },
    type: "Festival",
    importance: 82,
    tags: ["festival", "greeting", "seasonal", "rakhi"],
    visualClass: "from-pink-100 via-rose-50 to-amber-100",
    accentClass: "bg-rose-500",
  },
];

function logCalendarificError(error) {
  if (isAbortError(error)) return;
  if (import.meta.env?.DEV) {
    console.warn("[Marketing Studio] Calendarific unavailable:", error.message);
  }
}

function toDateIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCanonicalEventId(title) {
  const match = EVENT_ALIASES.find((entry) => entry.patterns.some((pattern) => pattern.test(title || "")));
  return match?.id || slugify(title);
}

function getDateParts(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return {
    year: date.getFullYear(),
    monthNumber: date.getMonth() + 1,
    day: date.getDate(),
    month: date.toLocaleString("en-IN", { month: "short" }),
    dateLabel: `${date.getDate()} ${date.toLocaleString("en-IN", { month: "short" })}`,
  };
}

function includesKeyword(value, keywords) {
  const searchable = String(value || "").toLowerCase();
  return keywords.some((keyword) => searchable.includes(keyword));
}

function getTemplateIdsForEvent(eventId) {
  return marketingTemplates
    .filter((template) => template.eventId === eventId || template.eventIds?.includes(eventId))
    .map((template) => template.id);
}

function getVisualsForEvent(eventId, type = "") {
  const local = [...localMarketingEvents, ...LOCAL_DYNAMIC_EVENTS].find((event) => event.id === eventId);
  if (local?.visualClass && local?.accentClass) return { visualClass: local.visualClass, accentClass: local.accentClass };

  if (/festival|religious/i.test(type)) {
    return { visualClass: "from-amber-100 via-orange-50 to-rose-100", accentClass: "bg-amber-500" };
  }

  if (/national|historical|remembrance/i.test(type)) {
    return { visualClass: "from-orange-100 via-white to-emerald-100", accentClass: "bg-emerald-500" };
  }

  return { visualClass: "from-slate-100 via-white to-blue-100", accentClass: "bg-blue-500" };
}

function createEvent(raw) {
  const id = raw.id || getCanonicalEventId(raw.title || raw.name);
  const title = raw.title || raw.name;
  const dateParts = getDateParts(raw.date);
  const templateIds = raw.templateIds ?? getTemplateIdsForEvent(id);
  const visuals = getVisualsForEvent(id, raw.type);

  return {
    id,
    title,
    name: title,
    date: raw.date,
    year: dateParts.year,
    month: dateParts.month,
    monthNumber: dateParts.monthNumber,
    day: dateParts.day,
    dateLabel: dateParts.dateLabel,
    type: raw.type || "Event",
    country: raw.country || "IN",
    region: raw.region || raw.country || "India",
    source: raw.source || "local",
    sources: raw.sources || [raw.source || "local"],
    importance: raw.importance ?? 50,
    indiaRelevant: raw.indiaRelevant ?? true,
    marketingRelevant: raw.marketingRelevant ?? true,
    image: raw.image || "",
    templateIds,
    templateCount: templateIds.length,
    tags: [...new Set([...(raw.tags || []), raw.type || "", id].filter(Boolean).map((tag) => String(tag).toLowerCase()))],
    description: raw.description || "",
    visualClass: raw.visualClass || visuals.visualClass,
    accentClass: raw.accentClass || visuals.accentClass,
  };
}

function normalizeCalendarificHoliday(holiday) {
  const name = holiday.name || "";
  const description = holiday.description || "";
  const typeList = Array.isArray(holiday.type) ? holiday.type : [holiday.type].filter(Boolean);
  const typeText = typeList.join(" ");
  const searchable = [name, description, typeText].join(" ");
  const id = getCanonicalEventId(name);
  const national = includesKeyword(typeText, ["national holiday", "government holiday"]);
  const religious = includesKeyword(searchable, ["hindu", "sikh", "jain", "buddhist", "muslim", "christian", "religious"]);
  const indiaRelevant = includesKeyword(searchable, IMPORTANT_KEYWORDS) || national || religious;
  const marketingRelevant = includesKeyword(searchable, MARKETING_KEYWORDS) || national || religious;

  if (!indiaRelevant && !marketingRelevant) return null;

  return createEvent({
    id,
    title: name,
    date: holiday.date?.iso,
    type: national ? "National" : religious ? "Festival" : typeList[0] || "Observance",
    country: "IN",
    region: "India",
    source: "calendarific",
    importance: national ? 95 : religious ? 86 : 62,
    indiaRelevant,
    marketingRelevant,
    description,
    tags: [name, ...typeList],
  });
}

function normalizeCuratedEvent(event, year) {
  const dynamic = LOCAL_DYNAMIC_EVENTS.find((item) => item.id === event.id);
  const date =
    dynamic?.dateByYear?.[year] ||
    (dynamic?.fixedMonth ? toDateIso(year, dynamic.fixedMonth, dynamic.fixedDay) : "") ||
    event.date ||
    "";

  if (!date) return null;

  return createEvent({
    ...event,
    ...dynamic,
    title: dynamic?.title || event.title || event.name,
    date,
    source: "local",
    country: "IN",
    region: event.region || "India",
    importance: dynamic?.importance ?? event.importance ?? 70,
    tags: [...(event.tags || []), ...(dynamic?.tags || [])],
  });
}

function getLocalEvents(year) {
  const existingIds = new Set(localMarketingEvents.map((event) => event.id));
  const supplemental = LOCAL_DYNAMIC_EVENTS.filter((event) => !existingIds.has(event.id));
  return [...localMarketingEvents, ...supplemental].map((event) => normalizeCuratedEvent(event, year)).filter(Boolean);
}

async function fetchCalendarificEvents(year, options = {}) {
  const cacheKey = `calendarific-IN-${year}`;
  const canUseCache = !options.signal;
  if (canUseCache && calendarCache.has(cacheKey)) return calendarCache.get(cacheKey);

  const request = fetch(`${API_BASE_URL}/api/marketing-studio/calendar-events?${new URLSearchParams({ year: String(year) })}`, {
    signal: options.signal,
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Calendarific backend request failed with ${response.status}.`);
      }
      const holidays = payload.holidays || [];
      return holidays.map(normalizeCalendarificHoliday).filter(Boolean);
    })
    .catch((error) => {
      calendarCache.delete(cacheKey);
      throw error;
    });

  if (canUseCache) {
    calendarCache.set(cacheKey, request);
  }
  return request;
}

function normalizeWikimediaEntry(entry, probe, year) {
  const title = entry.text || entry.pages?.[0]?.normalizedtitle || "";
  const pageTitle = entry.pages?.[0]?.title || "";
  const searchable = [title, pageTitle, entry.pages?.[0]?.description].join(" ");
  if (!includesKeyword(searchable, IMPORTANT_KEYWORDS)) return null;

  const eventTitle = getWikimediaMarketingTitle(searchable, probe);
  if (!eventTitle) return null;

  return createEvent({
    id: getCanonicalEventId(eventTitle),
    title: eventTitle,
    date: toDateIso(year, probe.month, probe.day),
    type: probe.type === "births" ? "Jayanti" : "Historical",
    country: "IN",
    region: "India",
    source: "wikimedia",
    importance: probe.type === "births" ? 72 : 78,
    indiaRelevant: true,
    marketingRelevant: true,
    description: title,
    tags: ["india", probe.type === "births" ? "jayanti" : "history", "observance"],
  });
}

function getWikimediaMarketingTitle(searchable, probe) {
  if (/ambedkar/i.test(searchable)) return "Ambedkar Jayanti";
  if (/mahatma gandhi|mohandas/i.test(searchable)) return probe.type === "births" ? "Gandhi Jayanti" : "Gandhi Remembrance Day";
  if (/jawaharlal nehru/i.test(searchable)) return "Nehru Jayanti";
  if (/vivekananda/i.test(searchable)) return "Vivekananda Jayanti";
  if (/sarvepalli|radhakrishnan/i.test(searchable)) return "Teachers' Day";
  if (/vallabhbhai|sardar patel/i.test(searchable)) return "Sardar Patel Jayanti";
  if (/independence/i.test(searchable)) return "Independence Day";
  if (/jallianwala/i.test(searchable)) return "Jallianwala Bagh Remembrance";
  return "";
}

async function fetchWikimediaProbe(probe, year, options = {}) {
  const month = String(probe.month).padStart(2, "0");
  const day = String(probe.day).padStart(2, "0");
  const cacheKey = `wikimedia-${probe.type}-${month}-${day}-${year}`;
  const canUseCache = !options.signal;
  if (canUseCache && wikimediaCache.has(cacheKey)) return wikimediaCache.get(cacheKey);

  const request = fetch(`${WIKIMEDIA_ON_THIS_DAY_ENDPOINT}/${probe.type}/${month}/${day}`, { signal: options.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Wikimedia request failed with ${response.status}.`);
      const payload = await response.json();
      const entries = payload[probe.type] || [];
      return entries.map((entry) => normalizeWikimediaEntry(entry, probe, year)).filter(Boolean);
    })
    .catch((error) => {
      wikimediaCache.delete(cacheKey);
      throw error;
    });

  if (canUseCache) {
    wikimediaCache.set(cacheKey, request);
  }
  return request;
}

async function fetchWikimediaEvents(year, options = {}) {
  const results = await Promise.allSettled(WIKIMEDIA_PROBES.map((probe) => fetchWikimediaProbe(probe, year, options)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function mergeEvents(eventGroups) {
  const merged = new Map();

  eventGroups.flat().forEach((event) => {
    const key = event.id || `${event.date}-${slugify(event.title)}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, event);
      return;
    }

    const sourcePriority = { calendarific: 3, local: 2, wikimedia: 1 };
    const preferred =
      (sourcePriority[event.source] || 0) > (sourcePriority[current.source] || 0) ||
      ((sourcePriority[event.source] || 0) === (sourcePriority[current.source] || 0) && event.importance > current.importance)
        ? event
        : current;
    const secondary = preferred === event ? current : event;

    merged.set(key, {
      ...preferred,
      templateIds: [...new Set([...(preferred.templateIds || []), ...(secondary.templateIds || [])])],
      templateCount: new Set([...(preferred.templateIds || []), ...(secondary.templateIds || [])]).size,
      tags: [...new Set([...(preferred.tags || []), ...(secondary.tags || [])])],
      sources: [...new Set([...(preferred.sources || [preferred.source]), ...(secondary.sources || [secondary.source])])],
      source: preferred.source,
      importance: Math.max(preferred.importance, secondary.importance),
      indiaRelevant: preferred.indiaRelevant || secondary.indiaRelevant,
      marketingRelevant: preferred.marketingRelevant || secondary.marketingRelevant,
      description: preferred.description || secondary.description,
    });
  });

  return [...merged.values()];
}

function getEventRank(event, today) {
  const eventDate = new Date(`${event.date}T00:00:00`);
  const daysFromToday = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
  const upcomingBoost = daysFromToday >= 0 ? Math.max(0, 120 - daysFromToday) : Math.max(-30, daysFromToday);
  const sourceBoost = event.source === "calendarific" ? 10 : event.source === "local" ? 6 : 3;
  const templateBoost = Math.min(event.templateCount * 4, 16);
  return event.importance + upcomingBoost + sourceBoost + templateBoost;
}

function rankAndLimitEvents(events, year) {
  const today = new Date();
  const relevantToday = today.getFullYear() === year ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(`${year}-01-01T00:00:00`);

  const rankedEvents = [...events]
    .filter((event) => event.date && event.indiaRelevant && event.marketingRelevant)
    .sort((a, b) => {
      const rankDelta = getEventRank(b, relevantToday) - getEventRank(a, relevantToday);
      if (rankDelta !== 0) return rankDelta;
      return new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`);
    });

  const selected = rankedEvents.slice(0, 24);
  MUST_INCLUDE_EVENT_IDS.forEach((id) => {
    if (!selected.some((event) => event.id === id)) {
      const requiredEvent = rankedEvents.find((event) => event.id === id);
      if (requiredEvent) selected.push(requiredEvent);
    }
  });

  return selected;
}

export function getLocalMarketingEvents(year = new Date().getFullYear()) {
  return rankAndLimitEvents(getLocalEvents(year), year);
}

export async function loadMarketingEvents(options = {}) {
  const year = options.year || new Date().getFullYear();
  const cacheKey = `marketing-events-${year}-${Boolean(options.forceFallback)}`;
  const canUseEventCache = !options.signal;
  if (canUseEventCache && !options.forceRefresh && eventCache.has(cacheKey)) return eventCache.get(cacheKey);

  const request = (async () => {
    const localEvents = getLocalEvents(year);

    if (options.forceFallback) {
      return {
        events: rankAndLimitEvents(localEvents, year),
        source: "local",
        fallbackUsed: true,
        calendarificSucceeded: false,
        wikimediaSucceeded: false,
        errors: ["External event sources skipped."],
      };
    }

    const [calendarificResult, wikimediaResult] = await Promise.allSettled([
      fetchCalendarificEvents(year, options),
      fetchWikimediaEvents(year, options),
    ]);

    const errors = [];
    const calendarificEvents = calendarificResult.status === "fulfilled" ? calendarificResult.value : [];
    const wikimediaEvents = wikimediaResult.status === "fulfilled" ? wikimediaResult.value : [];
    const calendarificSucceeded = calendarificResult.status === "fulfilled" && calendarificEvents.length > 0;
    const wikimediaSucceeded = wikimediaResult.status === "fulfilled";

    if (
      options.signal?.aborted ||
      (calendarificResult.status === "rejected" && isAbortError(calendarificResult.reason)) ||
      (wikimediaResult.status === "rejected" && isAbortError(wikimediaResult.reason))
    ) {
      throw createAbortError();
    }

    if (calendarificResult.status === "rejected") {
      logCalendarificError(calendarificResult.reason);
      errors.push(calendarificResult.reason.message);
    }
    if (wikimediaResult.status === "rejected") errors.push(wikimediaResult.reason.message);

    const events = rankAndLimitEvents(mergeEvents([calendarificEvents, wikimediaEvents, localEvents]), year);

    return {
      events,
      source: calendarificEvents.length ? "hybrid" : "local",
      fallbackUsed: !calendarificSucceeded,
      calendarificSucceeded,
      wikimediaSucceeded,
      errors,
    };
  })();

  if (canUseEventCache) {
    eventCache.set(cacheKey, request);
  }
  return request;
}

export const eventCalendarEndpoints = {
  calendarific: CALENDARIFIC_ENDPOINT,
  wikimediaOnThisDay: WIKIMEDIA_ON_THIS_DAY_ENDPOINT,
};
