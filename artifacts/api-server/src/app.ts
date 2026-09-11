import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────
// Previously `cors()` with no options reflects any Origin. We restrict to an
// explicit allow-list configured via ALLOWED_ORIGINS (comma-separated),
// falling back to permissive behavior only outside production so local
// development isn't broken.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (server-to-server, curl, health checks) — allow.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0) {
        // No allow-list configured. Fail closed in production; be permissive
        // in development so the app is usable out of the box.
        if (process.env.NODE_ENV === "production") {
          logger.warn({ origin }, "Rejected CORS request: ALLOWED_ORIGINS is not configured");
          callback(null, false);
        } else {
          callback(null, true);
        }
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  }),
);

// ─── Security headers ───────────────────────────────────────────────────────
// Minimal hand-rolled equivalent of `helmet` (kept dependency-free).
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// ─── Body parsing ────────────────────────────────────────────────────────────
// Explicit size limits — previously unbounded, allowing large-payload
// denial-of-service requests.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", router);

// Serve frontend static files in production (Render deployment)
if (process.env.NODE_ENV === "production") {
  // Render may start the service from a different working directory than the
  // repository root. Resolve the asset directory from the bundled server too.
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDistCandidates = [
    path.resolve(process.cwd(), "artifacts/sana-quran/dist/public"),
    path.resolve(process.cwd(), "sana-quran/dist/public"),
    path.resolve(process.cwd(), "../sana-quran/dist/public"),
    path.resolve(process.cwd(), "../../artifacts/sana-quran/dist/public"),
    path.resolve(runtimeDir, "../../sana-quran/dist/public"),
    path.resolve(runtimeDir, "../../../artifacts/sana-quran/dist/public"),
  ];
  const frontendDist =
    frontendDistCandidates.find((candidate) =>
      existsSync(path.join(candidate, "index.html")),
    ) ?? frontendDistCandidates[0];
  logger.info({ frontendDist }, "Serving static files from");
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
      if (err) {
        logger.error({ err, frontendDist }, "Failed to send index.html");
        res.status(500).send("Frontend not found. Build may have failed.");
      }
    });
  });
}

export default app;
