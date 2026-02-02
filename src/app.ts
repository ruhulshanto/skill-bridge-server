import express, { Application, Request, Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
import tutorsRouter from "./routes/tutors";
import tutorRouter from "./routes/tutor";
import bookingsRouter from "./routes/bookings";
import categoriesRouter from "./routes/categories";
import reviewsRouter from "./routes/reviews";
import adminRouter from "./routes/admin";
import studentRouter from "./routes/student";

const app: Application = express();

// Allow client origin (may be 3000 or 3001 when 3000 is in use)
const allowedOrigins = (process.env.APP_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
if (!allowedOrigins.includes("http://localhost:3001")) {
  allowedOrigins.push("http://localhost:3001");
}
if (!allowedOrigins.includes("http://localhost:3002")) {
  allowedOrigins.push("http://localhost:3002");
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
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
