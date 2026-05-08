import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getArrivalsPayload } from "./lib/tracker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";

const staticFiles = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" },
  "/site.webmanifest": {
    file: "site.webmanifest",
    type: "application/manifest+json; charset=utf-8"
  },
  "/service-worker.js": {
    file: "service-worker.js",
    type: "application/javascript; charset=utf-8"
  },
  "/icon.svg": { file: "icon.svg", type: "image/svg+xml" }
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function handleStatic(reqPath, res) {
  const asset = staticFiles[reqPath];
  if (!asset) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  try {
    const contents = await readFile(path.join(__dirname, asset.file));
    res.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-store"
    });
    res.end(contents);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Failed to load file");
  }
}

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (reqUrl.pathname === "/api/arrivals") {
    try {
      sendJson(res, 200, await getArrivalsPayload());
    } catch (error) {
      sendJson(res, 502, {
        error: "Unable to reach SEPTA right now.",
        details: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  await handleStatic(reqUrl.pathname, res);
});

server.listen(port, host, () => {
  console.log(`Berks tracker running at http://${host}:${port}`);
});
