import test from "node:test";
import assert from "node:assert/strict";
import {
  getReminderSettings,
  saveReminderSettings,
  resetReminderSettings,
  getReminderRecords,
  saveReminderRecord,
  saveReminderRecords,
  deleteReminderRecord,
  SERVICE_REMINDER_SETTINGS_KEY,
  SERVICE_REMINDER_RECORDS_KEY,
} from "./serviceRemindersStorage.js";
import {
  localDateString,
  getCalendarDayDifference,
  calculateReminderDate,
  evaluateReminderStatus,
  processServiceReminders,
  formatReminderMessage,
  buildWhatsAppReminder,
  buildEmailReminder,
  recordReminderNotification,
} from "./serviceRemindersService.js";

function setupMockEnvironment(initialData = {}) {
  const store = new Map(Object.entries(initialData));
  const priorWindow = globalThis.window;
  const dispatchedEvents = [];

  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: (event) => {
      dispatchedEvents.push(event?.type || event);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return {
    store,
    dispatchedEvents,
    restore: () => {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

// Utility: compute offset date YYYY-MM-DD
function offsetDate(baseDateStr, offsetDays) {
  const d = new Date(`${baseDateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test("Scenario 1: Reminders enabled, service due in 2 days", () => {
  const today = "2026-11-12";
  const dueDate = offsetDate(today, 2); // 2026-11-14
  const settings = { enabled: true, reminderDaysBefore: 2 };

  const record = {
    id: "rec-1",
    customerName: "Alice Sharma",
    customerPhone: "9876543210",
    customerEmail: "alice@example.com",
    serviceName: "RO Water Purifier Servicing",
    serviceDueDate: dueDate,
    status: "Pending",
  };

  const evaluated = evaluateReminderStatus(record, settings, today);

  assert.equal(evaluated.daysUntilDue, 2);
  assert.equal(evaluated.status, "Due Soon");
  assert.equal(evaluated.computedReminderDate, today);
  assert.equal(evaluated.isEligibleForNotification, true);
  assert.equal(evaluated.hasContact, true);
});

test("Scenario 2: Reminders enabled, service due tomorrow", () => {
  const today = "2026-11-12";
  const dueDate = offsetDate(today, 1); // 2026-11-13
  const settings = { enabled: true, reminderDaysBefore: 2 };

  const record = {
    id: "rec-2",
    customerName: "Bob Patel",
    customerPhone: "9123456780",
    customerEmail: "bob@example.com",
    serviceName: "AC Filter Cleaning",
    serviceDueDate: dueDate,
    status: "Pending",
  };

  const evaluated = evaluateReminderStatus(record, settings, today);

  assert.equal(evaluated.daysUntilDue, 1);
  assert.equal(evaluated.status, "Due Soon");
  assert.equal(evaluated.isEligibleForNotification, true);
});

test("Scenario 3: Reminders enabled, service due today", () => {
  const today = "2026-11-12";
  const dueDate = today; // 2026-11-12
  const settings = { enabled: true, reminderDaysBefore: 2 };

  const record = {
    id: "rec-3",
    customerName: "Charlie Rao",
    customerPhone: "9988776655",
    serviceName: "CCTV Camera Inspection",
    serviceDueDate: dueDate,
    status: "Pending",
  };

  const evaluated = evaluateReminderStatus(record, settings, today);

  assert.equal(evaluated.daysUntilDue, 0);
  assert.equal(evaluated.status, "Due Today");
  assert.equal(evaluated.isEligibleForNotification, true);
});

test("Scenario 4: Reminders disabled", () => {
  const today = "2026-11-12";
  const dueDate = offsetDate(today, 1);
  const settings = { enabled: false, reminderDaysBefore: 2 };

  const record = {
    id: "rec-4",
    customerName: "Diana Gupta",
    customerPhone: "9876501234",
    serviceName: "Diesel Generator Maintenance",
    serviceDueDate: dueDate,
    status: "Pending",
  };

  const evaluated = evaluateReminderStatus(record, settings, today);
  const processed = processServiceReminders({
    today,
    records: [record],
    settings,
  });

  // Status is still computed for visual information, but notifications are blocked
  assert.equal(evaluated.status, "Due Soon");
  assert.equal(evaluated.isEligibleForNotification, false);
  assert.equal(processed.activeAlerts.length, 0);
});

test("Scenario 5: Reminder days changed from 2 to 5", () => {
  const today = "2026-11-12";
  const dueDate = offsetDate(today, 4); // 4 days away

  const record = {
    id: "rec-5",
    customerName: "Ethan Hunt",
    customerPhone: "9000000001",
    serviceName: "Fire Extinguisher Refill",
    serviceDueDate: dueDate,
    status: "Pending",
  };

  // With 2 days configured: 4 days away is "Upcoming" (not yet within notification window)
  const settings2Days = { enabled: true, reminderDaysBefore: 2 };
  const eval2 = evaluateReminderStatus(record, settings2Days, today);
  assert.equal(eval2.status, "Upcoming");
  assert.equal(eval2.isEligibleForNotification, false);

  // Changed to 5 days configured: 4 days away becomes "Due Soon" and eligible!
  const settings5Days = { enabled: true, reminderDaysBefore: 5 };
  const eval5 = evaluateReminderStatus(record, settings5Days, today);
  assert.equal(eval5.status, "Due Soon");
  assert.equal(eval5.isEligibleForNotification, true);
});

test("Scenario 6: Settings saved and browser refreshed (storage persistence)", () => {
  const env = setupMockEnvironment();
  try {
    // Initial defaults check
    const initial = getReminderSettings();
    assert.equal(initial.enabled, true);
    assert.equal(initial.reminderDaysBefore, 2);

    // Save custom settings
    saveReminderSettings({
      enabled: true,
      reminderDaysBefore: 7,
    });

    // Verify written to storage
    assert.ok(env.store.has(SERVICE_REMINDER_SETTINGS_KEY));

    // Simulate page refresh / new reader
    const reloaded = getReminderSettings();
    assert.equal(reloaded.enabled, true);
    assert.equal(reloaded.reminderDaysBefore, 7);

    // Test Reset Defaults
    const reset = resetReminderSettings();
    assert.equal(reset.enabled, true);
    assert.equal(reset.reminderDaysBefore, 2);
  } finally {
    env.restore();
  }
});

test("Scenario 7: Service due date changed after reminder generation", () => {
  const env = setupMockEnvironment();
  try {
    const today = "2026-11-12";
    const oldDueDate = "2026-11-12";

    // 1. Initial record, due today
    let record = saveReminderRecord({
      id: "rec-7",
      customerName: "Fiona Gallagher",
      customerPhone: "9876543210",
      customerEmail: "fiona@example.com",
      serviceName: "Computer Diagnostic Check",
      serviceDueDate: oldDueDate,
      status: "Pending",
    });

    // 2. Reminder processed and dispatched
    const dispatched = recordReminderNotification(record.id, "whatsapp");
    assert.equal(dispatched.lastNotifiedDueDate, oldDueDate);

    // Status on same day after notification: not eligible anymore
    const settings = { enabled: true, reminderDaysBefore: 2 };
    let evalAfterNotification = evaluateReminderStatus(dispatched, settings, today);
    assert.equal(evalAfterNotification.alreadyNotifiedForThisDueDate, true);
    assert.equal(evalAfterNotification.isEligibleForNotification, false);

    // 3. Customer reschedules to a new future date (2026-11-20)
    const newDueDate = "2026-11-20";
    const rescheduled = saveReminderRecord({
      ...dispatched,
      serviceDueDate: newDueDate,
    });

    // On 2026-11-12, the new date is upcoming
    const evalRescheduledNow = evaluateReminderStatus(rescheduled, settings, "2026-11-12");
    assert.equal(evalRescheduledNow.status, "Upcoming");
    assert.equal(evalRescheduledNow.isEligibleForNotification, false);

    // When the new reminder date arrives (2026-11-18, 2 days before 2026-11-20):
    const evalOnNewReminderDate = evaluateReminderStatus(rescheduled, settings, "2026-11-18");
    assert.equal(evalOnNewReminderDate.status, "Due Soon");
    assert.equal(evalOnNewReminderDate.alreadyNotifiedForThisDueDate, false);
    assert.equal(evalOnNewReminderDate.isEligibleForNotification, true);
  } finally {
    env.restore();
  }
});

test("Scenario 8: Multiple services belonging to the same customer", () => {
  const today = "2026-11-12";
  const settings = { enabled: true, reminderDaysBefore: 2 };

  const serviceA = {
    id: "cust-1-srv-a",
    customerId: "party-101",
    customerName: "Apex Logistics Ltd",
    customerPhone: "9800011122",
    serviceName: "Fleet GPS Tracker Calibration",
    serviceDueDate: offsetDate(today, 1), // Due tomorrow -> Due Soon
    status: "Pending",
  };

  const serviceB = {
    id: "cust-1-srv-b",
    customerId: "party-101",
    customerName: "Apex Logistics Ltd",
    customerPhone: "9800011122",
    serviceName: "Forklift Annual Inspection",
    serviceDueDate: offsetDate(today, 25), // Due in 25 days -> Upcoming
    status: "Pending",
  };

  const processed = processServiceReminders({
    today,
    records: [serviceA, serviceB],
    settings,
  });

  assert.equal(processed.all.length, 2);
  assert.equal(processed.dueSoon.length, 1);
  assert.equal(processed.dueSoon[0].id, "cust-1-srv-a");
  assert.equal(processed.dueSoon[0].isEligibleForNotification, true);

  assert.equal(processed.upcoming.length, 1);
  assert.equal(processed.upcoming[0].id, "cust-1-srv-b");
  assert.equal(processed.upcoming[0].isEligibleForNotification, false);

  assert.equal(processed.activeAlerts.length, 1);
  assert.equal(processed.activeAlerts[0].serviceName, "Fleet GPS Tracker Calibration");
});

test("Scenario 9: Customer without valid contact", () => {
  const today = "2026-11-12";
  const settings = { enabled: true, reminderDaysBefore: 2 };

  const recordNoContact = {
    id: "rec-no-contact",
    customerName: "Anonymous Walk-in",
    customerPhone: "",
    customerEmail: "",
    serviceName: "Battery Replacement",
    serviceDueDate: today,
    status: "Pending",
  };

  const evaluated = evaluateReminderStatus(recordNoContact, settings, today);
  assert.equal(evaluated.hasContact, false);
  assert.equal(evaluated.hasValidPhone, false);
  assert.equal(evaluated.hasValidEmail, false);

  // External notification builders safely fail with clear errors
  const waResult = buildWhatsAppReminder(recordNoContact);
  assert.equal(waResult.success, false);
  assert.ok(waResult.error.includes("phone"));

  const emailResult = buildEmailReminder(recordNoContact);
  assert.equal(emailResult.success, false);
  assert.ok(emailResult.error.includes("email"));

  const processed = processServiceReminders({
    today,
    records: [recordNoContact],
    settings,
  });
  assert.equal(processed.summary.missingContact, 1);
});

test("Scenario 10: Repeated reminder processing (duplicate prevention)", () => {
  const env = setupMockEnvironment();
  try {
    const today = "2026-11-12";
    const settings = { enabled: true, reminderDaysBefore: 2 };

    let record = saveReminderRecord({
      id: "rec-dup-test",
      customerName: "George Miller",
      customerPhone: "9876543210",
      customerEmail: "george@example.com",
      serviceName: "Solar Panel Washing",
      serviceDueDate: "2026-11-13",
      status: "Pending",
    });

    // Step 1: Initial process - eligible
    let step1 = processServiceReminders({ today, records: [record], settings });
    assert.equal(step1.activeAlerts.length, 1);

    // Step 2: User clicks notify on WhatsApp
    const wa = buildWhatsAppReminder(record, "USK Solutions");
    assert.equal(wa.success, true);
    assert.ok(wa.url.includes("wa.me/919876543210"));
    assert.ok(wa.url.includes("Solar%20Panel%20Washing"));

    // Record notification dispatch
    const updated = recordReminderNotification(record.id, "whatsapp");
    assert.equal(updated.lastNotifiedDueDate, "2026-11-13");
    assert.equal(updated.notificationHistory.length, 1);
    assert.equal(updated.notificationHistory[0].channel, "whatsapp");

    // Step 3: Run processing again immediately (or next cron check)
    let step2 = processServiceReminders({
      today,
      records: getReminderRecords(),
      settings,
    });

    // Alert should NO LONGER be in activeAlerts for this due date
    assert.equal(step2.activeAlerts.length, 0);
    assert.equal(step2.all[0].alreadyNotifiedForThisDueDate, true);
    assert.equal(step2.all[0].isEligibleForNotification, false);
  } finally {
    env.restore();
  }
});
