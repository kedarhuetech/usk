import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let sqlRuntime;

export async function openVyaparSqlite(bytes) {
  sqlRuntime ||= initSqlJs({ locateFile: () => wasmUrl });
  const SQL = await sqlRuntime;
  return new SQL.Database(bytes);
}
