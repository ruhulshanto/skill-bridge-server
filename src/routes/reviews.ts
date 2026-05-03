import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";
import { createReviewSchema } from "../lib/validators.js";

const router: Router = Router();

function bookingSessionEnded(booking: { date: Date; endTime: string }): boolean {
  const d = new Date(booking.date);
  const parts = booking.endTime.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? "0");
  const end = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0,
    0,
    0
  );
  return Date.now() > end.getTime();
}

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
          in: ["CONFIRMED", "COMPLETED"],
        },
      },
      include: {
        tutor: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        error: {
          message:
            "Booking not found, or you can only review your own eligible sessions.",
        },
      });
    }

    const ended =
      booking.status === "COMPLETED" || bookingSessionEnded(booking);

    if (!ended) {
      return res.status(403).json({
        error: {
          message:
            "You can leave a review after your scheduled session has ended.",
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
        tutorId: booking.tutorId,
        studentId: session.user.id,
        rating,
        comment: comment ?? null,
      },
    });

    const reviews = await prisma.review.findMany({
      where: { tutorId: booking.tutorId },
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

    // ── Create Notifications for Tutor and Admins ──
    try {
      // 1. Notify the tutor
      await (prisma as any).notification.create({
        data: {
          userId: booking.tutor.userId,
          title: "New Review Received",
          message: `${session.user.name || 'A student'} left a ${rating}-star review for your session.`,
          type: "REVIEW",
          link: "/tutor/sessions",
        }
      });
      console.log(`Notified tutor ${booking.tutor.userId} about new review.`);

      // 2. Notify all admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      if (admins.length > 0) {
        const result = await (prisma as any).notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            title: "New Review Posted",
            message: `${session.user.name || 'A student'} reviewed tutor: ${rating} stars.`,
            type: "REVIEW",
            link: "/admin/bookings",
          }))
        });
        console.log(`Successfully created ${result.count} notifications for admins about new review.`);
      }
    } catch (notifError) {
      console.error("Failed to create review notifications:", notifError);
    }

    res.status(201).json({ data: review });
  } catch (error) {
    console.error("Error creating review:", error);
    const detail =
      error instanceof Error ? error.message.slice(0, 280) : "unknown error";
    res.status(500).json({
      error: { message: `Failed to create review: ${detail}` },
    });
  }
});

// GET /api/reviews/tutor/:tutorId - Get reviews for a specific tutor
router.get("/tutor/:tutorId", async (req, res) => {
  try {
    const { tutorId } = req.params;

    const reviews = await prisma.review.findMany({
      where: {
        tutorId,
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
