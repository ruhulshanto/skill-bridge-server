import { Router } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";
import { getHeadersInit } from "../lib/request";

const router: Router = Router();

// GET /api/tutor/profile - Get tutor profile
router.get("/profile", async (req, res) => {
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
      include: {
        subjects: {
          include: {
            subject: true,
          },
        },
        availability: true,
      },
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    // Convert hourly rate from cents to dollars for frontend
    const profileForFrontend = {
      ...tutorProfile,
      hourlyRate: Math.round(tutorProfile.hourlyRate / 100), // Convert cents to dollars
    };

    res.json({
      data: profileForFrontend,
    });
  } catch (error) {
    console.error("Error fetching tutor profile:", error);
    res.status(500).json({
      error: { message: "Internal server error" },
    });
  }
});

// GET /api/tutor/stats - Get tutor dashboard stats
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
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    // Get all bookings for this tutor
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        review: true,
      },
    });

    const totalSessions = bookings.length;
    const completedSessions = bookings.filter(b => b.status === "COMPLETED").length;
    const totalEarnings = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalReviews = bookings.filter(b => b.review).length;
    const averageRating = totalReviews > 0 
      ? bookings.reduce((sum, b) => sum + (b.review?.rating || 0), 0) / totalReviews 
      : 0;

    res.json({
      data: {
        totalSessions,
        completedSessions,
        totalEarnings: Math.round(totalEarnings / 100), // Convert cents to dollars
        rating: Math.round(averageRating * 10) / 10,
        totalReviews,
      },
    });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Internal server error" },
    });
  }
});

// GET /api/tutor/bookings - Get tutor bookings/sessions
router.get("/bookings", async (req, res) => {
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
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { tutorId: tutorProfile.id };
    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          review: true,
        },
        orderBy: { date: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching tutor bookings:", error);
    res.status(500).json({
      error: { message: "Internal server error" },
    });
  }
});

// GET /api/tutor/students - Get tutor students
router.get("/students", async (req, res) => {
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
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    // Get all bookings for this tutor to extract students
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        student: true,
        review: true,
      },
    });

    // Group bookings by student and calculate stats
    const studentMap = new Map();
    
    bookings.forEach(booking => {
      const studentId = booking.studentId;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: booking.student.id,
          name: booking.student.name,
          email: booking.student.email,
          image: booking.student.image,
          subject: "General", // You might want to track this separately
          totalSessions: 0,
          completedSessions: 0,
          upcomingSessions: 0,
          lastSession: null,
          ratings: [],
        });
      }
      
      const student = studentMap.get(studentId);
      student.totalSessions++;
      
      if (booking.status === "COMPLETED") {
        student.completedSessions++;
        if (booking.review) {
          student.ratings.push(booking.review.rating);
        }
      } else if (booking.status === "CONFIRMED") {
        student.upcomingSessions++;
      }
      
      if (!student.lastSession || new Date(booking.date) > new Date(student.lastSession)) {
        student.lastSession = booking.date;
      }
    });

    // Convert map to array and calculate average ratings
    const students = Array.from(studentMap.values()).map(student => ({
      ...student,
      rating: student.ratings.length > 0 
        ? student.ratings.reduce((sum: number, r: number) => sum + r, 0) / student.ratings.length 
        : undefined,
    }));

    res.json({
      data: students,
    });
  } catch (error) {
    console.error("Error fetching tutor students:", error);
    res.status(500).json({
      error: { message: "Internal server error" },
    });
  }
});

// GET /api/tutor/availability - Get tutor availability
router.get("/availability", async (req, res) => {
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
      include: {
        availability: true,
      },
    });

    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    res.json({
      data: tutorProfile.availability || [],
    });
  } catch (error) {
    console.error("Error fetching tutor availability:", error);
    res.status(500).json({
      error: { message: "Internal server error" },
    });
  }
});

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

    // Validate required fields
    if (hourlyRate !== undefined && (typeof hourlyRate !== 'number' || hourlyRate < 0)) {
      return res.status(400).json({
        error: { message: "Invalid hourly rate" },
      });
    }

    if (experience !== undefined && (typeof experience !== 'number' || experience < 0)) {
      return res.status(400).json({
        error: { message: "Invalid experience" },
      });
    }

    // Convert hourly rate to cents for database storage
    const hourlyRateInCents = hourlyRate ? Math.round(hourlyRate * 100) : undefined;

    // Build update object with only provided fields
    const updateData: any = {};
    if (bio !== undefined) updateData.bio = bio;
    if (hourlyRateInCents !== undefined) updateData.hourlyRate = hourlyRateInCents;
    if (experience !== undefined) updateData.experience = experience;
    if (education !== undefined) updateData.education = education;

    const tutorProfile = await prisma.tutorProfile.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        bio: bio || "",
        hourlyRate: hourlyRateInCents || 5000, // Default $50/hour in cents
        experience: experience || 0,
        education: education || "",
      },
    });

    // Handle subjects update
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

    // Handle availability update
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

    // Fetch the updated profile with all relations
    const updatedProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        subjects: {
          include: {
            subject: true,
          },
        },
        availability: true,
      },
    });

    // Convert hourly rate from cents to dollars for frontend response
    const profileForFrontend = updatedProfile ? {
      ...updatedProfile,
      hourlyRate: Math.round(updatedProfile.hourlyRate / 100), // Convert cents to dollars
    } : null;

    res.json({
      data: profileForFrontend,
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

// GET /api/tutor/students - Get all students who have booked sessions with this tutor
router.get("/students", async (req, res) => {
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
      select: { id: true },
    });

    if (!tutorProfile) {
      return res.json({ data: [] });
    }

    // Get all unique students who have booked sessions with this tutor
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        review: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Group bookings by student and calculate statistics
    const studentMap = new Map();

    for (const booking of bookings) {
      const studentId = booking.studentId;
      
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: studentId,
          name: booking.student.name,
          email: booking.student.email,
          image: booking.student.image,
          subject: "General", // You can enhance this based on your schema
          totalSessions: 0,
          completedSessions: 0,
          upcomingSessions: 0,
          lastSession: null,
          ratings: [],
        });
      }

      const studentData = studentMap.get(studentId);
      studentData.totalSessions++;

      if (booking.status === "COMPLETED") {
        studentData.completedSessions++;
      } else if (booking.status === "CONFIRMED") {
        studentData.upcomingSessions++;
      }

      // Track last session date
      if (!studentData.lastSession || new Date(booking.date) > new Date(studentData.lastSession)) {
        studentData.lastSession = booking.date;
      }

      // Collect ratings
      if (booking.review?.rating) {
        studentData.ratings.push(booking.review.rating);
      }
    }

    // Convert map to array and calculate average ratings
    const students = Array.from(studentMap.values()).map(student => ({
      id: student.id,
      name: student.name,
      email: student.email,
      image: student.image,
      subject: student.subject,
      totalSessions: student.totalSessions,
      completedSessions: student.completedSessions,
      upcomingSessions: student.upcomingSessions,
      lastSession: student.lastSession,
      rating: student.ratings.length > 0 
        ? student.ratings.reduce((sum: number, r: number) => sum + r, 0) / student.ratings.length 
        : undefined,
    }));

    res.json({ data: students });
  } catch (error) {
    console.error("Error fetching tutor students:", error);
    res.status(500).json({
      error: { message: "Failed to fetch students" },
    });
  }
});

export default router;
