import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";
import { getHeadersInit } from "../lib/request";
import { createReviewSchema } from "../lib/validators";

const router: Router = Router();

// POST /api/reviews - Create review (student, after session)
router.post("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const parseResult = createReviewSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }
    const { bookingId, rating, comment } = parseResult.data;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        studentId: session.user.id,
        status: {
          in: ["CONFIRMED", "COMPLETED"]
        }
      },
      include: {
        tutor: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        error: {
          message:
            "Booking not found, or you can only review your own completed sessions.",
        },
      });
    }

    const existing = await prisma.review.findUnique({
      where: { bookingId },
    });
    if (existing) {
      return res.status(409).json({
        error: { message: "You have already reviewed this session." },
      });
    }

    const review = await prisma.review.create({
      data: {
        bookingId,
        studentId: session.user.id,
        rating,
        comment: comment ?? null,
      },
    });

    // Update tutor profile rating
    const reviews = await prisma.review.findMany({
      where: { booking: { tutorId: booking.tutorId } },
      select: { rating: true },
    });
    const totalReviews = reviews.length;
    const avgRating =
      totalReviews > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews
        : 0;

    await prisma.tutorProfile.update({
      where: { id: booking.tutorId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        totalReviews,
      },
    });

    res.status(201).json({ data: review });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      error: { message: "Failed to create review" },
    });
  }
});

// GET /api/reviews/tutor/:tutorId - Get reviews for a specific tutor
router.get("/tutor/:tutorId", async (req, res) => {
  try {
    const { tutorId } = req.params;

    const reviews = await prisma.review.findMany({
      where: {
        booking: {
          tutorId: tutorId
        }
      },
      include: {
        student: {
          select: {
            name: true,
            image: true
          }
        },
        booking: {
          select: {
            date: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      data: reviews.map(review => ({
        id: review.id,
        user: review.student.name,
        userImage: review.student.image,
        rating: review.rating,
        comment: review.comment,
        date: review.booking.date,
        createdAt: review.createdAt
      }))
    });
  } catch (error) {
    console.error("Error fetching tutor reviews:", error);
    res.status(500).json({
      error: { message: "Failed to fetch reviews" },
    });
  }
});

export default router;
