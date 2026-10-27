// Tests passcode setup, confirmation, change, and disable form rules.
import test from "node:test";
import assert from "node:assert/strict";
import { validatePasscodeForm } from "./appPasscodeValidation.js";

test("accepts a leading-zero passcode when confirmation matches", () => {
  assert.equal(validatePasscodeForm({ mode: "setup", newPasscode: "0042", confirmation: "0042" }), "");
});

test("rejects a mismatched confirmation and a non-four-digit value", () => {
  assert.match(validatePasscodeForm({ mode: "setup", newPasscode: "0042", confirmation: "0043" }), /do not match/);
  assert.match(validatePasscodeForm({ mode: "setup", newPasscode: "42", confirmation: "42" }), /exactly four digits/);
});

test("requires the current passcode before changing or disabling protection", () => {
  assert.match(validatePasscodeForm({ mode: "change", currentPasscode: "", newPasscode: "1111", confirmation: "1111" }), /current four-digit/);
  assert.equal(validatePasscodeForm({ mode: "change", currentPasscode: "0042", newPasscode: "1111", confirmation: "1111" }), "");
  assert.equal(validatePasscodeForm({ mode: "disable", currentPasscode: "0042" }), "");
});
