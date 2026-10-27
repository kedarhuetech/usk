// Tests local-only passcode persistence, verification, and storage failures.
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createLocalPasscodeRepository } from "./appPasscodeRepository.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("setup saves a hash locally and unlocks after a repository reload", async () => {
  const storage = new MemoryStorage();
  const firstSession = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto });
  await firstSession.setup("0042");
  const saved = storage.getItem("usv:appPasscode.v1");
  assert.equal(saved.includes("0042"), false);

  const nextSession = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto });
  assert.deepEqual(await nextSession.status(), { enabled: true });
  await nextSession.verify("0042");
  await assert.rejects(nextSession.verify("0043"), /Incorrect passcode/);
});

test("change and disable require the current passcode", async () => {
  const storage = new MemoryStorage();
  const repository = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto });
  await repository.setup("0042");
  await assert.rejects(repository.change("9999", "1111"), /Incorrect passcode/);
  await repository.change("0042", "1111");
  await assert.rejects(repository.verify("0042"), /Incorrect passcode/);
  await repository.verify("1111");
  await assert.rejects(repository.disable("0042"), /Incorrect passcode/);
  assert.deepEqual(await repository.status(), { enabled: true });
  await repository.disable("1111");
  assert.deepEqual(await repository.status(), { enabled: false });
});

test("stops repeated incorrect attempts for fifteen minutes", async () => {
  const storage = new MemoryStorage();
  let now = 10_000;
  const repository = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto, now: () => now });
  await repository.setup("0042");
  for (let attempt = 0; attempt < 4; attempt += 1) await assert.rejects(repository.verify("0000"), /Incorrect passcode/);
  await assert.rejects(repository.verify("0000"), /Try again in 15 minutes/);
  await assert.rejects(repository.verify("0042"), /Try again in 900 seconds/);
  now += 15 * 60 * 1000;
  await repository.verify("0042");
});

test("does not fall back when local storage cannot save", async () => {
  const storage = new MemoryStorage();
  storage.setItem = () => { throw new Error("blocked"); };
  const repository = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto });
  await assert.rejects(repository.setup("0042"), /could not save/);
});

test("reports corrupted local data instead of treating it as disabled", async () => {
  const storage = new MemoryStorage();
  storage.setItem("usv:appPasscode.v1", "not-json");
  const repository = createLocalPasscodeRepository({ storage, cryptoProvider: webcrypto });
  await assert.rejects(repository.status(), /damaged/);
});
