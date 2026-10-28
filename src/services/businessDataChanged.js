// Shared same-tab notification for changes to locally saved business records.
export const businessDataChangedEvent = "ledgerly:business-data-changed";

export function notifyBusinessDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(businessDataChangedEvent));
  }
}
