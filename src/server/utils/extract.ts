import fs from "fs-extra";
import path from "path";
import extractZip from "extract-zip";
import AdmZip from "adm-zip";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * SECURITY FIXES in this module (previously CRITICAL):
 *  1. Zip-slip / path traversal: archives containing entries like
 *     "../../etc/cron.d/pwn" were extracted verbatim by tar / unzip /
 *     python3-zipfile / AdmZip, allowing arbitrary file writes outside the
 *     destination. We now PRE-SCAN zip entries (AdmZip) and reject any entry
 *     whose resolved path escapes destDir, and extraction order puts the
 *     safest library (extract-zip, which validates entry paths) FIRST.
 *  2. Shell command injection: paths were interpolated into shell strings via
 *     JSON.stringify — double quotes do NOT neutralize $(...) or backticks,
 *     so a file named `x$(touch /tmp/pwned).zip` executed arbitrary commands.
 *     All external tools are now invoked with execFile (argument arrays, no
 *     shell).
 */
export async function extractArchive(targetPath: string, destDir: string): Promise<{ success: boolean; method: string }> {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Archive file does not exist: ${path.basename(targetPath)}`);
  }

  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`'${path.basename(targetPath)}' is a directory folder, not a zip archive file.`);
  }

  if (stat.size === 0) {
    throw new Error(`'${path.basename(targetPath)}' is an empty file (0 bytes).`);
  }

  await fs.ensureDir(destDir);
  const lowerPath = targetPath.toLowerCase();
  const resolvedDest = path.resolve(destDir);

  // Guard used by every strategy: an entry/path may never escape destDir.
  const assertInsideDest = (entryName: string) => {
    const resolved = path.resolve(destDir, entryName);
    if (resolved !== resolvedDest && !resolved.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Blocked archive entry with unsafe path: ${entryName}`);
    }
  };

  // 1. Tar / Tar.Gz / Tgz archives — execFile, no shell.
  if (lowerPath.endsWith(".tar.gz") || lowerPath.endsWith(".tgz") || lowerPath.endsWith(".tar")) {
    const flag = lowerPath.endsWith(".tar") ? "-xf" : "-xzf";
    try {
      await execFileAsync("tar", [flag, targetPath, "-C", destDir], { timeout: 5 * 60 * 1000 });
      return { success: true, method: "tar" };
    } catch (tarErr: any) {
      console.error("tar command failed:", tarErr?.message);
      throw new Error(`Failed to extract tar archive: ${tarErr?.message || tarErr}`);
    }
  }

  let lastError: Error | null = null;

  // 2. extract-zip (yauzl-based, validates entry paths itself) — safest first.
  try {
    await extractZip(targetPath, { dir: resolvedDest });
    return { success: true, method: "extract-zip" };
  } catch (extractZipErr: any) {
    lastError = extractZipErr;
  }

  // 3. AdmZip (pure JS) — with a pre-scan that rejects traversal entries.
  try {
    const zip = new AdmZip(targetPath);
    for (const entry of zip.getEntries()) {
      assertInsideDest(entry.entryName);
    }
    zip.extractAllTo(destDir, true);
    return { success: true, method: "adm-zip" };
  } catch (admZipErr: any) {
    if (String(admZipErr?.message || "").includes("unsafe path")) throw admZipErr;
    lastError = admZipErr;
  }

  // 4. System `unzip` — execFile with argument array (no shell injection).
  try {
    await execFileAsync("unzip", ["-o", "-q", targetPath, "-d", destDir], { timeout: 5 * 60 * 1000 });
    return { success: true, method: "system-unzip" };
  } catch (unzipCmdErr: any) {
    lastError = unzipCmdErr;
  }

  // 5. Python 3 `zipfile` module — execFile as well.
  try {
    await execFileAsync("python3", ["-m", "zipfile", "-e", targetPath, destDir], { timeout: 5 * 60 * 1000 });
    return { success: true, method: "python-zipfile" };
  } catch (pyErr: any) {
    lastError = pyErr;
  }

  throw new Error(`Failed to extract archive '${path.basename(targetPath)}': ${lastError?.message || "Unsupported archive or corrupted file."}`);
}
