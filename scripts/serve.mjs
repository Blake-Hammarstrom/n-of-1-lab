// Local preview of dist/ (no dependencies): node scripts/serve.mjs [port] (N-of-1 Lab)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const port = Number(process.argv[2] || 4173);

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, p);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { /* falls through to 404 */ }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
