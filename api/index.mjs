// src/app.ts
import express from "express";
import { toNodeHandler } from "better-auth/node";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// src/lib/prisma.ts
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
var connectionString = process.env.DATABASE_URL;
var pool = new Pool({ connectionString });
var adapter = new PrismaPg(pool);
var prisma = new PrismaClient({ adapter });

// src/lib/auth.ts
import nodemailer from "nodemailer";
var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  // Use true for port 465, false for port 587
  auth: {
    user: process.env.APP_USER,
    pass: process.env.APP_PASS
  }
});
var auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "STUDENT"
      },
      phone: {
        type: "string"
      },
      status: {
        type: "string",
        defaultValue: "ACTIVE"
      }
    }
  },
  trustedOrigins: [
    process.env.APP_URL || "http://localhost:3000",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://192.168.0.173:3000"
  ].filter(Boolean),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
    minPasswordLength: 6,
    maxPasswordLength: 128
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true
  },
  socialProviders: {
    google: {
      prompt: "select_account consent",
      accessType: "offline",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  }
});

// src/app.ts
import cors from "cors";

// src/routes/tutors.ts
import { Router } from "express";

// src/lib/request.ts
function getHeadersInit(headers) {
  const entries = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) {
      for (const v of value) entries.push([key, v]);
    } else {
      entries.push([key, value]);
    }
  }
  return entries;
}

// src/routes/tutors.ts
var router = Router();
router.get("/", async (req, res) => {
  try {
    const {
      category,
      search,
      page = "1",
      limit = "10",
      minRating,
      maxRate
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const tutorProfileWhere = {};
    if (category) {
      tutorProfileWhere.subjects = {
        some: {
          subject: { slug: category }
        }
      };
    }
    if (minRating) {
      tutorProfileWhere.rating = { gte: parseFloat(minRating) };
    }
    if (maxRate) {
      tutorProfileWhere.hourlyRate = { lte: parseInt(maxRate) };
    }
    const where = {
      role: "TUTOR"
    };
    if (Object.keys(tutorProfileWhere).length > 0) {
      where.tutorProfile = tutorProfileWhere;
    }
    if (search) {
      const searchConditions = [
        { name: { contains: search, mode: "insensitive" } },
        {
          tutorProfile: {
            bio: { contains: search, mode: "insensitive" }
          }
        }
      ];
      if (Object.keys(tutorProfileWhere).length > 0) {
        searchConditions.push({
          tutorProfile: tutorProfileWhere
        });
      }
      where.AND = [
        { role: "TUTOR" },
        {
          OR: searchConditions
        }
      ];
      delete where.role;
      delete where.tutorProfile;
    }
    const [tutors, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tutorProfile: {
            include: {
              subjects: {
                include: {
                  subject: true
                }
              }
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: [
          // Order by tutors with profiles first (by rating), then by name
          {
            tutorProfile: {
              rating: "desc"
            }
          },
          {
            name: "asc"
          }
        ]
      }),
      prisma.user.count({ where })
    ]);
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      data: tutors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error fetching tutors:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutors" }
    });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tutor = await prisma.user.findFirst({
      where: {
        id,
        role: "TUTOR"
        // Removed isVerified requirement - all tutors should be visible
      },
      include: {
        tutorProfile: {
          include: {
            subjects: {
              include: {
                subject: true
              }
            },
            availability: true
          }
        }
      }
    });
    if (!tutor) {
      return res.status(404).json({
        error: { message: "Tutor not found" }
      });
    }
    const reviews = await prisma.review.findMany({
      where: {
        booking: {
          tutorId: id
        }
      },
      include: {
        student: {
          select: {
            name: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });
    res.json({
      data: {
        ...tutor,
        reviews
      }
    });
  } catch (error) {
    console.error("Error fetching tutor:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutor" }
    });
  }
});
router.put("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const {
      bio,
      hourlyRate,
      experience,
      education,
      subjects,
      availability
    } = req.body;
    const tutorProfile = await prisma.tutorProfile.upsert({
      where: {
        userId: session.user.id
      },
      update: {
        bio,
        hourlyRate,
        experience,
        education
      },
      create: {
        userId: session.user.id,
        bio,
        hourlyRate,
        experience,
        education
      }
    });
    if (subjects && Array.isArray(subjects)) {
      await prisma.tutorSubject.deleteMany({
        where: {
          tutorId: tutorProfile.id
        }
      });
      if (subjects.length > 0) {
        await prisma.tutorSubject.createMany({
          data: subjects.map((subjectId) => ({
            tutorId: tutorProfile.id,
            subjectId
          }))
        });
      }
    }
    if (availability && Array.isArray(availability)) {
      await prisma.availability.deleteMany({
        where: {
          tutorId: tutorProfile.id
        }
      });
      if (availability.length > 0) {
        await prisma.availability.createMany({
          data: availability.map((avail) => ({
            tutorId: tutorProfile.id,
            dayOfWeek: avail.dayOfWeek,
            startTime: avail.startTime,
            endTime: avail.endTime,
            isAvailable: avail.isAvailable ?? true
          }))
        });
      }
    }
    res.json({
      data: { message: "Profile updated successfully" }
    });
  } catch (error) {
    console.error("Error updating tutor profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" }
    });
  }
});
var tutors_default = router;

// src/routes/tutor.ts
import { Router as Router2 } from "express";
var router2 = Router2();
router2.get("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        subjects: {
          include: {
            subject: true
          }
        },
        availability: true
      }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    const profileForFrontend = {
      ...tutorProfile,
      hourlyRate: Math.round(tutorProfile.hourlyRate / 100)
      // Convert cents to dollars
    };
    res.json({
      data: profileForFrontend
    });
  } catch (error) {
    console.error("Error fetching tutor profile:", error);
    res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
});
router2.get("/stats", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        review: true
      }
    });
    const totalSessions = bookings.length;
    const completedSessions = bookings.filter((b) => b.status === "COMPLETED").length;
    const totalEarnings = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const totalReviews = bookings.filter((b) => b.review).length;
    const averageRating = totalReviews > 0 ? bookings.reduce((sum, b) => sum + (b.review?.rating || 0), 0) / totalReviews : 0;
    res.json({
      data: {
        totalSessions,
        completedSessions,
        totalEarnings: Math.round(totalEarnings / 100),
        // Convert cents to dollars
        rating: Math.round(averageRating * 10) / 10,
        totalReviews
      }
    });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
});
router2.get("/bookings", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = { tutorId: tutorProfile.id };
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
              image: true
            }
          },
          review: true
        },
        orderBy: { date: "desc" },
        skip,
        take: limitNum
      }),
      prisma.booking.count({ where })
    ]);
    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Error fetching tutor bookings:", error);
    res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
});
router2.get("/students", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        student: true,
        review: true
      }
    });
    const studentMap = /* @__PURE__ */ new Map();
    bookings.forEach((booking) => {
      const studentId = booking.studentId;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: booking.student.id,
          name: booking.student.name,
          email: booking.student.email,
          image: booking.student.image,
          subject: "General",
          // You might want to track this separately
          totalSessions: 0,
          completedSessions: 0,
          upcomingSessions: 0,
          lastSession: null,
          ratings: []
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
    const students = Array.from(studentMap.values()).map((student) => ({
      ...student,
      rating: student.ratings.length > 0 ? student.ratings.reduce((sum, r) => sum + r, 0) / student.ratings.length : void 0
    }));
    res.json({
      data: students
    });
  } catch (error) {
    console.error("Error fetching tutor students:", error);
    res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
});
router2.get("/availability", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        availability: true
      }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    res.json({
      data: tutorProfile.availability || []
    });
  } catch (error) {
    console.error("Error fetching tutor availability:", error);
    res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
});
router2.put("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const {
      bio,
      hourlyRate,
      experience,
      education,
      subjects,
      availability
    } = req.body;
    if (hourlyRate !== void 0 && (typeof hourlyRate !== "number" || hourlyRate < 0)) {
      return res.status(400).json({
        error: { message: "Invalid hourly rate" }
      });
    }
    if (experience !== void 0 && (typeof experience !== "number" || experience < 0)) {
      return res.status(400).json({
        error: { message: "Invalid experience" }
      });
    }
    const hourlyRateInCents = hourlyRate ? Math.round(hourlyRate * 100) : void 0;
    const updateData = {};
    if (bio !== void 0) updateData.bio = bio;
    if (hourlyRateInCents !== void 0) updateData.hourlyRate = hourlyRateInCents;
    if (experience !== void 0) updateData.experience = experience;
    if (education !== void 0) updateData.education = education;
    const tutorProfile = await prisma.tutorProfile.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        bio: bio || "",
        hourlyRate: hourlyRateInCents || 5e3,
        // Default $50/hour in cents
        experience: experience || 0,
        education: education || ""
      }
    });
    if (subjects && Array.isArray(subjects)) {
      await prisma.tutorSubject.deleteMany({
        where: { tutorId: tutorProfile.id }
      });
      if (subjects.length > 0) {
        await prisma.tutorSubject.createMany({
          data: subjects.map((subjectId) => ({
            tutorId: tutorProfile.id,
            subjectId
          }))
        });
      }
    }
    if (availability && Array.isArray(availability)) {
      await prisma.availability.deleteMany({
        where: { tutorId: tutorProfile.id }
      });
      if (availability.length > 0) {
        await prisma.availability.createMany({
          data: availability.map((avail) => ({
            tutorId: tutorProfile.id,
            dayOfWeek: avail.dayOfWeek,
            startTime: avail.startTime,
            endTime: avail.endTime,
            isAvailable: avail.isAvailable ?? true
          }))
        });
      }
    }
    const updatedProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        subjects: {
          include: {
            subject: true
          }
        },
        availability: true
      }
    });
    const profileForFrontend = updatedProfile ? {
      ...updatedProfile,
      hourlyRate: Math.round(updatedProfile.hourlyRate / 100)
      // Convert cents to dollars
    } : null;
    res.json({
      data: profileForFrontend
    });
  } catch (error) {
    console.error("Error updating tutor profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" }
    });
  }
});
router2.put("/availability", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const body = req.body;
    const availability = Array.isArray(body) ? body : body?.availability;
    if (!Array.isArray(availability)) {
      return res.status(400).json({
        error: { message: "availability must be an array (or body.availability)" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });
    if (!tutorProfile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found. Create profile first." }
      });
    }
    await prisma.availability.deleteMany({
      where: { tutorId: tutorProfile.id }
    });
    if (availability.length > 0) {
      await prisma.availability.createMany({
        data: availability.map((avail) => ({
          tutorId: tutorProfile.id,
          dayOfWeek: avail.dayOfWeek,
          startTime: avail.startTime,
          endTime: avail.endTime,
          isAvailable: avail.isAvailable ?? true
        }))
      });
    }
    res.json({
      data: { message: "Availability updated successfully" }
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({
      error: { message: "Failed to update availability" }
    });
  }
});
router2.get("/stats", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, rating: true, totalReviews: true }
    });
    if (!tutorProfile) {
      return res.json({
        data: {
          totalSessions: 0,
          completedSessions: 0,
          totalEarnings: 0,
          rating: 0,
          totalReviews: 0
        }
      });
    }
    const [totalBookings, completedBookings, earningsResult] = await Promise.all([
      prisma.booking.count({
        where: { tutorId: tutorProfile.id }
      }),
      prisma.booking.count({
        where: {
          tutorId: tutorProfile.id,
          status: "COMPLETED"
        }
      }),
      prisma.booking.aggregate({
        where: {
          tutorId: tutorProfile.id,
          status: "COMPLETED"
        },
        _sum: { totalAmount: true }
      })
    ]);
    res.json({
      data: {
        totalSessions: totalBookings,
        completedSessions: completedBookings,
        totalEarnings: earningsResult._sum.totalAmount ?? 0,
        rating: tutorProfile.rating,
        totalReviews: tutorProfile.totalReviews
      }
    });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch stats" }
    });
  }
});
router2.get("/students", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "TUTOR") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });
    if (!tutorProfile) {
      return res.json({ data: [] });
    }
    const bookings = await prisma.booking.findMany({
      where: { tutorId: tutorProfile.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        review: {
          select: {
            rating: true
          }
        }
      },
      orderBy: {
        date: "desc"
      }
    });
    const studentMap = /* @__PURE__ */ new Map();
    for (const booking of bookings) {
      const studentId = booking.studentId;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: studentId,
          name: booking.student.name,
          email: booking.student.email,
          image: booking.student.image,
          subject: "General",
          // You can enhance this based on your schema
          totalSessions: 0,
          completedSessions: 0,
          upcomingSessions: 0,
          lastSession: null,
          ratings: []
        });
      }
      const studentData = studentMap.get(studentId);
      studentData.totalSessions++;
      if (booking.status === "COMPLETED") {
        studentData.completedSessions++;
      } else if (booking.status === "CONFIRMED") {
        studentData.upcomingSessions++;
      }
      if (!studentData.lastSession || new Date(booking.date) > new Date(studentData.lastSession)) {
        studentData.lastSession = booking.date;
      }
      if (booking.review?.rating) {
        studentData.ratings.push(booking.review.rating);
      }
    }
    const students = Array.from(studentMap.values()).map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      image: student.image,
      subject: student.subject,
      totalSessions: student.totalSessions,
      completedSessions: student.completedSessions,
      upcomingSessions: student.upcomingSessions,
      lastSession: student.lastSession,
      rating: student.ratings.length > 0 ? student.ratings.reduce((sum, r) => sum + r, 0) / student.ratings.length : void 0
    }));
    res.json({ data: students });
  } catch (error) {
    console.error("Error fetching tutor students:", error);
    res.status(500).json({
      error: { message: "Failed to fetch students" }
    });
  }
});
var tutor_default = router2;

// src/routes/bookings.ts
import { Router as Router3 } from "express";

// src/lib/validators.ts
import { z } from "zod";
var createBookingSchema = z.object({
  tutorId: z.string().min(1, "tutorId is required"),
  date: z.string().min(1, "date is required"),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/, "endTime must be HH:MM"),
  notes: z.string().optional()
});
var createReviewSchema = z.object({
  bookingId: z.string().min(1, "bookingId is required"),
  rating: z.coerce.number().min(1).max(5).default(5),
  comment: z.string().optional()
});

// src/routes/bookings.ts
var router3 = Router3();
router3.post("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const parseResult = createBookingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors
        }
      });
    }
    const { tutorId, date, startTime, endTime, notes } = parseResult.data;
    const tutorProfile = await prisma.tutorProfile.findFirst({
      where: {
        id: tutorId
      },
      include: {
        user: {
          select: { id: true, role: true }
        }
      }
    });
    if (!tutorProfile || tutorProfile.user?.role !== "TUTOR") {
      return res.status(404).json({
        error: { message: "Tutor not found" }
      });
    }
    const [year, month, day] = date.split("-").map(Number);
    const bookingDate = new Date(year, month - 1, day);
    const existingBooking = await prisma.booking.findFirst({
      where: {
        tutorId,
        date: bookingDate,
        status: {
          in: ["CONFIRMED", "COMPLETED"]
        },
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } }
            ]
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } }
            ]
          }
        ]
      }
    });
    if (existingBooking) {
      return res.status(409).json({
        error: { message: "Time slot already booked" }
      });
    }
    const booking = await prisma.booking.create({
      data: {
        studentId: session.user.id,
        tutorId: tutorProfile.id,
        date: bookingDate,
        startTime,
        endTime,
        status: "CONFIRMED",
        totalAmount: tutorProfile.hourlyRate,
        notes: notes ?? null
      },
      include: {
        student: {
          select: {
            name: true,
            email: true
          }
        },
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    res.status(201).json({
      data: booking
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      error: { message: "Failed to create booking" }
    });
  }
});
router3.get("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = {
      studentId: session.user.id
    };
    if (status) {
      where.status = status;
    }
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          tutor: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          review: true
        },
        skip,
        take: limitNum,
        orderBy: {
          date: "desc"
        }
      }),
      prisma.booking.count({ where })
    ]);
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error fetching student bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" }
    });
  }
});
router3.get("/my", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = {};
    if (session.user.role === "STUDENT") {
      where.studentId = session.user.id;
    } else if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });
      if (!profile) {
        return res.json({
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 }
        });
      }
      where.tutorId = profile.id;
    }
    if (status) {
      where.status = status;
    }
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          student: {
            select: {
              name: true,
              image: true
            }
          },
          tutor: {
            select: {
              id: true,
              hourlyRate: true
            },
            include: {
              user: {
                select: {
                  name: true,
                  image: true
                }
              }
            }
          },
          review: true
        },
        skip,
        take: limitNum,
        orderBy: {
          date: "desc"
        }
      }),
      prisma.booking.count({ where })
    ]);
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" }
    });
  }
});
router3.patch("/:id", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { id } = req.params;
    const { status, date, startTime, endTime } = req.body;
    const booking = await prisma.booking.findFirst({
      where: {
        id
      }
    });
    if (!booking) {
      return res.status(404).json({
        error: { message: "Booking not found" }
      });
    }
    if (session.user.role === "STUDENT" && booking.studentId !== session.user.id) {
      return res.status(403).json({
        error: { message: "Forbidden" }
      });
    }
    if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });
      if (!profile || booking.tutorId !== profile.id) {
        return res.status(403).json({
          error: { message: "Forbidden" }
        });
      }
    }
    const updateData = { status };
    if (date || startTime || endTime) {
      if (session.user.role !== "STUDENT" || booking.studentId !== session.user.id) {
        return res.status(403).json({
          error: { message: "Only students can reschedule their own bookings" }
        });
      }
      if (booking.status !== "CONFIRMED") {
        return res.status(400).json({
          error: { message: "Only confirmed bookings can be rescheduled" }
        });
      }
      let newDate = booking.date;
      if (date) {
        const [year, month, day] = date.split("-").map(Number);
        newDate = new Date(year, month - 1, day);
      }
      const newStartTime = startTime || booking.startTime;
      const newEndTime = endTime || booking.endTime;
      const conflictBooking = await prisma.booking.findFirst({
        where: {
          tutorId: booking.tutorId,
          date: newDate,
          status: {
            in: ["CONFIRMED", "COMPLETED"]
          },
          id: { not: id },
          // Exclude current booking
          OR: [
            {
              AND: [
                { startTime: { lte: newStartTime } },
                { endTime: { gt: newStartTime } }
              ]
            },
            {
              AND: [
                { startTime: { lt: newEndTime } },
                { endTime: { gte: newEndTime } }
              ]
            }
          ]
        }
      });
      if (conflictBooking) {
        return res.status(409).json({
          error: { message: "Time slot already booked" }
        });
      }
      updateData.date = newDate;
      updateData.startTime = newStartTime;
      updateData.endTime = newEndTime;
    }
    const updatedBooking = await prisma.booking.update({
      where: {
        id
      },
      data: updateData,
      include: {
        student: {
          select: {
            name: true,
            email: true
          }
        },
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    res.json({
      data: updatedBooking
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({
      error: { message: "Failed to update booking" }
    });
  }
});
router3.get("/:id", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { id } = req.params;
    let tutorProfileId = null;
    if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });
      tutorProfileId = profile?.id ?? null;
    }
    const booking = await prisma.booking.findFirst({
      where: {
        id,
        OR: [
          { studentId: session.user.id },
          ...tutorProfileId ? [{ tutorId: tutorProfileId }] : []
        ]
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
            image: true
          }
        },
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            bio: true
          },
          include: {
            user: {
              select: {
                name: true,
                email: true,
                image: true
              }
            }
          }
        },
        review: true
      }
    });
    if (!booking) {
      return res.status(404).json({
        error: { message: "Booking not found" }
      });
    }
    res.json({
      data: booking
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      error: { message: "Failed to fetch booking" }
    });
  }
});
var bookings_default = router3;

// src/routes/categories.ts
import { Router as Router4 } from "express";
var router4 = Router4();
router4.get("/", async (_req, res) => {
  try {
    const categories = await prisma.subject.findMany({
      orderBy: { name: "asc" }
    });
    res.json({ data: categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      error: { message: "Failed to fetch categories" }
    });
  }
});
var categories_default = router4;

// src/routes/reviews.ts
import { Router as Router5 } from "express";
var router5 = Router5();
router5.post("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const parseResult = createReviewSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors
        }
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
        tutor: true
      }
    });
    if (!booking) {
      return res.status(404).json({
        error: {
          message: "Booking not found, or you can only review your own completed sessions."
        }
      });
    }
    const existing = await prisma.review.findUnique({
      where: { bookingId }
    });
    if (existing) {
      return res.status(409).json({
        error: { message: "You have already reviewed this session." }
      });
    }
    const review = await prisma.review.create({
      data: {
        bookingId,
        studentId: session.user.id,
        rating,
        comment: comment ?? null
      }
    });
    const reviews = await prisma.review.findMany({
      where: { booking: { tutorId: booking.tutorId } },
      select: { rating: true }
    });
    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : 0;
    await prisma.tutorProfile.update({
      where: { id: booking.tutorId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        totalReviews
      }
    });
    res.status(201).json({ data: review });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      error: { message: "Failed to create review" }
    });
  }
});
router5.get("/tutor/:tutorId", async (req, res) => {
  try {
    const { tutorId } = req.params;
    const reviews = await prisma.review.findMany({
      where: {
        booking: {
          tutorId
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
        createdAt: "desc"
      }
    });
    res.json({
      data: reviews.map((review) => ({
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
      error: { message: "Failed to fetch reviews" }
    });
  }
});
var reviews_default = router5;

// src/routes/admin.ts
import { Router as Router6 } from "express";
var router6 = Router6();
async function requireAdmin(req, res) {
  const session = await auth.api.getSession({
    headers: getHeadersInit(req.headers)
  });
  if (!session?.user || session.user.role !== "ADMIN") {
    res.status(403).json({ error: { message: "Forbidden" } });
    return false;
  }
  return true;
}
router6.get("/users", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { role, status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tutorProfile: {
            select: {
              id: true,
              hourlyRate: true,
              rating: true,
              totalReviews: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" }
      }),
      prisma.user.count({ where })
    ]);
    res.json({
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).json({
      error: { message: "Failed to fetch users" }
    });
  }
});
router6.patch("/users/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    const { status } = req.body;
    const user = await prisma.user.findUnique({
      where: { id }
    });
    if (!user) {
      return res.status(404).json({
        error: { message: "User not found" }
      });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: status ?? user.status
      }
    });
    res.json({ data: updated });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      error: { message: "Failed to update user" }
    });
  }
});
router6.patch("/tutors/:id/verify", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    const profile = await prisma.tutorProfile.findUnique({
      where: { id }
    });
    if (!profile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" }
      });
    }
    const updated = await prisma.tutorProfile.update({
      where: { id },
      data: { isVerified: true }
    });
    res.json({ data: updated });
  } catch (error) {
    console.error("Error verifying tutor:", error);
    res.status(500).json({
      error: { message: "Failed to verify tutor" }
    });
  }
});
router6.get("/bookings", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = {};
    if (status) where.status = status;
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          student: true,
          tutor: {
            include: {
              user: true
            }
          },
          review: true
        },
        skip,
        take: limitNum,
        orderBy: { date: "desc" }
      }),
      prisma.booking.count({ where })
    ]);
    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Error fetching admin bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" }
    });
  }
});
router6.get("/categories", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const categories = await prisma.subject.findMany({
      orderBy: { name: "asc" }
    });
    res.json({ data: categories });
  } catch (error) {
    console.error("Error fetching admin categories:", error);
    res.status(500).json({
      error: { message: "Failed to fetch categories" }
    });
  }
});
router6.post("/categories", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { name, slug, description, icon } = req.body;
    if (!name || !slug) {
      return res.status(400).json({
        error: { message: "name and slug are required" }
      });
    }
    const category = await prisma.subject.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, "-"),
        description: description ?? null,
        icon: icon ?? null
      }
    });
    res.status(201).json({ data: category });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      error: { message: "Failed to create category" }
    });
  }
});
router6.patch("/categories/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    const { name, slug, description, icon } = req.body;
    const category = await prisma.subject.update({
      where: { id },
      data: {
        ...name != null && { name },
        ...slug != null && { slug: slug.toLowerCase().replace(/\s+/g, "-") },
        ...description !== void 0 && { description },
        ...icon !== void 0 && { icon }
      }
    });
    res.json({ data: category });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      error: { message: "Failed to update category" }
    });
  }
});
router6.delete("/categories/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    await prisma.subject.delete({
      where: { id }
    });
    res.json({ data: { message: "Category deleted" } });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      error: { message: "Failed to delete category" }
    });
  }
});
router6.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        error: { message: "Name, email, and password are required" }
      });
    }
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    });
    if (existingAdmin) {
      const session = await auth.api.getSession({
        headers: getHeadersInit(req.headers)
      });
      if (!session?.user || session.user.role !== "ADMIN") {
        return res.status(403).json({
          error: { message: "Only existing admins can create new admins" }
        });
      }
    }
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    if (existingUser) {
      return res.status(400).json({
        error: { message: "Email already exists" }
      });
    }
    const result = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
        phone: "",
        // Required field
        role: "ADMIN"
      }
    });
    if (!result.user) {
      return res.status(400).json({
        error: { message: "Failed to create admin" }
      });
    }
    res.status(201).json({
      data: {
        message: "Admin created successfully",
        admin: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role
        }
      }
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({
      error: { message: "Failed to create admin" }
    });
  }
});
router6.get("/stats", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const [totalUsers, totalTutors, totalStudents, totalBookings, totalReviews] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "TUTOR" } }),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.booking.count(),
      prisma.review.count()
    ]);
    const completedBookings = await prisma.booking.count({
      where: { status: "COMPLETED" }
    });
    res.json({
      data: {
        totalUsers,
        totalTutors,
        totalStudents,
        totalBookings,
        completedBookings,
        totalReviews
      }
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch stats" }
    });
  }
});
router6.put("/profile", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { name, phone } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...name && { name },
        ...phone !== void 0 && { phone }
        // bio field removed - not in database schema
      }
    });
    res.json({
      data: updatedUser
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" }
    });
  }
});
var admin_default = router6;

// src/routes/student.ts
import { Router as Router7 } from "express";
var router7 = Router7();
router7.put("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const { name, phone } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...name && { name },
        ...phone !== void 0 && { phone }
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json({
      data: updatedUser
    });
  } catch (error) {
    console.error("Error updating student profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" }
    });
  }
});
router7.get("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!user) {
      return res.status(404).json({
        error: { message: "Student not found" }
      });
    }
    res.json({
      data: user
    });
  } catch (error) {
    console.error("Error fetching student profile:", error);
    res.status(500).json({
      error: { message: "Failed to fetch profile" }
    });
  }
});
var student_default = router7;

// src/app.ts
var app = express();
console.log("=== CORS DEBUG ===");
console.log("Raw APP_URL:", process.env.APP_URL);
var allowedOrigins = (process.env.APP_URL || "http://localhost:3000").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
console.log("Processed allowedOrigins:", allowedOrigins);
if (!allowedOrigins.includes("http://localhost:3000")) {
  allowedOrigins.push("http://localhost:3000");
}
if (!allowedOrigins.includes("http://localhost:3001")) {
  allowedOrigins.push("http://localhost:3001");
}
if (!allowedOrigins.includes("http://localhost:3002")) {
  allowedOrigins.push("http://localhost:3002");
}
console.log("Final allowedOrigins:", allowedOrigins);
console.log("=== END CORS DEBUG ===");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "").toLowerCase();
      const isAllowed = allowedOrigins.some((allowed) => {
        const normalizedAllowed = allowed.replace(/\/$/, "").toLowerCase();
        return normalizedAllowed === normalizedOrigin;
      });
      if (isAllowed) return cb(null, true);
      if (normalizedOrigin.includes("skill-bridge-client-ruddy.vercel.app")) {
        return cb(null, true);
      }
      console.log("CORS rejected origin:", origin, "Allowed origins:", allowedOrigins);
      return cb(null, false);
    },
    credentials: true
  })
);
app.use(express.json());
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use("/api/tutors", tutors_default);
app.use("/api/tutor", tutor_default);
app.use("/api/bookings", bookings_default);
app.use("/api/categories", categories_default);
app.use("/api/reviews", reviews_default);
app.use("/api/admin", admin_default);
app.use("/api/student", student_default);
app.get("/", (req, res) => {
  res.send("SkillBridge Server Running");
});
var app_default = app;

// src/index.ts
var index_default = app_default;
export {
  index_default as default
};
