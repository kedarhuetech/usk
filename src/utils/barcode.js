export const code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

export function encodeCode128B(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const dataCodes = Array.from(text).map((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : 31;
  });
  const checksum = (104 + dataCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const symbols = [104, ...dataCodes, checksum, 106];
  const modules = symbols.flatMap((symbol) => code128Patterns[symbol].split("").map(Number));
  const totalWidth = modules.reduce((sum, moduleWidth) => sum + moduleWidth, 0) + 20;

  return { text, modules, totalWidth };
}

export function getCode128Bars(value) {
  const encoded = encodeCode128B(value);
  if (!encoded) return null;

  const bars = encoded.modules.reduce(
    (result, width, index) => ({
      x: result.x + width,
      rects: index % 2 === 0 ? [...result.rects, { x: result.x, width }] : result.rects,
    }),
    { x: 10, rects: [] },
  ).rects;

  return { ...encoded, bars };
}

const eanLeftOdd = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const eanLeftEven = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const eanRight = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const eanParity = [
  "000000", "001011", "001101", "001110", "010011",
  "011001", "011100", "010101", "010110", "011010",
];

function numericValue(value, length) {
  const text = String(value || "").trim();
  return /^\d+$/.test(text) && text.length === length ? text : null;
}

function checkDigit(value, oddIndexWeight, evenIndexWeight) {
  const sum = Array.from(value).reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? oddIndexWeight : evenIndexWeight),
    0,
  );
  return String((10 - (sum % 10)) % 10);
}

function modulesToBars(modules) {
  const bars = [];
  let x = 10;
  Array.from(modules).forEach((module) => {
    if (module === "1") bars.push({ x, width: 1 });
    x += 1;
  });
  return { bars, totalWidth: x + 10 };
}

export function getEan13Bars(value) {
  const base = numericValue(value, 12) || numericValue(value, 13)?.slice(0, 12);
  if (!base) return null;
  const text = `${base}${checkDigit(base, 3, 1)}`;
  const parity = eanParity[Number(text[0])];
  const modules = [
    "101",
    ...Array.from(text.slice(1, 7), (digit, index) => (
      parity[index] === "0" ? eanLeftOdd[Number(digit)] : eanLeftEven[Number(digit)]
    )),
    "01010",
    ...Array.from(text.slice(7), (digit) => eanRight[Number(digit)]),
    "101",
  ].join("");
  return { ...modulesToBars(modules), text, format: "EAN-13" };
}

export function getUpcABars(value) {
  const base = numericValue(value, 11) || numericValue(value, 12)?.slice(0, 11);
  if (!base) return null;
  const text = `${base}${checkDigit(base, 1, 3)}`;
  const modules = [
    "101",
    ...Array.from(text.slice(0, 6), (digit) => eanLeftOdd[Number(digit)]),
    "01010",
    ...Array.from(text.slice(6), (digit) => eanRight[Number(digit)]),
    "101",
  ].join("");
  return { ...modulesToBars(modules), text, format: "UPC-A" };
}

export function getBarcodeBars(value, format = "CODE128") {
  if (format === "EAN13") return getEan13Bars(value);
  if (format === "UPCA") return getUpcABars(value);
  return getCode128Bars(value) ? { ...getCode128Bars(value), format: "CODE128" } : null;
}
