import test from "node:test";
import assert from "node:assert/strict";

// Setup browser globals for Node.js test environment
const storage = {};
const events = [];
globalThis.window = {
  localStorage: {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  dispatchEvent: (event) => {
    events.push(event);
    return true;
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(name, init) {
    this.name = name;
    this.detail = init?.detail;
  }
};

const { toast, TOAST_EVENT } = await import("./toastDispatcher.js");
const { getReminderSettings, saveReminderSettings } = await import("../../services/serviceRemindersStorage.js");
const {
  buildEmailReminder,
  buildWhatsAppReminder,
  sendServiceReminderViaMeta,
} = await import("../../services/serviceRemindersService.js");

test("UI Button Testing: Toast Dispatcher and Button Actions", () => {
  events.length = 0;

  // 1. Test clicking a button that triggers toast.success
  toast.success("Settings saved successfully!", { title: "Success" });
  assert.equal(events.length, 1);
  assert.equal(events[0].name, TOAST_EVENT);
  assert.equal(events[0].detail.type, "success");
  assert.equal(events[0].detail.message, "Settings saved successfully!");

  // 2. Test clicking a button that triggers toast.error with an action button
  let actionClicked = false;
  toast.error("Template not approved in Meta", {
    title: "Meta WhatsApp",
    action: {
      label: "Request Approval",
      onClick: () => { actionClicked = true; },
    },
  });
  assert.equal(events.length, 2);
  assert.equal(events[1].detail.type, "error");
  assert.ok(events[1].detail.action);
  assert.equal(events[1].detail.action.label, "Request Approval");

  // Click the toast's action button
  events[1].detail.action.onClick();
  assert.equal(actionClicked, true);
});

test("UI Button Testing: Service Reminders Email & WhatsApp Click Actions", async () => {
  const sampleRecord = {
    id: "sr-101",
    customerName: "Ramesh Sharma",
    customerPhone: "9876543210",
    customerEmail: "ramesh@example.com",
    serviceName: "AC Periodic Service",
    dueDate: "2026-11-20",
    invoiceNumber: "INV-2026-001",
  };

  // 1. WhatsApp Action Button Click
  const waResult = buildWhatsAppReminder(sampleRecord);
  assert.ok(waResult.url.startsWith("https://wa.me/919876543210"));
  assert.ok(waResult.message.includes("AC Periodic Service"));

  // 2. Email Action Button Click (Gmail Web & Mailto)
  const emailResult = buildEmailReminder(sampleRecord);
  assert.ok(emailResult.gmailUrl.includes("mail.google.com"));
  assert.ok(emailResult.gmailUrl.includes("to=ramesh%40example.com"));
  assert.ok(emailResult.mailtoUrl.startsWith("mailto:ramesh@example.com?"));
  assert.ok(emailResult.subject.includes("Service Due Date Reminder"));

  // 3. Meta Cloud API Send Click - Handles unapproved template gracefully
  const metaResult = await sendServiceReminderViaMeta(sampleRecord);
  assert.equal(metaResult.success, false);
  assert.ok(metaResult.fallbackUrl.startsWith("https://wa.me/"));
});

test("UI Button Testing: Settings Persistence & Reset Buttons", () => {
  const initialSettings = getReminderSettings();
  assert.equal(initialSettings.enabled, true);

  // Click Save Settings button with modified value
  const updated = saveReminderSettings({ ...initialSettings, reminderDaysBefore: 5 });
  assert.equal(updated.reminderDaysBefore, 5);

  const retrieved = getReminderSettings();
  assert.equal(retrieved.reminderDaysBefore, 5);
});
