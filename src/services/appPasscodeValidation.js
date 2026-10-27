// Applies the same four-digit and confirmation rules to each Settings action.
export function validatePasscodeForm({ mode, currentPasscode = "", newPasscode = "", confirmation = "" }) {
  if ((mode === "change" || mode === "disable") && !/^\d{4}$/.test(currentPasscode)) {
    return "Enter your current four-digit passcode.";
  }
  if (mode === "setup" || mode === "change") {
    if (!/^\d{4}$/.test(newPasscode)) return "New passcode must contain exactly four digits.";
    if (newPasscode !== confirmation) return "The passcodes do not match.";
  }
  return "";
}
