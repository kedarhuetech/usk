const TOAST_EVENT = "app:show_toast";
let toastCounter = 0;

export { TOAST_EVENT };

/**
 * Imperative toast triggers that can be called from anywhere
 * (components, hooks, event handlers, service functions).
 */
export const toast = {
  success(message, options = {}) {
    this.show({ type: "success", message, ...options });
  },
  error(message, options = {}) {
    this.show({ type: "error", message, ...options });
  },
  warning(message, options = {}) {
    this.show({ type: "warning", message, ...options });
  },
  info(message, options = {}) {
    this.show({ type: "info", message, ...options });
  },
  show(toastData) {
    if (typeof window === "undefined") return;
    const event = new CustomEvent(TOAST_EVENT, {
      detail: {
        id: `toast-${Date.now()}-${++toastCounter}`,
        duration: toastData.duration ?? 4500,
        ...toastData,
      },
    });
    window.dispatchEvent(event);
  },
};

