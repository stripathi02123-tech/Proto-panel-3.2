import fs from "fs-extra";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");

export const readJSON = async (filename: string) => {
  const filePath = path.join(DATA_DIR, filename);
  try {
    return await fs.readJson(filePath);
  } catch (err) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Atomic + serialized writes.
// Fixes two data-loss bugs:
//   1. A crash mid-write used to truncate users.json/servers.json (corruption).
//      -> We now write to a temp file and rename it into place (atomic on POSIX).
//   2. Concurrent read-modify-write cycles (e.g. two requests updating the same
//      JSON store) could resurrect revoked API keys or drop new servers.
//      -> A per-file promise chain serializes writes inside this process.
// ---------------------------------------------------------------------------
const writeChains: Record<string, Promise<void>> = {};

const rawWrite = async (filename: string, data: any) => {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + ".tmp-" + process.pid + "-" + Date.now();
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(tmpPath, data, { spaces: 2 });
  await fs.rename(tmpPath, filePath);
};

export const writeJSON = async (filename: string, data: any) => {
  const prev = writeChains[filename] || Promise.resolve();
  const next = prev.catch(() => {}).then(() => rawWrite(filename, data));
  // Store the chain, but never let a rejected write poison future writes.
  writeChains[filename] = next.catch(() => {});
  await next;
};
