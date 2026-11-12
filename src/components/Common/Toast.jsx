import React, { useState, useEffect } from "react";
import {
  FiCheckCircle,
  FiAlertCircle,
  FiAlertTriangle,
  FiInfo,
  FiX,
} from "react-icons/fi";
import { toast, TOAST_EVENT } from "./toastDispatcher.js";

export { toast };

const ICONS = {
  success: FiCheckCircle,
  error: FiAlertCircle,
  warning: FiAlertTriangle,
  info: FiInfo,
};

const STYLES = {
  success: {
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    iconBg: "text-emerald-600 bg-emerald-100",
    barBg: "bg-emerald-500",
  },
  error: {
    bg: "bg-rose-50 border-rose-200 text-rose-900",
    iconBg: "text-rose-600 bg-rose-100",
    barBg: "bg-rose-500",
  },
  warning: {
    bg: "bg-amber-50 border-amber-200 text-amber-900",
    iconBg: "text-amber-600 bg-amber-100",
    barBg: "bg-amber-500",
  },
  info: {
    bg: "bg-blue-50 border-blue-200 text-blue-900",
    iconBg: "text-blue-600 bg-blue-100",
    barBg: "bg-blue-500",
  },
};

/**
 * Toast Container component that renders active toast notifications.
 * Mount this once in your App root.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const newToast = e.detail;
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, newToast.duration);
      }
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[99999] flex max-w-md w-full flex-col gap-2.5 pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((item) => {
        const IconComponent = ICONS[item.type] || FiInfo;
        const style = STYLES[item.type] || STYLES.info;

        return (
          <div
            key={item.id}
            role="alert"
            className={`pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-xl border shadow-lg backdrop-blur-xs transition-all duration-200 animate-in slide-in-from-top-3 fade-in ${style.bg}`}
          >
            <div className="flex items-start gap-3 p-3.5">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}
              >
                <IconComponent className="h-4 w-4" />
              </div>

              <div className="flex-1 pt-0.5">
                {item.title && (
                  <h4 className="text-xs font-bold capitalize leading-tight mb-0.5">
                    {item.title}
                  </h4>
                )}
                <p className="text-xs font-medium leading-relaxed whitespace-pre-line">
                  {item.message}
                </p>

                {item.action && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          item.action.onClick?.();
                        } finally {
                          removeToast(item.id);
                        }
                      }}
                      className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold shadow-xs border border-slate-300 hover:bg-slate-50 transition active:scale-98"
                    >
                      {item.action.label}
                    </button>
                    {item.action.secondaryLabel && (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            item.action.onSecondaryClick?.();
                          } finally {
                            removeToast(item.id);
                          }
                        }}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
                      >
                        {item.action.secondaryLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeToast(item.id)}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-black/5 hover:text-slate-700 transition"
                aria-label="Close notification"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar animation */}
            {item.duration > 0 && (
              <div className="h-0.5 w-full bg-black/5">
                <div
                  className={`h-full ${style.barBg}`}
                  style={{
                    animation: `toast-progress ${item.duration}ms linear forwards`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Standalone modern Confirm Dialog Modal that replaces native window.confirm.
 */
export function ConfirmModal({
  isOpen,
  title = "Are you sure?",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger", // "danger" | "primary" | "emerald"
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const toneBtnStyles = {
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    emerald: "bg-emerald-600 hover:bg-emerald-700 text-white",
  };

  const toneIconStyles = {
    danger: "bg-rose-100 text-rose-600",
    primary: "bg-blue-100 text-blue-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneIconStyles[tone] || toneIconStyles.primary}`}
          >
            <FiAlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold shadow-xs transition ${toneBtnStyles[tone] || toneBtnStyles.primary}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
