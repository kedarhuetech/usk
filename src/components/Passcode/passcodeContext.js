// Shares passcode controls between the settings page and the route guard.
import { createContext, useContext } from "react";

export const PasscodeContext = createContext(null);

// Reads the current app-lock state from its provider.
export function useAppPasscode() {
  const context = useContext(PasscodeContext);
  if (!context) throw new Error("useAppPasscode must be used inside AppPasscodeProvider.");
  return context;
}
