import http from "node:http";
import { readFile, readFileSync } from "node:fs";
import { readFile as readFileP } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Loads `.env` from the working directory when it exists (local run). On the
// deployed server there is no `.env` file — the managed variables arrive via
// the process environment, so this block is a no-op there.
try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  } else {
    const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
} catch {
  // No `.env` on disk (server) — variables are already in process.env.
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BASE = process.env.BITRIX_API_BASE_URL || "";
const KEY = process.env.BITRIX_API_KEY || "";
const DOMAIN = process.env.BITRIX_PORTAL_DOMAIN || "";
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- portal proxy ----------
async function portal(pathname, { method = "GET", body } = {}) {
  if (!KEY || !BASE) {
    const err = new Error("portal_not_connected");
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      "X-Api-Key": KEY,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `portal_error_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data?.data ?? data;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

// ---------- lead ingestion ----------
// Saves leads anonymously to /data when the portal is not connected, and
// additionally pushes to Bitrix24 as a lead when the portal IS connected.
import { mkdirSync, writeFileSync, renameSync, existsSync } from "node:fs";

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (existsSync("/data")) return "/data";
  return path.join(__dirname, "data");
}

function saveLead(lead) {
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "leads.json");
  let list = [];
  try {
    if (existsSync(file)) list = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    list = [];
  }
  list.push(lead);
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
  renameSync(tmp, file);
}

async function createPortalLead(lead) {
  const fields = {
    TITLE: lead.car ? `Заявка: ${lead.car}` : "Заявка с сайта Эра Тока",
    NAME: lead.name || "",
    PHONE: [{ VALUE: lead.phone || "", VALUE_TYPE: "WORK" }],
    EMAIL: lead.email ? [{ VALUE: lead.email, VALUE_TYPE: "WORK" }] : undefined,
    COMMENTS: [lead.comment, lead.car ? `Автомобиль: ${lead.car}` : "", `Источник: Лендинг Эра Тока`].filter(Boolean).join("\n"),
    SOURCE_ID: "WEB",
  };
  if (!fields.EMAIL) delete fields.EMAIL;
  return portal("/leads", { method: "POST", body: { fields } });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  // API: create a lead from the landing form
  if (url.pathname === "/api/lead" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw || "{}");
      const lead = {
        name: (data.name || "").trim(),
        phone: (data.phone || "").trim(),
        email: (data.email || "").trim(),
        comment: (data.comment || "").trim(),
        car: (data.car || "").trim(),
        createdAt: new Date().toISOString(),
        source: "era-toka-landing",
      };
      // Always persist locally first (survives redeploys via /data)
      saveLead(lead);
      // Then push to the portal if connected
      if (KEY && BASE) {
        try {
          await createPortalLead(lead);
        } catch (err) {
          // Persisted locally even if portal push fails — still report success
          console.error("portal lead push failed:", err.message);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Некорректные данные заявки" }));
      return;
    }
  }

  // API: portal connection status (for the UI)
  if (url.pathname === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: Boolean(KEY && BASE), domain: DOMAIN }));
    return;
  }

  // static — served only from PUBLIC_DIR
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const isDotfile = rel.split("/").some((seg) => seg.startsWith("."));
  const filePath = path.resolve(PUBLIC_DIR, rel);
  const insidePublic = filePath === PUBLIC_DIR || filePath.startsWith(PUBLIC_DIR + path.sep);
  if (isDotfile || !insidePublic) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await readFileP(filePath);
    const ext = path.extname(filePath) || ".html";
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, () => console.log(`listening on ${PORT}`));
