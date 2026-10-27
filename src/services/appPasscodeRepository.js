// Selects local browser storage now while keeping the app-lock UI adapter-based.
export const APP_PASSCODE_STORAGE_MODE = "local";
export const APP_PASSCODE_STORAGE_LABEL = "Local-only storage — saved in this browser, not synced to the database.";

const STORAGE_KEY = "usv:appPasscode.v1";
const HASH_ITERATIONS = 310_000;
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

// Rejects malformed values before hashing or comparing them.
function requireFourDigits(passcode) {
  if (typeof passcode !== "string" || !/^\d{4}$/.test(passcode)) {
    throw new Error("Passcode must contain exactly four digits.");
  }
}

// Converts bytes to the compact hexadecimal form saved beside the passcode hash.
function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Converts the saved hexadecimal salt and hash back to bytes for Web Crypto.
function fromHex(value) {
  return new Uint8Array(value.match(/.{2}/g).map((part) => Number.parseInt(part, 16)));
}

// Creates a salted PBKDF2 hash without ever saving the raw four digits.
async function createHash(passcode, salt, cryptoProvider) {
  if (!cryptoProvider?.subtle || !cryptoProvider?.getRandomValues) {
    throw new Error("Secure browser cryptography is unavailable. Passcode storage was not changed.");
  }
  const saltBytes = salt ? fromHex(salt) : cryptoProvider.getRandomValues(new Uint8Array(16));
  const key = await cryptoProvider.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await cryptoProvider.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: HASH_ITERATIONS, hash: "SHA-256" }, key, 256);
  return { salt: toHex(saltBytes), hash: toHex(new Uint8Array(bits)) };
}

// Makes a local-only adapter with the same operations a future backend adapter can implement.
export function createLocalPasscodeRepository({ storage, cryptoProvider, now = Date.now }) {
  // Fails clearly if the browser blocks storage or the saved value is damaged.
  const readRecord = () => {
    let value;
    try {
      value = storage.getItem(STORAGE_KEY);
    } catch {
      throw new Error("Browser storage is unavailable. Passcode settings were not changed.");
    }
    if (value === null) return null;
    let record;
    try {
      record = JSON.parse(value);
    } catch {
      throw new Error("Saved passcode data is damaged. It was left unchanged.");
    }
    if (record?.version !== 1 || record.enabled !== true || !/^[a-f\d]{32}$/i.test(record.salt || "") || !/^[a-f\d]{64}$/i.test(record.hash || "") || !Number.isInteger(record.failures) || !Number.isFinite(record.lockedUntil)) {
      throw new Error("Saved passcode data is invalid. It was left unchanged.");
    }
    return record;
  };

  // Writes only the hash and retry state to the chosen local adapter.
  const writeRecord = (record) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      throw new Error("Browser storage could not save the passcode. No change was made.");
    }
  };

  // Checks a passcode and persists failed-attempt protection across refreshes.
  const verifyRecord = async (record, passcode) => {
    if (record.lockedUntil > now()) {
      const seconds = Math.ceil((record.lockedUntil - now()) / 1000);
      throw new Error(`Too many incorrect attempts. Try again in ${seconds} seconds.`);
    }
    const candidate = await createHash(passcode, record.salt, cryptoProvider);
    if (candidate.hash !== record.hash) {
      const failures = record.failures + 1;
      writeRecord({ ...record, failures, lockedUntil: failures >= MAX_ATTEMPTS ? now() + LOCK_DURATION_MS : 0 });
      if (failures >= MAX_ATTEMPTS) throw new Error("Too many incorrect attempts. Try again in 15 minutes.");
      throw new Error("Incorrect passcode.");
    }
    if (record.failures || record.lockedUntil) writeRecord({ ...record, failures: 0, lockedUntil: 0 });
  };

  return {
    // Reports only whether a local passcode exists; it never returns the hash.
    async status() {
      return { enabled: Boolean(readRecord()) };
    },
    // Enables protection only after a salted hash is saved successfully.
    async setup(passcode) {
      requireFourDigits(passcode);
      if (readRecord()) throw new Error("A passcode is already enabled.");
      const { salt, hash } = await createHash(passcode, "", cryptoProvider);
      writeRecord({ version: 1, enabled: true, salt, hash, failures: 0, lockedUntil: 0 });
      return { enabled: true };
    },
    // Verifies a local passcode before allowing the session to unlock.
    async verify(passcode) {
      requireFourDigits(passcode);
      const record = readRecord();
      if (!record) throw new Error("App passcode is not enabled.");
      await verifyRecord(record, passcode);
      return { verified: true };
    },
    // Replaces the hash only after checking the current passcode.
    async change(currentPasscode, newPasscode) {
      requireFourDigits(currentPasscode);
      requireFourDigits(newPasscode);
      const record = readRecord();
      if (!record) throw new Error("App passcode is not enabled.");
      await verifyRecord(record, currentPasscode);
      const { salt, hash } = await createHash(newPasscode, "", cryptoProvider);
      writeRecord({ version: 1, enabled: true, salt, hash, failures: 0, lockedUntil: 0 });
      return { enabled: true };
    },
    // Removes the local hash only after checking the current passcode.
    async disable(currentPasscode) {
      requireFourDigits(currentPasscode);
      const record = readRecord();
      if (!record) throw new Error("App passcode is not enabled.");
      await verifyRecord(record, currentPasscode);
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        throw new Error("Browser storage could not disable the passcode. No change was made.");
      }
      return { enabled: false };
    },
  };
}

// Creates the configured local adapter only when a passcode operation is requested.
function configuredRepository() {
  try {
    if (typeof window === "undefined" || !window.localStorage) throw new Error();
    return createLocalPasscodeRepository({ storage: window.localStorage, cryptoProvider: window.crypto });
  } catch {
    throw new Error("Local passcode storage is unavailable in this browser. No passcode data was saved.");
  }
}

// Exposes one stable repository interface for all app-lock UI components.
export const appPasscodeRepository = {
  status: () => configuredRepository().status(),
  setup: (passcode) => configuredRepository().setup(passcode),
  verify: (passcode) => configuredRepository().verify(passcode),
  change: (currentPasscode, nextPasscode) => configuredRepository().change(currentPasscode, nextPasscode),
  disable: (passcode) => configuredRepository().disable(passcode),
};
