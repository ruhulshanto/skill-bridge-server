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
const allowedOrigins = (process.env.APP_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, "")) // Remove trailing slash
  .filter(Boolean);

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

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return cb(null, true);
      
      const normalizedOrigin = origin.replace(/\/$/, ""); // Remove trailing slash from origin
      
      // Check if origin matches any allowed origin (with or without trailing slash)
      const isAllowed = allowedOrigins.some(allowed => {
        const normalizedAllowed = allowed.replace(/\/$/, "");
        return normalizedAllowed === normalizedOrigin;
      });
      
      if (isAllowed) return cb(null, true);
      
      // For debugging, log the rejected origin
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
