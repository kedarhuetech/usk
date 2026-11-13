import test from "node:test";
import assert from "node:assert/strict";
import {
  formatReminderMessage,
  buildWhatsAppReminder,
  buildEmailReminder,
  recordReminderNotification,
  sendServiceReminderViaMeta,
  autoDispatchDueRemindersViaMeta,
} from "./serviceRemindersService.js";
import {
  saveReminderRecord,
  getReminderRecords,
  deleteReminderRecord,
  saveReminderSettings,
} from "./serviceRemindersStorage.js";

// Mock localStorage for node environment
const memoryStore = {};
global.window = {
  localStorage: {
    getItem: (key) => memoryStore[key] || null,
    setItem: (key, val) => { memoryStore[key] = String(val); },
    removeItem: (key) => { delete memoryStore[key]; },
    clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
  },
  dispatchEvent: () => {},
};

test("1. formatReminderMessage replaces all placeholders accurately", () => {
  const record = {
    customerName: "Ramesh Sharma",
    serviceName: "RO Water Purifier AMC",
    serviceDueDate: "2026-11-20",
  };
  const msg = formatReminderMessage(record, "Sai Kirana Stores");
  assert.match(msg, /Ramesh Sharma/);
  assert.match(msg, /Sai Kirana Stores/);
  assert.match(msg, /RO Water Purifier AMC/);
  assert.match(msg, /20\/11\/2026|2026-11-20/);
});

test("2. buildWhatsAppReminder creates valid wa.me URL with phone formatting", () => {
  const record = {
    customerName: "Pooja Patel",
    customerPhone: "9876543210",
    serviceName: "Car General Service",
    serviceDueDate: "2026-11-25",
  };
  const res = buildWhatsAppReminder(record, "Sai Kirana Stores");
  assert.equal(res.success, true);
  assert.equal(res.phone, "919876543210");
  assert.match(res.url, /^https:\/\/wa\.me\/919876543210\?text=/);
});

test("3. buildEmailReminder creates valid mailto link", () => {
  const record = {
    customerName: "Vikram Singh",
    customerEmail: "vikram@example.com",
    serviceName: "Air Conditioner Annual Servicing",
    serviceDueDate: "2026-11-18",
  };
  const res = buildEmailReminder(record, "Sai Kirana Stores");
  assert.equal(res.success, true);
  assert.equal(res.email, "vikram@example.com");
  assert.match(res.url, /^mailto:vikram@example\.com\?subject=/);
});

test("4. recordReminderNotification stores exact message text and notification history", () => {
  const saved = saveReminderRecord({
    customerName: "Anita Roy",
    customerPhone: "9123456780",
    serviceName: "Solar Inverter Checkup",
    serviceDueDate: "2026-11-15",
  });

  const updated = recordReminderNotification(saved.id, "meta_whatsapp", {
    message: "Dear Anita, your solar checkup is due on 2026-11-15.",
    recipient: "919123456780",
    messageId: "wamid.123456",
  });

  assert.equal(updated.lastNotifiedChannel, "meta_whatsapp");
  assert.equal(updated.lastNotifiedMessage, "Dear Anita, your solar checkup is due on 2026-11-15.");
  assert.equal(updated.notificationHistory.length, 1);
  assert.equal(updated.notificationHistory[0].recipient, "919123456780");
  assert.equal(updated.notificationHistory[0].messageId, "wamid.123456");

  // Clean up
  deleteReminderRecord(saved.id);
});

test("5. sendServiceReminderViaMeta handles unapproved/absent template error gracefully with fallback", async () => {
  const record = {
    id: "test-rec-1",
    customerName: "Amit Kumar",
    customerPhone: "9876500000",
    serviceName: "Generator AMC",
    serviceDueDate: "2026-11-22",
  };

  // Mock global fetch to simulate Meta API returning template absent error
  let sentPayload = null;
  global.fetch = async (url, options) => {
    if (url === "/api/whatsapp-business/send") {
      sentPayload = JSON.parse(options.body);
      return {
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          templateAbsent: true,
          templateRequested: true,
          templateStatus: "PENDING",
          message: "Template service_reminder_alert was absent, so an approval request has been sent to Meta.",
        }),
      };
    }
    return { ok: false };
  };

  const result = await sendServiceReminderViaMeta(record, "Sai Kirana Stores");

  // Verify that templateName and requireApprovedTemplate were strictly enforced
  assert.equal(sentPayload.templateName, "service_reminder_alert");
  assert.equal(sentPayload.requireApprovedTemplate, true);
  assert.equal(sentPayload.recipientPhone, "919876500000");

  // Verify sendServiceReminderViaMeta reported failure without stamping delivery
  assert.equal(result.success, false);
  assert.equal(result.templateAbsent, true);
  assert.equal(result.templateRequested, true);
  assert.match(result.error, /service_reminder_alert was absent/);
  assert.match(result.fallbackUrl, /https:\/\/wa\.me\/919876500000/);
});

test("6. autoDispatchDueRemindersViaMeta automatically dispatches due reminders without clicking and prevents duplicates", async () => {
  // Clear memory
  global.window.localStorage.clear();

  saveReminderSettings({
    enabled: true,
    reminderDaysBefore: 2,
    autoNotifyWhatsApp: true,
  });

  // Calculate a due soon date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const rec = saveReminderRecord({
    customerName: "Auto Test Customer",
    customerPhone: "9876543210",
    serviceName: "Battery Checkup",
    serviceDueDate: tomorrowStr,
    status: "Pending",
  });

  let dispatchedCount = 0;
  global.fetch = async (url) => {
    if (url === "/api/whatsapp-business/connection") {
      return {
        ok: true,
        json: async () => ({
          connected: true,
          readiness: { readyToSend: true },
        }),
      };
    }
    if (url === "/api/whatsapp-business/send") {
      dispatchedCount++;
      return {
        ok: true,
        json: async () => ({
          success: true,
          messageId: `wamid.auto_${Date.now()}`,
        }),
      };
    }
    return { ok: false };
  };

  const firstRun = await autoDispatchDueRemindersViaMeta("Sai Kirana Stores");
  assert.equal(firstRun.success, true);
  assert.equal(firstRun.dispatched, 1);
  assert.equal(dispatchedCount, 1);

  // Check that record is stamped with lastNotifiedDueDate
  const records = getReminderRecords();
  const updatedRec = records.find((r) => r.id === rec.id);
  assert.equal(updatedRec.lastNotifiedDueDate, tomorrowStr);
  assert.equal(updatedRec.lastNotifiedChannel, "meta_whatsapp");

  // Run again immediately - should NOT duplicate or re-dispatch!
  const secondRun = await autoDispatchDueRemindersViaMeta("Sai Kirana Stores");
  assert.equal(secondRun.success, true);
  assert.equal(secondRun.dispatched, 0);
  assert.equal(dispatchedCount, 1, "Must not resend to customer who was already notified for this due date");
});

test("7. autoDispatchDueRemindersViaMeta respects autoNotifyWhatsApp disabled setting", async () => {
  saveReminderSettings({
    enabled: true,
    autoNotifyWhatsApp: false,
  });

  const run = await autoDispatchDueRemindersViaMeta("Sai Kirana Stores");
  assert.equal(run.success, false);
  assert.equal(run.reason, "disabled");
  assert.equal(run.dispatched, 0);
});
