import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

// GET /api/tutor/profile - Get tutor profile
router.get("/profile", async (req: Request, res: Response) => {
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
       hourlyRate: tutorProfile.hourlyRate / 100, // Convert cents to dollars
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
router.get("/stats", async (req: Request, res: Response) => {
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
        totalEarnings: totalEarnings / 100, // Convert cents to dollars
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
router.get("/bookings", async (req: Request, res: Response) => {
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
      data: bookings.map(b => ({ ...b, totalAmount: (b.totalAmount || 0) / 100 })),
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
router.get("/students", async (req: Request, res: Response) => {
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
router.get("/availability", async (req: Request, res: Response) => {
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
router.put("/profile", async (req: Request, res: Response) => {
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
       hourlyRate: updatedProfile.hourlyRate / 100, // Convert cents to dollars
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
router.put("/availability", async (req: Request, res: Response) => {
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
router.get("/stats", async (req: Request, res: Response) => {
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

    const [totalBookings, completedBookings, earningsResult, uniqueStudents] = await Promise.all([
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
      prisma.booking.groupBy({
        by: ['studentId'],
        where: { tutorId: tutorProfile.id },
      }),
    ]);

    res.json({
      data: {
        totalSessions: totalBookings,
        completedSessions: completedBookings,
        totalEarnings: Math.round((earningsResult._sum.totalAmount ?? 0) / 100),
        rating: tutorProfile.rating,
        totalReviews: tutorProfile.totalReviews,
        totalStudents: uniqueStudents.length,
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
router.get("/students", async (req: Request, res: Response) => {
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

// GET /api/tutor/application - Get current application status
router.get("/application", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const application = await prisma.tutorApplication.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ data: application });
  } catch (error) {
    console.error("Error fetching tutor application:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

// POST /api/tutor/apply - Submit tutor application
router.post("/apply", async (req: Request, res: Response) => {
  try {
    console.log("[DEBUG] Tutor Application Hit");
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      console.log("[DEBUG] Unauthorized application attempt");
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // Check if already pending or approved
    const existing = await prisma.tutorApplication.findFirst({
      where: { 
        userId: session.user.id,
        status: { in: ['PENDING', 'APPROVED'] }
      }
    });

    if (existing) {
      return res.status(400).json({ 
        error: { message: `You already have a ${existing.status.toLowerCase()} application.` } 
      });
    }

    const { expertise, bio, experience, hourlyRate, subjects, education, portfolioUrl } = req.body;

    // Strict validation
    if (!expertise || !bio || !experience || !hourlyRate || !subjects) {
      return res.status(400).json({ error: { message: "Missing required fields" } });
    }

    const parsedExperience = parseInt(experience, 10);
    const parsedHourlyRate = parseInt(hourlyRate, 10) * 100; // to cents

    if (isNaN(parsedExperience) || isNaN(parsedHourlyRate)) {
      return res.status(400).json({ error: { message: "Invalid experience or hourly rate" } });
    }

    // Process subjects string into Subject records
    const subjectsArray = subjects.split(',').map((s: string) => s.trim()).filter(Boolean);
    const subjectIds: string[] = [];

    for (const subjName of subjectsArray) {
      let subject = await prisma.subject.findFirst({
        where: { name: { equals: subjName, mode: 'insensitive' } }
      });
      
      if (!subject) {
        const slug = subjName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        // Check if slug exists to avoid unique constraint violation
        let existingSlug = await prisma.subject.findUnique({ where: { slug } });
        if (existingSlug) {
          subjectIds.push(existingSlug.id);
          continue;
        }
        subject = await prisma.subject.create({
          data: { name: subjName, slug }
        });
      }
      subjectIds.push(subject.id);
    }

    const application = await prisma.tutorApplication.create({
      data: {
        userId: session.user.id,
        expertise,
        bio,
        education: education || null,
        portfolioUrl: portfolioUrl || null,
        experience: parsedExperience,
        hourlyRate: parsedHourlyRate,
        subjectIds,
        status: 'PENDING'
      }
    });

    // ── Create Notifications for Admins ──
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      console.log(`Found ${admins.length} admins to notify.`);

      if (admins.length > 0) {
        const result = await (prisma as any).notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            title: "New Tutor Application",
            message: `${session.user.name || 'A user'} has applied to become a tutor.`,
            type: "APPLICATION",
            link: `/admin/applications/${application.id}`,
          }))
        });
        console.log(`Successfully created ${result.count} notifications for admins.`);
      }
    } catch (notifError) {
      console.error("Failed to create admin notifications:", notifError);
    }

    res.status(201).json({ data: application });
  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

export default router;
