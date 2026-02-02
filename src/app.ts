import express from "express";
import type { Application, Request, Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import cors from "cors";
import tutorsRouter from "./routes/tutors.js";
import tutorRouter from "./routes/tutor.js";
import bookingsRouter from "./routes/bookings.js";
import categoriesRouter from "./routes/categories.js";
import reviewsRouter from "./routes/reviews.js";
import adminRouter from "./routes/admin.js";
import studentRouter from "./routes/student.js";

const app: Application = express();

// Allow client origin (may be 3000 or 3001 when 3000 is in use)
console.log('=== CORS DEBUG ===');
console.log('Raw APP_URL:', process.env.APP_URL);
const allowedOrigins = (process.env.APP_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, "")) // Remove trailing slash
  .filter(Boolean);
console.log('Processed allowedOrigins:', allowedOrigins);

// Always allow localhost for development
if (!allowedOrigins.includes("http://localhost:3000")) {
  allowedOrigins.push("http://localhost:3000");
}
if (!allowedOrigins.includes("http://localhost:3001")) {
  allowedOrigins.push("http://localhost:3001");
}
if (!allowedOrigins.includes("http://localhost:3002")) {
  allowedOrigins.push("http://localhost:3002");
}
console.log('Final allowedOrigins:', allowedOrigins);
console.log('=== END CORS DEBUG ===');

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return cb(null, true);
      
      // Normalize both origins - remove trailing slash and protocol variations
      const normalizedOrigin = origin.replace(/\/$/, "").toLowerCase();
      
      // Check if origin matches any allowed origin (with flexible matching)
      const isAllowed = allowedOrigins.some(allowed => {
        const normalizedAllowed = allowed.replace(/\/$/, "").toLowerCase();
        return normalizedAllowed === normalizedOrigin;
      });
      
      if (isAllowed) return cb(null, true);
      
      // Special case: allow your exact frontend domain
      if (normalizedOrigin.includes("skill-bridge-client-ruddy.vercel.app")) {
        return cb(null, true);
      }
      
      // For debugging
      console.log('CORS rejected origin:', origin, 'Allowed origins:', allowedOrigins);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());

app.all("/api/auth/*splat", toNodeHandler(auth));

// API Routes
app.use("/api/tutors", tutorsRouter);
app.use("/api/tutor", tutorRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/student", studentRouter);

app.get("/", (req: Request, res: Response) => {
    res.send("SkillBridge Server Running");
});

export default app;
