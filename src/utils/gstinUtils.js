/**
 * GSTIN (Goods and Services Tax Identification Number) Utilities
 * 
 * Complies with the Indian GST standard:
 * - 15 alphanumeric characters: [State 2d][PAN 10ch][Entity 1ch][Z 1ch][Checksum 1ch]
 * - State code mapping for all 38 Indian States/UTs + Other Territories
 * - Luhn Modulo 36 checksum calculation and verification
 */

export const GST_STATE_MAP = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Standard GSTIN Regular Expression:
 * 2 digits state code, 5 letters PAN, 4 digits PAN, 1 letter PAN, 1 entity code, literal Z, 1 checksum char.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Cleans and formats raw GSTIN input (trims, converts to uppercase, removes internal whitespace).
 */
export function cleanGstin(val) {
  return String(val || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Checks if string structurally matches 15-character GSTIN regex.
 */
export function isValidGstinFormat(val) {
  const clean = cleanGstin(val);
  return GSTIN_REGEX.test(clean);
}

/**
 * Checks if 2-digit state code is a valid Indian state/UT code.
 */
export function isValidStateCode(code) {
  return Boolean(GST_STATE_MAP[code]);
}

/**
 * Derives state name from GSTIN.
 */
export function getStateNameFromGstin(val) {
  const clean = cleanGstin(val);
  if (clean.length < 2) return "";
  const code = clean.slice(0, 2);
  return GST_STATE_MAP[code] || "";
}

/**
 * Derives 10-character PAN from GSTIN.
 */
export function getPanFromGstin(val) {
  const clean = cleanGstin(val);
  if (clean.length >= 12) {
    return clean.slice(2, 12);
  }
  return "";
}

/**
 * Verifies the 15th checksum character using Indian GST Luhn Modulo 36 algorithm.
 */
export function verifyGstinChecksum(val) {
  const clean = cleanGstin(val);
  if (clean.length !== 15) return false;

  let sum = 0;
  const mod = GST_CHARS.length; // 36

  for (let i = 0; i < 14; i++) {
    const codePoint = GST_CHARS.indexOf(clean[i]);
    if (codePoint === -1) return false;

    // Alternating factor from right to left (index 13 has multiplier 2, index 12 has 1)
    const factor = i % 2 === 1 ? 2 : 1;

    let addend = factor * codePoint;
    addend = Math.floor(addend / mod) + (addend % mod);
    sum += addend;
  }

  const remainder = sum % mod;
  const checkCodePoint = (mod - remainder) % mod;
  const expectedCheckChar = GST_CHARS[checkCodePoint];

  return clean[14] === expectedCheckChar;
}

/**
 * Complete production GSTIN validator.
 * 
 * @param {string} val Raw input string
 * @param {object} options Options
 * @param {boolean} [options.required=false] Whether non-empty string is required
 * @param {boolean} [options.verifyChecksum=false] Whether to strictly verify the 15th Luhn Mod 36 checksum
 * @returns {{ valid: boolean, clean: string, stateCode: string, stateName: string, pan: string, error?: string }}
 */
export function validateGstin(val, { required = false, verifyChecksum = false } = {}) {
  const clean = cleanGstin(val);

  if (!clean) {
    if (required) {
      return {
        valid: false,
        clean: "",
        stateCode: "",
        stateName: "",
        pan: "",
        error: "GSTIN is required.",
      };
    }
    return {
      valid: true,
      clean: "",
      stateCode: "",
      stateName: "",
      pan: "",
    };
  }

  if (clean.length !== 15) {
    return {
      valid: false,
      clean,
      stateCode: clean.slice(0, 2),
      stateName: getStateNameFromGstin(clean),
      pan: getPanFromGstin(clean),
      error: `GSTIN must be exactly 15 characters (currently ${clean.length}).`,
    };
  }

  if (!GSTIN_REGEX.test(clean)) {
    return {
      valid: false,
      clean,
      stateCode: clean.slice(0, 2),
      stateName: getStateNameFromGstin(clean),
      pan: getPanFromGstin(clean),
      error: "Invalid GSTIN format. Expected format: 27ABCDE1234F1Z5",
    };
  }

  const stateCode = clean.slice(0, 2);
  const stateName = GST_STATE_MAP[stateCode];
  if (!stateName) {
    return {
      valid: false,
      clean,
      stateCode,
      stateName: "",
      pan: getPanFromGstin(clean),
      error: `Invalid state code "${stateCode}". Expected valid Indian state code (01-38).`,
    };
  }

  if (verifyChecksum && !verifyGstinChecksum(clean)) {
    return {
      valid: false,
      clean,
      stateCode,
      stateName,
      pan: getPanFromGstin(clean),
      error: "Invalid GSTIN checksum digit. Please verify the characters for typos.",
    };
  }

  return {
    valid: true,
    clean,
    stateCode,
    stateName,
    pan: getPanFromGstin(clean),
  };
}
