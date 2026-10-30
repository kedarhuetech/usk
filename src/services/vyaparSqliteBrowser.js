import initSqlJs from "sql.js";

let sqlRuntime;

export async function openVyaparSqlite(bytes) {
  sqlRuntime ||= initSqlJs({
    locateFile: (file) => (file.endsWith(".wasm") ? "/sql-wasm.wasm" : file),
  });
  const SQL = await sqlRuntime;
  return new SQL.Database(bytes);
}
