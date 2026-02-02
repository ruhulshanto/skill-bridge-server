import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router: Router = Router();

// GET /api/categories - Get all categories (subjects) - public
router.get("/", async (_req, res) => {
  try {
    const categories = await prisma.subject.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ data: categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      error: { message: "Failed to fetch categories" },
    });
  }
});

export default router;
