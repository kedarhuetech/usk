import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const posPage = new URL("../pages/Sales/POS.jsx", import.meta.url);
const repositoryFile = new URL("./posRepository.js", import.meta.url);

test("POS persistence no longer reads or writes business LocalStorage stores", async () => {
  const [pageSource, repositorySource] = await Promise.all([
    readFile(posPage, "utf8"),
    readFile(repositoryFile, "utf8"),
  ]);
  assert.doesNotMatch(pageSource, /localStorage|itemsStorage|partiesStorage|salesStorage|businessRecords/);
  assert.doesNotMatch(repositorySource, /localStorage\.setItem|localStorage\.removeItem/);
  assert.match(repositorySource, /inspectLegacyData\(\)/);
  assert.match(repositorySource, /exportLegacyData\(/);
});
