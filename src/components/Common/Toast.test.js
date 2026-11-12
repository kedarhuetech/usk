import test from "node:test";
import assert from "node:assert/strict";

test("Toast event dispatcher format", async () => {
  let dispatched = null;
  global.window = {
    dispatchEvent: (event) => {
      dispatched = event;
    },
  };
  global.CustomEvent = class CustomEvent {
    constructor(name, init) {
      this.name = name;
      this.detail = init?.detail;
    }
  };

  const { toast } = await import("./toastDispatcher.js");

  toast.success("Reminder delivered!");
  assert.equal(dispatched?.name, "app:show_toast");
  assert.equal(dispatched?.detail?.type, "success");
  assert.equal(dispatched?.detail?.message, "Reminder delivered!");

  toast.error("Template not approved in campaign", { duration: 5000 });
  assert.equal(dispatched?.detail?.type, "error");
  assert.equal(dispatched?.detail?.message, "Template not approved in campaign");
  assert.equal(dispatched?.detail?.duration, 5000);
});
