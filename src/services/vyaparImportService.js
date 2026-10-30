import { notifyBusinessDataChanged } from "./businessDataChanged.js";
import { mapVyaparData } from "./vyaparDataMapper.js";
import { createLocalVyaparImportRepository } from "./vyaparImportRepository.js";
import { parseVyaparBackup } from "./vyaparBackupParser.js";

export async function previewVyaparImport(bytes, dependencies, { repository = createLocalVyaparImportRepository() } = {}) {
  const parsed = await parseVyaparBackup(bytes, dependencies);
  const mapped = mapVyaparData(parsed);
  const duplicates = repository.inspectDuplicates(mapped);
  return {
    ...mapped,
    duplicates: duplicates.counts,
    duplicateSamples: duplicates.samples,
    fileSummary: parsed.databaseSummary,
  };
}

export async function importVyaparPreview(preview, {
  repository = createLocalVyaparImportRepository(),
  includeCompanyProfile = false,
  onProgress,
} = {}) {
  const result = await repository.importRecords(preview, { includeCompanyProfile, onProgress });
  if (Object.values(result.imported).some((count) => count > 0)) notifyBusinessDataChanged();
  return result;
}
