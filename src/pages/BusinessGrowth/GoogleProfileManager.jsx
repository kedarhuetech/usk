// Implements the google profile manager page.
import { useEffect, useMemo, useState } from "react";
import {
  FiAlertCircle,
  FiCamera,
  FiCheckCircle,
  FiCopy,
  FiDownload,
  FiEye,
  FiGlobe,
  FiImage,
  FiMapPin,
  FiMessageCircle,
  FiNavigation,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiStar,
  FiLock,
  FiEdit2,
  FiClock,
  FiStar as FiSparkles,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import {
  googleProfileDateRanges,
  googleProfileMock,
  googleProfileNav,
} from "../../constants/googleProfileData";
import { API_BASE_URL } from "../../services/apiClient";
import { googleProfileService } from "../../services/googleProfileService";

const toneClasses = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  cyan: "bg-cyan-50 text-cyan-600",
};

const metricIcons = {
  views: FiEye,
  rating: FiStar,
  reviews: FiMessageCircle,
  calls: FiPhone,
  directions: FiNavigation,
};

const defaultDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Renders the state switch interface.
function StateSwitch({ status, setStatus }) {
  const states = [
    "disconnected",
    "unverified",
    "connected",
    "loading",
    "empty",
    "error",
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 text-xs">
      {states.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setStatus(item)}
          className={`rounded-md px-2.5 py-1.5 font-semibold capitalize ${
            status === item
              ? "bg-blue-600 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

// Renders the page header interface.
function PageHeader({ status, setStatus, connected, onRefresh }) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800">
            Google Profile Manager
          </h1>
          {connected && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Verified & Synced
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Manage local visibility, reviews, photos, and profile details from one
          place.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StateSwitch status={status} setStatus={setStatus} />
        <button
          type="button"
          onClick={onRefresh}
          className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          title="Refresh sync"
        >
          <FiRefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <FiSettings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

// Renders the access denied state interface.
function AccessDeniedState({ userEmail, onRetry }) {
  return (
    <div className="grid min-h-[calc(100vh-184px)] place-items-center bg-slate-50 p-4">
      <Card className="max-w-md p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <FiLock className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">
          Google Business Verification Required
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The email{" "}
          <strong className="text-slate-800">
            {userEmail || "current account"}
          </strong>{" "}
          is either a personal Gmail or not an authorized manager of a verified
          Google Business listing.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Only verified Google Business profiles can access management,
          insights, and review replies.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={() => {
              window.location.href = `${API_BASE_URL}/api/auth/google?prompt=select_account`;
            }}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Switch to Google Business Email
          </Button>
          <Button
            onClick={onRetry}
            className="w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Recheck Verification Status
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Renders the disconnected state interface.
function DisconnectedState({ setStatus }) {
  // Handles connect google.
  const handleConnectGoogle = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  return (
    <div className="grid min-h-[calc(100vh-184px)] place-items-center bg-slate-50 p-4">
      <Card className="w-full max-w-4xl overflow-hidden shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
          <div className="p-6 sm:p-8">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FiGlobe className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Connect your Google Business Profile
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Connect your verified Google Business Gmail to monitor
              performance, respond to customer reviews, and keep details synced.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={handleConnectGoogle}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Connect Google Business
              </Button>
              <Button className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                Switch Account
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setStatus("connected")}
              className="mt-5 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              View demo verified dashboard
            </button>
          </div>
          <div className="border-t border-slate-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">
                  Verification Gate
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                  Protected
                </span>
              </div>
              {[
                "Verified Listing Check",
                "Owner / Manager Rights",
                "Direct Review Sync",
                "Live Profile Updates",
              ].map((item) => (
                <div
                  key={item}
                  className="mb-3 flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3"
                >
                  <FiCheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Renders the status state interface.
function StatusState({ type, setStatus }) {
  const content = {
    loading: [
      "Verifying Google Business Status",
      "Checking business verification and syncing profile metrics...",
    ],
    empty: [
      "No Business Profile Found",
      "Your Google account is valid, but has no verified business profile attached.",
    ],
    error: [
      "Google Connection Error",
      "Unable to establish handshake with Google Business API.",
    ],
  }[type] || ["Processing...", "Please wait."];

  return (
    <div className="grid min-h-[calc(100vh-184px)] place-items-center bg-slate-50 p-4">
      <Card className="max-w-lg p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <FiAlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">{content[0]}</h2>
        <p className="mt-2 text-sm text-slate-500">{content[1]}</p>
        <Button
          onClick={() => setStatus("connected")}
          className="mt-5 bg-blue-600 text-white hover:bg-blue-700"
        >
          View Demo Dashboard
        </Button>
      </Card>
    </div>
  );
}

// Renders the profile bar interface.
function ProfileBar({ profile, dateRange, setDateRange }) {
  return (
    <section className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-bold text-slate-800">
            {profile.name}
          </h2>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {profile.category}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />{" "}
            {profile.status}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <FiMapPin className="h-4 w-4" /> {profile.location}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
        Range
        <select
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value)}
          className="h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-400"
        >
          {googleProfileDateRanges.map((range) => (
            <option key={range}>{range}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

// Renders the section nav interface.
function SectionNav({ active, setActive }) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
      {googleProfileNav.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setActive(item.id)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
            active === item.id
              ? "bg-[#1A1F71] text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// Renders the metric grid interface.
function MetricGrid({ metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => {
        const Icon = metricIcons[metric.id] || FiEye;
        return (
          <Card key={metric.id} className="p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {metric.value}
                </p>
              </div>
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${toneClasses[metric.tone]}`}
              >
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">
              {metric.trend}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

// Renders the performance card interface.
function PerformanceCard({ data }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800">
          Google Presence Performance
        </h3>
        <span className="text-xs font-semibold text-slate-400">
          Verified Insights
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="relative h-64 rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="absolute inset-x-4 top-8 border-t border-slate-200" />
          <div className="absolute inset-x-4 top-24 border-t border-slate-200" />
          <div className="absolute inset-x-4 top-40 border-t border-slate-200" />
          <div className="absolute inset-x-4 bottom-10 border-t border-blue-400" />
          <div className="relative flex h-full items-end justify-between gap-2 pt-4">
            {data.labels.map((label, index) => (
              <div
                key={label}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className={`w-full max-w-10 rounded-t bg-blue-500/70 ${data.barHeights[index]}`}
                />
                <span className="text-[11px] text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-3">
          {data.series.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-100 bg-white p-3"
            >
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-semibold text-slate-700">
                  {item.label}
                </span>
                <span className="font-bold text-slate-900">{item.value}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-blue-500 ${item.widthClass}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// Renders the reputation card interface.
function ReputationCard({ reputation }) {
  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-base font-bold text-slate-800">
        Reputation Overview
      </h3>
      <div className="mt-4 grid gap-5 md:grid-cols-[160px_1fr]">
        <div className="rounded-xl bg-amber-50 p-4 text-center">
          <p className="text-3xl font-bold text-slate-900">
            {Number(reputation.averageRating).toFixed(1)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase text-amber-600">
            Average Rating
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {reputation.totalReviews} reviews
          </p>
        </div>
        <div className="space-y-2">
          {reputation.distribution.map((item) => (
            <div
              key={item.stars}
              className="grid grid-cols-[64px_1fr_28px] items-center gap-3 text-sm"
            >
              <span className="font-medium text-slate-600">
                {item.stars} stars
              </span>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-amber-400 ${item.widthClass}`}
                />
              </div>
              <span className="text-right font-semibold text-slate-700">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// Renders the overview interface.
function Overview({ data }) {
  return (
    <div className="space-y-3">
      <MetricGrid metrics={data.metrics} />
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <PerformanceCard data={data.performance} />
        <ReputationCard reputation={data.reputation} />
      </div>
    </div>
  );
}

// Renders the reviews interface.
function Reviews({ reviews, onReply }) {
  const [replyId, setReplyId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handles send reply.
  const handleSendReply = async (reviewId) => {
    if (!replyText.trim()) return;
    setIsSubmitting(true);
    try {
      await onReply(reviewId, replyText);
      setReplyId("");
      setReplyText("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800">Customer Reviews</h3>
        <span className="text-sm font-semibold text-slate-500">
          {reviews.length} reviews
        </span>
      </div>
      {reviews.length ? (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="rounded-lg border border-slate-100 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {review.reviewer?.[0] || "U"}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {review.reviewer}
                    </p>
                    <p className="text-xs text-slate-500">{review.date}</p>
                  </div>
                </div>
                <div className="flex text-amber-400">
                  {Array.from({ length: review.rating }).map((_, index) => (
                    <FiStar key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{review.text}</p>
              {review.reply && (
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="text-xs font-bold text-blue-600 uppercase">
                    Response from business
                  </p>
                  <p className="mt-1">{review.reply}</p>
                </div>
              )}
              {replyId === review.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="h-20 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
                    placeholder="Write an official Google reply..."
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleSendReply(review.id)}
                      disabled={isSubmitting}
                      className="bg-blue-600 px-4 py-2 text-white"
                    >
                      {isSubmitting ? "Publishing..." : "Publish to Google"}
                    </Button>
                    <Button
                      onClick={() => setReplyId("")}
                      className="border border-slate-200 bg-white px-4 py-2 text-slate-600"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                !review.reply && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyId(review.id);
                      setReplyText("");
                    }}
                    className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Reply as Owner
                  </button>
                )
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No reviews yet"
          text="Verified reviews from Google will appear here."
        />
      )}
    </Card>
  );
}

// Renders the photos interface.
function Photos({ photos, onAddPhoto }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">
            Photo Management
          </h3>
          <p className="text-sm text-slate-500">
            {photos.length} photos published.
          </p>
        </div>
        <Button
          onClick={onAddPhoto}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <FiPlus /> Add Photo
        </Button>
      </div>
      {photos.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-lg border border-slate-100 p-3"
            >
              <div className="grid aspect-[4/3] place-items-center rounded-lg bg-slate-100 text-slate-400 overflow-hidden">
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={photo.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FiImage className="h-8 w-8" />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{photo.title}</p>
                  <p className="text-xs text-slate-500">{photo.type}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                  {photo.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="No photos yet"
          text="Upload business and store photos to your profile."
        />
      )}
    </Card>
  );
}

// Renders the review qr interface.
function ReviewQr({ qr }) {
  // Handles copy.
  const handleCopy = () => {
    if (qr?.reviewLink) navigator.clipboard.writeText(qr.reviewLink);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="p-4 shadow-sm">
        <h3 className="text-base font-bold text-slate-800">Smart Review QR</h3>
        <div className="mt-4 grid gap-3">
          <label className="text-sm font-semibold text-slate-600">
            Business Name
            <input
              value={qr.businessName}
              readOnly
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none bg-slate-50"
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            Review Link
            <input
              value={qr.reviewLink}
              readOnly
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none bg-slate-50"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCopy}
              className="border border-slate-200 bg-white text-slate-700"
            >
              <FiCopy /> Copy Link
            </Button>
            <Button className="border border-slate-200 bg-white text-slate-700">
              <FiDownload /> Download QR
            </Button>
          </div>
        </div>
      </Card>
      <Card className="grid place-items-center p-5 text-center shadow-sm">
        <div className="grid h-44 w-44 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
          <div className="grid h-28 w-28 grid-cols-5 gap-1">
            {Array.from({ length: 25 }).map((_, index) => (
              <span
                key={index}
                className={`rounded-sm ${index % 3 === 0 ? "bg-slate-900" : "bg-slate-300"}`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">Scan to Review</p>
      </Card>
    </div>
  );
}

// business details: matching design specification from UI screenshots
function BusinessDetails({ details, profile, onSave }) {
  const [form, setForm] = useState(() => ({
    businessName: details?.businessName || "",
    primaryCategory: details?.primaryCategory || "",
    openingDate: details?.openingDate || "",
    description: details?.description || "",
    phoneNumber: details?.phoneNumber || "",
    website: details?.website || "",
    address: details?.address || "",
    // business details: Google Business standard regularHours periods
    businessHours:
      Array.isArray(details?.businessHours) && details.businessHours.length
        ? details.businessHours
        : defaultDays.map((d) => ({
            day: d,
            open: "09:00",
            close: "18:00",
            isClosed: false,
          })),
  }));

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: "", isError: false });

  // business details: keep state synced dynamically with server/Google updates
  useEffect(() => {
    if (details) {
      setForm({
        businessName: details.businessName || "",
        primaryCategory: details.primaryCategory || "",
        openingDate: details.openingDate || "",
        description: details.description || "",
        phoneNumber: details.phoneNumber || "",
        website: details.website || "",
        address: details.address || "",
        businessHours:
          Array.isArray(details.businessHours) && details.businessHours.length
            ? details.businessHours
            : defaultDays.map((d) => ({
                day: d,
                open: "09:00",
                close: "18:00",
                isClosed: false,
              })),
      });
    }
  }, [details]);

  // business details: day-to-day opening/closing changes handler
  const handleHourChange = (index, field, value) => {
    setForm((prev) => {
      const nextHours = [...prev.businessHours];
      nextHours[index] = { ...nextHours[index], [field]: value };
      return { ...prev, businessHours: nextHours };
    });
  };

  // business details: submit sync to Google Business profile via API
  const handleSaveAll = async () => {
    setIsSaving(true);
    setSaveMessage({ text: "", isError: false });
    try {
      await onSave(form);
      setSaveMessage({
        text: "Business details successfully synced with Google.",
        isError: false,
      });
      setIsEditingInfo(false);
      setIsEditingDesc(false);
      setIsEditingContact(false);
      setIsEditingHours(false);
    } catch (err) {
      setSaveMessage({
        text: err.message || "Failed to sync updates to Google.",
        isError: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* business details: Section 1 - Business Information */}
      <Card className="p-6 shadow-sm border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">
              Business Information
            </h3>
            <button
              type="button"
              onClick={() => setIsEditingInfo(!isEditingInfo)}
              className="text-rose-500 hover:text-rose-600 transition"
              title="Edit Business Information"
            >
              <FiEdit2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-slate-400">
                Profile completeness
              </span>
              <p className="text-sm font-bold text-slate-800">
                {profile?.completeness || 72}%
              </p>
            </div>
            <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full bg-emerald-500 ${profile?.completenessClass || "w-[72%]"}`}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-400">
              Business Name
            </p>
            {isEditingInfo ? (
              <input
                type="text"
                value={form.businessName}
                onChange={(e) =>
                  setForm({ ...form, businessName: e.target.value })
                }
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {form.businessName || "Not provided"}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">
              Business Category
            </p>
            {isEditingInfo ? (
              <input
                type="text"
                value={form.primaryCategory}
                onChange={(e) =>
                  setForm({ ...form, primaryCategory: e.target.value })
                }
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {form.primaryCategory || "Not provided"}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">Opening Date</p>
            {isEditingInfo ? (
              <input
                type="date"
                value={form.openingDate}
                onChange={(e) =>
                  setForm({ ...form, openingDate: e.target.value })
                }
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {form.openingDate || "2019-02-06"}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* business details: Section 2 - Description & AI Assist */}
      <Card className="p-6 shadow-sm border border-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">Description</h3>
            <button
              type="button"
              onClick={() => setIsEditingDesc(!isEditingDesc)}
              className="text-rose-500 hover:text-rose-600 transition"
              title="Edit Description"
            >
              <FiEdit2 className="h-4 w-4" />
            </button>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <FiSparkles className="h-3 w-3" /> AI Assist Available
            </span>
          </div>
        </div>

        {isEditingDesc ? (
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-md border border-slate-200 p-3 text-sm focus:border-blue-400 outline-none"
          />
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">
            {form.description ||
              "No business description provided. Add a description to help customers discover your listing on Google Search and Maps."}
          </p>
        )}
      </Card>

      {/* business details: Section 3 - Contact Information */}
      <Card className="p-6 shadow-sm border border-slate-200">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-800">
            Contact Information
          </h3>
          <button
            type="button"
            onClick={() => setIsEditingContact(!isEditingContact)}
            className="text-rose-500 hover:text-rose-600 transition"
            title="Edit Contact"
          >
            <FiEdit2 className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-400">Phone Number</p>
            {isEditingContact ? (
              <input
                type="text"
                value={form.phoneNumber}
                onChange={(e) =>
                  setForm({ ...form, phoneNumber: e.target.value })
                }
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {form.phoneNumber || "Add Phone"}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400">Website</p>
            {isEditingContact ? (
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 outline-none"
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-slate-800">
                {form.website || "Add Website"}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* business details: Section 4 - Business Hours (7 Days) */}
      <Card className="p-6 shadow-sm border border-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">
              Business Hours
            </h3>
            <button
              type="button"
              onClick={() => setIsEditingHours(!isEditingHours)}
              className="text-rose-500 hover:text-rose-600 transition"
              title="Edit Business Hours"
            >
              <FiEdit2 className="h-4 w-4" />
            </button>
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <FiClock className="h-3.5 w-3.5" /> Syncs to Google regularHours
          </span>
        </div>

        <div className="space-y-3">
          {form.businessHours.map((item, index) => (
            <div
              key={item.day}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 pb-2.5 text-sm"
            >
              <div className="w-16 font-semibold text-slate-700">
                {item.day}
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={item.isClosed}
                    disabled={!isEditingHours}
                    onChange={(e) =>
                      handleHourChange(index, "isClosed", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Closed
                </label>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">Opens At</span>
                  <input
                    type="time"
                    value={item.open || "09:00"}
                    disabled={!isEditingHours || item.isClosed}
                    onChange={(e) =>
                      handleHourChange(index, "open", e.target.value)
                    }
                    className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 outline-none"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">Closes At</span>
                  <input
                    type="time"
                    value={item.close || "18:00"}
                    disabled={!isEditingHours || item.isClosed}
                    onChange={(e) =>
                      handleHourChange(index, "close", e.target.value)
                    }
                    className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* business details: Save CTA */}
      {(isEditingInfo ||
        isEditingDesc ||
        isEditingContact ||
        isEditingHours) && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 shadow-sm"
          >
            {isSaving ? "Saving to Google..." : "Save Business Details"}
          </Button>
          <Button
            onClick={() => {
              setIsEditingInfo(false);
              setIsEditingDesc(false);
              setIsEditingContact(false);
              setIsEditingHours(false);
            }}
            className="border border-slate-200 bg-white px-4 py-2 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Button>
        </div>
      )}

      {saveMessage.text && (
        <p
          role="status"
          className={`text-sm ${saveMessage.isError ? "text-rose-600" : "text-emerald-600"}`}
        >
          {saveMessage.text}
        </p>
      )}
    </div>
  );
}

// Renders the empty panel interface.
function EmptyPanel({ title, text }) {
  return (
    <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <div>
        <FiCamera className="mx-auto h-8 w-8 text-slate-300" />
        <h4 className="mt-3 font-bold text-slate-800">{title}</h4>
        <p className="mt-1 text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}

// Renders the connected dashboard interface.
function ConnectedDashboard({ data, onSave, onReply, onAddPhoto }) {
  const [active, setActive] = useState("overview");
  const [dateRange, setDateRange] = useState("Last 30 Days");

  const activeView = useMemo(() => {
    switch (active) {
      case "reviews":
        return <Reviews reviews={data.reviews} onReply={onReply} />;
      case "photos":
        return <Photos photos={data.photos} onAddPhoto={onAddPhoto} />;
      case "qr":
        return <ReviewQr qr={data.qr} />;
      // business details: tab activation and handler binding
      case "details":
        return (
          <BusinessDetails
            details={data.businessDetails}
            profile={data.profile}
            onSave={onSave}
          />
        );
      default:
        return <Overview data={data} />;
    }
  }, [active, data, onSave, onReply, onAddPhoto]);

  return (
    <>
      <ProfileBar
        profile={data.profile}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />
      <SectionNav active={active} setActive={setActive} />
      <main className="space-y-3 bg-slate-100 p-3">{activeView}</main>
    </>
  );
}

// Renders the google profile manager interface.
function GoogleProfileManager() {
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(googleProfileMock);
  const [profileError, setProfileError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  // Verifies and load data.
  const verifyAndLoadData = async () => {
    setStatus("loading");
    setProfileError("");

    const authCheck = await googleProfileService.verifyGoogleBusinessAccount();
    if (!authCheck.allowed) {
      if (authCheck.reason === "unverified_business") {
        setUnverifiedEmail(authCheck.email || "");
        setStatus("unverified");
        return;
      }
      setStatus("disconnected");
      return;
    }

    try {
      const profileData = await googleProfileService.getProfile();
      setData(profileData);
      setStatus("connected");
    } catch (error) {
      setStatus("error");
      setProfileError(
        error.message || "Failed to load Google Business Profile",
      );
    }
  };

  useEffect(() => {
    verifyAndLoadData();
  }, []);

  // business details: update handler that sets state and calls API
  const handleSaveProfile = async (businessDetails) => {
    const updated = {
      ...data,
      businessDetails,
      profile: {
        ...data.profile,
        name: businessDetails.businessName,
        category: businessDetails.primaryCategory,
        location: businessDetails.address,
      },
    };
    await googleProfileService.saveBusinessDetails(updated);
    setData(updated);
  };

  // Handles reply review.
  const handleReplyReview = async (reviewId, replyText) => {
    await googleProfileService.postReviewReply(reviewId, replyText);
    setData((prev) => ({
      ...prev,
      reviews: prev.reviews.map((r) =>
        r.id === reviewId ? { ...r, reply: replyText, replied: true } : r,
      ),
    }));
  };

  // Handles add photo.
  const handleAddPhoto = async () => {
    const newPhoto = {
      id: `photo-${Date.now()}`,
      title: "Store Update",
      type: "Exterior",
      status: "Ready",
      url: "",
    };
    setData((prev) => ({
      ...prev,
      photos: [newPhoto, ...prev.photos],
    }));
  };

  const connected = status === "connected";

  return (
    <div className="min-h-full bg-slate-100">
      <PageHeader
        status={status}
        setStatus={setStatus}
        connected={connected}
        onRefresh={verifyAndLoadData}
      />
      {profileError && (
        <p role="alert" className="bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {profileError}
        </p>
      )}
      {status === "disconnected" && <DisconnectedState setStatus={setStatus} />}
      {status === "unverified" && (
        <AccessDeniedState
          userEmail={unverifiedEmail}
          onRetry={verifyAndLoadData}
        />
      )}
      {["loading", "empty", "error"].includes(status) && (
        <StatusState type={status} setStatus={setStatus} />
      )}
      {connected && (
        <ConnectedDashboard
          data={data}
          onSave={handleSaveProfile}
          onReply={handleReplyReview}
          onAddPhoto={handleAddPhoto}
        />
      )}
    </div>
  );
}

export default GoogleProfileManager;
