// PROTO HOSTING BOT — logger (console + rotating file)
import fs from "node:fs";
import path from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(cfg) {
  fs.mkdirSync(cfg.logDir, { recursive: true });
  const file = path.join(cfg.logDir, "bot.log");
  const threshold = LEVELS[cfg.logLevel] ?? LEVELS.info;

  function write(level, msg) {
    if (LEVELS[level] < threshold) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(line);
    try {
      // simple 5 MB rotation
      try {
        if (fs.statSync(file).size > 5 * 1024 * 1024) {
          fs.renameSync(file, `${file}.old`);
        }
      } catch {
        /* file may not exist yet */
      }
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      /* logging must never crash the bot */
    }
  }

  const base = {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    warn: (m) => write("warn", m),
    error: (m) => write("error", m),
    /** child logger with a [tag] prefix */
    tag: (name) => ({
      debug: (m) => write("debug", `[${name}] ${m}`),
      info: (m) => write("info", `[${name}] ${m}`),
      warn: (m) => write("warn", `[${name}] ${m}`),
      error: (m) => write("error", `[${name}] ${m}`),
    }),
  };
  return base;
}
