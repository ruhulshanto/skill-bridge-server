import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router: Router = Router();

// GET /api/categories - Get all categories with tutor counts
router.get("/", async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        subjects: {
          include: {
            tutorSubjects: {
              include: {
                tutor: true, // Include TutorProfile via TutorSubject.tutor relation
              },
            },
          },
        },
      },
    });

    // Calculate tutor count per category
    const categoriesWithCounts = categories.map((category) => {
      // Count unique tutors for this category through subjects
      const tutorSet = new Set<string>();
      category.subjects.forEach((subject) => {
        subject.tutorSubjects.forEach((ts) => {
          if (ts.tutor && ts.tutor.id) {
            tutorSet.add(ts.tutor.id);
          }
        });
      });

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        color: category.color,
        tutorCount: tutorSet.size,
        subjects: category.subjects.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
        })),
      };
    });

    res.json({ data: categoriesWithCounts });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      error: { message: "Failed to fetch categories" },
    });
  }
});

export default router;
