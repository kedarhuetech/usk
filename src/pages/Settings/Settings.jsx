// Lets users manage the app lock from their existing Settings destination.
import { useRef, useState } from "react";
import { FiInfo, FiLock, FiShield } from "react-icons/fi";
import Card from "../../components/Common/Card";
import { useAppPasscode } from "../../components/Passcode/passcodeContext.js";
import { APP_PASSCODE_STORAGE_LABEL } from "../../services/appPasscodeRepository.js";
import { validatePasscodeForm } from "../../services/appPasscodeValidation.js";

// Renders the current Settings page with Application security controls.
function Settings() {
  const { enabled, setup, change, disable, lock } = useAppPasscode();
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currentInput = useRef(null);
  const newInput = useRef(null);
  const confirmInput = useRef(null);

  // Starts setup or asks for the current passcode before disabling.
  const togglePasscode = () => {
    setError("");
    setMode(enabled ? "disable" : "setup");
  };

  // Saves a requested passcode change only after all values are checked.
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const currentPasscode = currentInput.current?.value || "";
    const nextPasscode = newInput.current?.value || "";
    const confirmation = confirmInput.current?.value || "";
    const validationError = validatePasscodeForm({ mode, currentPasscode, newPasscode: nextPasscode, confirmation });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      if (mode === "setup") await setup(nextPasscode);
      if (mode === "change") await change(currentPasscode, nextPasscode);
      if (mode === "disable") await disable(currentPasscode);
      setMode("");
    } catch (saveError) {
      setError(saveError.message || "Could not save the passcode setting.");
    } finally {
      if (currentInput.current) currentInput.current.value = "";
      if (newInput.current) newInput.current.value = "";
      if (confirmInput.current) confirmInput.current.value = "";
      setSaving(false);
    }
  };

  // Clears passcode fields whenever the dialog is cancelled.
  const cancel = () => {
    if (currentInput.current) currentInput.current.value = "";
    if (newInput.current) newInput.current.value = "";
    if (confirmInput.current) confirmInput.current.value = "";
    setMode("");
    setError("");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <p className="text-sm font-semibold text-blue-700">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">Manage app preferences and access protection.</p>
      </header>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FiShield className="text-blue-600" /> Application</h2>
          <p className="mt-1 text-sm text-slate-500">Control how this app is protected on this company workspace.</p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label className="flex cursor-pointer items-center gap-3 font-medium text-slate-800">
              <input type="checkbox" checked={enabled} onChange={togglePasscode} className="h-4 w-4 accent-blue-600" />
              Enable Passcode
              <span title="The app passcode adds a lock screen before USV pages appear. It does not replace account authentication or secure direct backend API access." aria-label="Passcode information" className="text-slate-400"><FiInfo /></span>
            </label>
            <p className="ml-7 mt-1 text-sm text-slate-500">An extra app lock for this company workspace.</p>
          </div>
          <button type="button" disabled={!enabled} onClick={() => { setError(""); setMode("change"); }} className="text-left text-sm font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">Change Passcode</button>
        </div>
        {enabled && <div className="border-t border-slate-100 px-5 py-4"><button type="button" onClick={lock} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiLock /> Lock App Now</button></div>}
      </Card>

      <p className="flex items-start gap-2 text-xs text-amber-800"><FiInfo className="mt-0.5 shrink-0" /><span><strong>{APP_PASSCODE_STORAGE_LABEL}</strong> This local app lock is a convenience layer, not strong security. Browser data can be inspected, cleared, or changed, and the lock does not replace account authentication or protect direct backend API access.</span></p>

      {mode && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="passcode-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="passcode-dialog-title" className="text-lg font-bold text-slate-900">{mode === "setup" ? "Create App Passcode" : mode === "change" ? "Change App Passcode" : "Disable App Passcode"}</h2>
          <p className="mt-2 text-sm text-slate-600">{mode === "setup" ? "Choose a four-digit numeric passcode and enter it again to confirm." : mode === "change" ? "Verify your current passcode, then enter and confirm a new one." : "Enter your current passcode to turn off the app lock."}</p>
          <form className="mt-5 space-y-3" onSubmit={submit}>
            {(mode === "change" || mode === "disable") && <PasscodeInput inputRef={currentInput} label="Current passcode" autoComplete="current-password" />}
            {(mode === "setup" || mode === "change") && <>
              <PasscodeInput inputRef={newInput} label="New four-digit passcode" autoComplete="new-password" />
              <PasscodeInput inputRef={confirmInput} label="Confirm passcode" autoComplete="new-password" />
            </>}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" disabled={saving} onClick={cancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : mode === "disable" ? "Verify and Disable" : "Save Passcode"}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}

// Uses an uncontrolled password input so the digits are not kept in React state.
function PasscodeInput({ inputRef, label, autoComplete }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input ref={inputRef} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} minLength={4} autoComplete={autoComplete} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-lg tracking-[0.4em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>;
}

export default Settings;
