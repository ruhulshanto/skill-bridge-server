import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";
import { getHeadersInit } from "../lib/request";

const router: Router = Router();

// PUT /api/tutor/profile - Update tutor profile (assignment: PUT /api/tutor/profile)
router.put("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const {
      bio,
      hourlyRate,
      experience,
      education,
      subjects,
      availability,
    } = req.body;

    const tutorProfile = await prisma.tutorProfile.upsert({
      where: { userId: session.user.id },
      update: {
        bio,
        hourlyRate,
        experience,
        education,
      },
      create: {
        userId: session.user.id,
        bio,
        hourlyRate,
        experience,
        education,
      },
    });

    if (subjects && Array.isArray(subjects)) {
      await prisma.tutorSubject.deleteMany({
        where: { tutorId: tutorProfile.id },
      });
      if (subjects.length > 0) {
        await prisma.tutorSubject.createMany({
          data: subjects.map((subjectId: string) => ({
            tutorId: tutorProfile.id,
            subjectId,
          })),
        });
      }
    }

    if (availability && Array.isArray(availability)) {
      await prisma.availability.deleteMany({
        where: { tutorId: tutorProfile.id },
      });
      if (availability.length > 0) {
        await prisma.availability.createMany({
          data: availability.map((avail: { dayOfWeek: number; startTime: string; endTime: string; isAvailable?: boolean }) => ({
            tutorId: tutorProfile.id,
            dayOfWeek: avail.dayOfWeek,
            startTime: avail.startTime,
            endTime: avail.endTime,
            isAvailable: avail.isAvailable ?? true,
          })),
        });
      }
    }

    res.json({
      data: { message: "Profile updated successfully" },
    });
  } catch (error) {
    console.error("Error updating tutor profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" },
    });
  }
});

// PUT /api/tutor/availability - Update availability only (assignment: PUT /api/tutor/availability)
router.put("/availability", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const body = req.body;
    const availability = Array.isArray(body) ? body : body?.availability;
    if (!Array.isArray(availability)) {
      return res.status(400).json({
        error: { message: "availability must be an array (or body.availability)" },
      });
    }

    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found. Create profile first." },
      });
    }

    await prisma.availability.deleteMany({
      where: { tutorId: tutorProfile.id },
    });

    if (availability.length > 0) {
      await prisma.availability.createMany({
        data: availability.map((avail: { dayOfWeek: number; startTime: string; endTime: string; isAvailable?: boolean }) => ({
          tutorId: tutorProfile.id,
          dayOfWeek: avail.dayOfWeek,
          startTime: avail.startTime,
          endTime: avail.endTime,
          isAvailable: avail.isAvailable ?? true,
        })),
      });
    }

    res.json({
      data: { message: "Availability updated successfully" },
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({
      error: { message: "Failed to update availability" },
    });
  }
});

// GET /api/tutor/stats - Tutor dashboard stats (sessions, earnings, etc.)
router.get("/stats", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, rating: true, totalReviews: true },
    });

    if (!tutorProfile) {
      return res.json({
        data: {
          totalSessions: 0,
          completedSessions: 0,
          totalEarnings: 0,
          rating: 0,
          totalReviews: 0,
        },
      });
    }

    const [totalBookings, completedBookings, earningsResult] = await Promise.all([
      prisma.booking.count({
        where: { tutorId: tutorProfile.id },
      }),
      prisma.booking.count({
        where: {
          tutorId: tutorProfile.id,
          status: "COMPLETED",
        },
      }),
      prisma.booking.aggregate({
        where: {
          tutorId: tutorProfile.id,
          status: "COMPLETED",
        },
        _sum: { totalAmount: true },
      }),
    ]);

    res.json({
      data: {
        totalSessions: totalBookings,
        completedSessions: completedBookings,
        totalEarnings: earningsResult._sum.totalAmount ?? 0,
        rating: tutorProfile.rating,
        totalReviews: tutorProfile.totalReviews,
      },
    });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch stats" },
    });
  }
});

export default router;
