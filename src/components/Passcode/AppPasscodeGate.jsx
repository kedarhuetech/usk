// Blocks the app until the configured passcode repository confirms this session.
import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiLock } from "react-icons/fi";
import { appPasscodeRepository } from "../../services/appPasscodeRepository.js";
import { PasscodeContext, useAppPasscode } from "./passcodeContext.js";

// Shares passcode status without keeping the passcode itself in React state.
export function AppPasscodeProvider({ children }) {
  const [enabled, setEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");

  // Reads saved status before rendering protected app content.
  const refreshStatus = useCallback(async () => {
    setCheckingStatus(true);
    setStatusError("");
    try {
      const status = await appPasscodeRepository.status();
      setEnabled(Boolean(status.enabled));
      setUnlocked(!status.enabled);
    } catch (error) {
      setStatusError(error.message || "Could not check passcode status.");
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    appPasscodeRepository.status().then((status) => {
      if (!active) return;
      setEnabled(Boolean(status.enabled));
      setUnlocked(!status.enabled);
    }).catch((error) => {
      if (active) setStatusError(error.message || "Could not check passcode status.");
    }).finally(() => {
      if (active) setCheckingStatus(false);
    });
    return () => { active = false; };
  }, []);

  // Unlocks only after repository passcode verification succeeds.
  const unlock = async (passcode) => {
    await appPasscodeRepository.verify(passcode);
    setUnlocked(true);
  };

  // Saves a first passcode before enabling the lock.
  const setup = async (passcode) => {
    await appPasscodeRepository.setup(passcode);
    setEnabled(true);
    setUnlocked(true);
  };

  // Changes a passcode only after the repository verifies the current one.
  const change = async (currentPasscode, nextPasscode) => {
    await appPasscodeRepository.change(currentPasscode, nextPasscode);
    setEnabled(true);
    setUnlocked(true);
  };

  // Disables protection only after the repository verifies the current one.
  const disable = async (currentPasscode) => {
    await appPasscodeRepository.disable(currentPasscode);
    setEnabled(false);
    setUnlocked(true);
  };

  const lock = () => setUnlocked(false);
  const value = { enabled, unlocked, checkingStatus, statusError, refreshStatus, unlock, setup, change, disable, lock };
  return <PasscodeContext.Provider value={value}>{children}</PasscodeContext.Provider>;
}

// Shows only the startup lock, never the protected page underneath it.
export function AppPasscodeGuard({ children }) {
  const { enabled, unlocked, checkingStatus, statusError, refreshStatus, unlock } = useAppPasscode();
  const input = useRef(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sends the password field to the repository and clears it immediately.
  const submit = async (event) => {
    event.preventDefault();
    const passcode = input.current?.value || "";
    if (!/^\d{4}$/.test(passcode)) {
      setError("Enter all four digits.");
      return;
    }
    setSubmitting(true);
    setError("");
    if (input.current) input.current.value = "";
    try {
      await unlock(passcode);
    } catch (unlockError) {
      setError(unlockError.message || "Could not verify the passcode.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingStatus) return <GateMessage text="Checking app lock…" />;
  if (statusError) return <GateFailure message={statusError} onRetry={refreshStatus} />;
  if (!enabled || unlocked) return children;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700"><FiLock className="h-6 w-6" /></div>
        <h1 className="mt-4 text-center text-xl font-bold text-slate-900">USV is locked</h1>
        <p className="mt-2 text-center text-sm text-slate-600">Enter your app passcode to continue. This lock adds to your account security; it does not replace account authentication.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <input ref={input} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" aria-label="Four-digit app passcode" placeholder="••••" className="h-12 w-full rounded-lg border border-slate-300 text-center text-xl tracking-[0.5em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><FiAlertCircle />{error}</p>}
          <button disabled={submitting} className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{submitting ? "Checking…" : "Unlock App"}</button>
        </form>
      </section>
    </main>
  );
}

// Keeps app pages hidden while local passcode status is loading.
function GateMessage({ text }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">{text}</main>;
}

// Explains that the lock status could not be confirmed and offers a retry.
function GateFailure({ message, onRetry }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm"><FiAlertCircle className="mx-auto h-7 w-7 text-amber-600" /><h1 className="mt-3 font-semibold text-slate-900">App lock status unavailable</h1><p className="mt-2 text-sm text-slate-600">{message}. USV kept the app closed because it could not verify the saved setting.</p><button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Try again</button></section></main>;
}
