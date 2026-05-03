// src/app.ts
import express2 from "express";
import { toNodeHandler } from "better-auth/node";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// src/lib/prisma.ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
var connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes("sslmode=")) {
  const separator = connectionString.includes("?") ? "&" : "?";
  connectionString += `${separator}sslmode=verify-full`;
}
var globalForPrisma = global;
var pool = new Pool({
  connectionString,
  max: 1,
  // Crucial for serverless: every function instance gets 1 connection.
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4
});
pool.on("error", (err) => {
  console.error("Unexpected error on idle PG client", err);
});
var adapter = new PrismaPg(pool);
var prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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
  database: (authOptions) => {
    const adapter2 = prismaAdapter(prisma, {
      provider: "postgresql"
    })(authOptions);
    const originalDelete = adapter2.delete;
    adapter2.delete = async (data) => {
      try {
        return await originalDelete(data);
      } catch (error) {
        if (error.code === "P2025" || error.meta?.cause === "Record to delete does not exist.") {
          console.log(`[AUTH DEBUG] Record already deleted, ignoring P2025 error.`);
          return;
        }
        throw error;
      }
    };
    return adapter2;
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "STUDENT"
      },
      phone: {
        type: "string"
      },
      bio: {
        type: "string"
      },
      location: {
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
    "http://192.168.0.173:3000",
    "https://skill-bridge-client-ruddy.vercel.app"
  ].filter(Boolean),
  session: {
    cookieCache: {
      enabled: false
    },
    expiresIn: 60 * 60 * 24 * 7,
    // 7 days
    updateAge: 60 * 60 * 24,
    // 1 day
    cookieAttributes: {
      secure: true,
      sameSite: "none",
      path: "/"
    }
  },
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
      minRate,
      maxRate,
      free
      // filter free tutors only
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const tutorProfileWhere = {};
    if (category) {
      tutorProfileWhere.subjects = {
        some: {
          subject: {
            OR: [{ slug: category }, { category: { slug: category } }]
          }
        }
      };
    }
    if (minRating) {
      tutorProfileWhere.rating = { gte: parseFloat(minRating) };
    }
    if (free === "true") {
      tutorProfileWhere.hourlyRate = 0;
    } else {
      const priceFilter = {};
      if (minRate) priceFilter.gte = parseInt(minRate) * 100;
      if (maxRate) priceFilter.lte = parseInt(maxRate) * 100;
      if (Object.keys(priceFilter).length > 0) {
        tutorProfileWhere.hourlyRate = priceFilter;
      }
    }
    const where = {
      role: "TUTOR"
    };
    if (Object.keys(tutorProfileWhere).length > 0) {
      where.tutorProfile = tutorProfileWhere;
    }
    if (search) {
      const searchTerm = search.trim();
      if (Object.keys(tutorProfileWhere).length > 0) {
        where.AND = [
          { role: "TUTOR" },
          {
            OR: [
              { name: { contains: searchTerm, mode: "insensitive" } },
              {
                tutorProfile: {
                  bio: { contains: searchTerm, mode: "insensitive" }
                }
              }
            ]
          },
          { tutorProfile: tutorProfileWhere }
        ];
        delete where.role;
        delete where.tutorProfile;
      } else {
        where.OR = [
          { name: { contains: searchTerm, mode: "insensitive" } },
          {
            tutorProfile: {
              bio: { contains: searchTerm, mode: "insensitive" }
            }
          }
        ];
      }
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
          // Order by verified tutors first, then by rating, then by name
          {
            tutorProfile: {
              isVerified: "desc"
            }
          },
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
    const tutorsWithDollars = tutors.map((tutor) => {
      const plainTutor = JSON.parse(JSON.stringify(tutor));
      if (plainTutor.tutorProfile) {
        plainTutor.tutorProfile.hourlyRate = plainTutor.tutorProfile.hourlyRate / 100;
      }
      return plainTutor;
    });
    const profileIds = tutorsWithDollars.map((t) => t.tutorProfile?.id).filter((id) => Boolean(id));
    const aggByProfile = /* @__PURE__ */ new Map();
    await Promise.all(
      profileIds.map(async (tid) => {
        const where2 = { tutorId: tid };
        const [count, agr] = await Promise.all([
          prisma.review.count({ where: where2 }),
          prisma.review.aggregate({
            where: where2,
            _avg: { rating: true }
          })
        ]);
        aggByProfile.set(tid, {
          count,
          avg: count > 0 ? Math.round((agr._avg.rating ?? 0) * 10) / 10 : 0
        });
      })
    );
    for (const t of tutorsWithDollars) {
      const tp = t.tutorProfile;
      if (!tp?.id) continue;
      const agg = aggByProfile.get(tp.id);
      tp.totalReviews = agg?.count ?? 0;
      tp.rating = agg?.avg ?? 0;
    }
    res.json({
      data: tutorsWithDollars,
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
    let tutor = await prisma.user.findFirst({
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
    if (!tutor.tutorProfile) {
      const newProfile = await prisma.tutorProfile.create({
        data: {
          userId: tutor.id,
          bio: tutor.bio || `${tutor.name} is a tutor on SkillBridge.`,
          hourlyRate: 5e3,
          // Default: $50/hour in cents
          experience: 1,
          rating: 0,
          totalReviews: 0,
          isVerified: false
        },
        include: {
          subjects: {
            include: {
              subject: true
            }
          },
          availability: true
        }
      });
      tutor.tutorProfile = newProfile;
    }
    const tutorProfileId = tutor.tutorProfile.id;
    const reviewWhere = { tutorId: tutorProfileId };
    const [reviews, reviewCount, reviewAgg] = await Promise.all([
      prisma.review.findMany({
        where: reviewWhere,
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
        take: 50
      }),
      prisma.review.count({ where: reviewWhere }),
      prisma.review.aggregate({
        where: reviewWhere,
        _avg: { rating: true }
      })
    ]);
    const plainTutor = JSON.parse(JSON.stringify(tutor));
    if (plainTutor.tutorProfile) {
      plainTutor.tutorProfile.hourlyRate = plainTutor.tutorProfile.hourlyRate / 100;
      plainTutor.tutorProfile.totalReviews = reviewCount;
      plainTutor.tutorProfile.rating = reviewCount > 0 ? Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10 : 0;
    }
    prisma.tutorProfile.update({
      where: { id: tutorProfileId },
      data: {
        totalReviews: reviewCount,
        rating: reviewCount > 0 ? Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10 : 0
      }
    }).catch(() => {
    });
    res.json({
      data: {
        ...plainTutor,
        reviews: reviews.map((review) => ({
          id: review.id,
          user: review.student.name,
          userImage: review.student.image,
          rating: review.rating,
          comment: review.comment ?? "",
          createdAt: review.createdAt
        }))
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
    const { bio, hourlyRate, experience, education, subjects, availability } = req.body;
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
router.get("/stats", async (_req, res) => {
  try {
    const stats = await prisma.tutorProfile.aggregate({
      _min: { hourlyRate: true },
      _max: { hourlyRate: true },
      _avg: { hourlyRate: true }
    });
    res.json({
      data: {
        minPrice: (stats._min?.hourlyRate || 0) / 100,
        maxPrice: (stats._max?.hourlyRate || 200) / 100,
        avgPrice: (stats._avg?.hourlyRate || 50) / 100
      }
    });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutor stats" }
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
      hourlyRate: tutorProfile.hourlyRate / 100
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
        totalEarnings: totalEarnings / 100,
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
      data: bookings.map((b) => ({ ...b, totalAmount: (b.totalAmount || 0) / 100 })),
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
      hourlyRate: updatedProfile.hourlyRate / 100
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
    const [totalBookings, completedBookings, earningsResult, uniqueStudents] = await Promise.all([
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
      }),
      prisma.booking.groupBy({
        by: ["studentId"],
        where: { tutorId: tutorProfile.id }
      })
    ]);
    res.json({
      data: {
        totalSessions: totalBookings,
        completedSessions: completedBookings,
        totalEarnings: Math.round((earningsResult._sum.totalAmount ?? 0) / 100),
        rating: tutorProfile.rating,
        totalReviews: tutorProfile.totalReviews,
        totalStudents: uniqueStudents.length
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
router2.get("/application", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const application = await prisma.tutorApplication.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" }
    });
    res.json({ data: application });
  } catch (error) {
    console.error("Error fetching tutor application:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
router2.post("/apply", async (req, res) => {
  try {
    console.log("[DEBUG] Tutor Application Hit");
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      console.log("[DEBUG] Unauthorized application attempt");
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const existing = await prisma.tutorApplication.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ["PENDING", "APPROVED"] }
      }
    });
    if (existing) {
      return res.status(400).json({
        error: { message: `You already have a ${existing.status.toLowerCase()} application.` }
      });
    }
    const { expertise, bio, experience, hourlyRate, subjects, education, portfolioUrl } = req.body;
    if (!expertise || !bio || !experience || !hourlyRate || !subjects) {
      return res.status(400).json({ error: { message: "Missing required fields" } });
    }
    const parsedExperience = parseInt(experience, 10);
    const parsedHourlyRate = parseInt(hourlyRate, 10) * 100;
    if (isNaN(parsedExperience) || isNaN(parsedHourlyRate)) {
      return res.status(400).json({ error: { message: "Invalid experience or hourly rate" } });
    }
    const subjectsArray = subjects.split(",").map((s) => s.trim()).filter(Boolean);
    const subjectIds = [];
    for (const subjName of subjectsArray) {
      let subject = await prisma.subject.findFirst({
        where: { name: { equals: subjName, mode: "insensitive" } }
      });
      if (!subject) {
        const slug = subjName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
        status: "PENDING"
      }
    });
    try {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true }
      });
      console.log(`Found ${admins.length} admins to notify.`);
      if (admins.length > 0) {
        const result = await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            title: "New Tutor Application",
            message: `${session.user.name || "A user"} has applied to become a tutor.`,
            type: "APPLICATION",
            link: `/admin/applications/${application.id}`
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
  rating: z.coerce.number().min(1).max(5),
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
    const plainBooking = JSON.parse(JSON.stringify(booking));
    if (plainBooking.totalAmount !== void 0) {
      plainBooking.totalAmount = plainBooking.totalAmount / 100;
    }
    if (plainBooking.tutor) {
      plainBooking.tutor.hourlyRate = plainBooking.tutor.hourlyRate / 100;
    }
    res.status(201).json({
      data: plainBooking
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
            select: {
              id: true,
              hourlyRate: true,
              rating: true,
              totalReviews: true,
              user: {
                select: {
                  id: true,
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
    const bookingsWithDollars = bookings.map((booking) => {
      const plainBooking = JSON.parse(JSON.stringify(booking));
      if (plainBooking.totalAmount !== void 0) {
        plainBooking.totalAmount = plainBooking.totalAmount / 100;
      }
      if (plainBooking.tutor) {
        plainBooking.tutor.hourlyRate = plainBooking.tutor.hourlyRate / 100;
      }
      return plainBooking;
    });
    res.json({
      data: bookingsWithDollars,
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
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0
          }
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
              hourlyRate: true,
              rating: true,
              totalReviews: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  email: true
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
    const bookingsWithDollars = bookings.map((booking) => {
      const plainBooking = JSON.parse(JSON.stringify(booking));
      if (plainBooking.totalAmount !== void 0) {
        plainBooking.totalAmount = plainBooking.totalAmount / 100;
      }
      if (plainBooking.tutor) {
        plainBooking.tutor.hourlyRate = plainBooking.tutor.hourlyRate / 100;
      }
      return plainBooking;
    });
    res.json({
      data: bookingsWithDollars,
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
    const updatedBookingWithDollars = {
      ...updatedBooking,
      totalAmount: updatedBooking.totalAmount / 100,
      tutor: updatedBooking.tutor ? {
        ...updatedBooking.tutor,
        hourlyRate: updatedBooking.tutor.hourlyRate / 100
      } : null
    };
    res.json({
      data: updatedBookingWithDollars
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
    const bookingWithDollars = {
      ...booking,
      totalAmount: booking.totalAmount / 100,
      tutor: booking.tutor ? {
        ...booking.tutor,
        hourlyRate: booking.tutor.hourlyRate / 100
      } : null
    };
    res.json({
      data: bookingWithDollars
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
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        subjects: {
          include: {
            tutorSubjects: {
              include: {
                tutor: true
                // Include TutorProfile via TutorSubject.tutor relation
              }
            }
          }
        }
      }
    });
    const categoriesWithCounts = categories.map((category) => {
      const tutorSet = /* @__PURE__ */ new Set();
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
          slug: s.slug
        }))
      };
    });
    res.json({ data: categoriesWithCounts });
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
function bookingSessionEnded(booking) {
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
          message: "Booking not found, or you can only review your own eligible sessions."
        }
      });
    }
    const ended = booking.status === "COMPLETED" || bookingSessionEnded(booking);
    if (!ended) {
      return res.status(403).json({
        error: {
          message: "You can leave a review after your scheduled session has ended."
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
        tutorId: booking.tutorId,
        studentId: session.user.id,
        rating,
        comment: comment ?? null
      }
    });
    const reviews = await prisma.review.findMany({
      where: { tutorId: booking.tutorId },
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
    try {
      await prisma.notification.create({
        data: {
          userId: booking.tutor.userId,
          title: "New Review Received",
          message: `${session.user.name || "A student"} left a ${rating}-star review for your session.`,
          type: "REVIEW",
          link: "/tutor/sessions"
        }
      });
      console.log(`Notified tutor ${booking.tutor.userId} about new review.`);
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true }
      });
      if (admins.length > 0) {
        const result = await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            title: "New Review Posted",
            message: `${session.user.name || "A student"} reviewed tutor: ${rating} stars.`,
            type: "REVIEW",
            link: "/admin/bookings"
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
    const detail = error instanceof Error ? error.message.slice(0, 280) : "unknown error";
    res.status(500).json({
      error: { message: `Failed to create review: ${detail}` }
    });
  }
});
router5.get("/tutor/:tutorId", async (req, res) => {
  try {
    const { tutorId } = req.params;
    const reviews = await prisma.review.findMany({
      where: {
        tutorId
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
  if (!session?.user) {
    console.log("[ADMIN AUTH] No session found");
    res.status(401).json({ error: { message: "Authentication required" } });
    return false;
  }
  if (session.user.role !== "ADMIN") {
    console.log(`[ADMIN AUTH] User ${session.user.email} is not an ADMIN. Role: ${session.user.role}`);
    res.status(403).json({ error: { message: "Access denied. Admin role required." } });
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
    const usersWithDollars = users.map((user) => {
      const plainUser = JSON.parse(JSON.stringify(user));
      if (plainUser.tutorProfile) {
        plainUser.tutorProfile.hourlyRate = plainUser.tutorProfile.hourlyRate / 100;
      }
      return plainUser;
    });
    res.json({
      data: usersWithDollars,
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
    const bookingsWithDollars = bookings.map((booking) => ({
      ...booking,
      totalAmount: booking.totalAmount / 100,
      tutor: booking.tutor ? {
        ...booking.tutor,
        hourlyRate: booking.tutor.hourlyRate / 100
      } : null
    }));
    res.json({
      data: bookingsWithDollars,
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
        bio: "",
        // Required field
        location: "",
        // Required field
        role: "ADMIN"
      }
    });
    if (!result.user) {
      return res.status(400).json({
        error: { message: "Failed to create admin" }
      });
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
router6.get("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user || session.user.role !== "ADMIN") {
      return res.status(401).json({
        error: { message: "Unauthorized" }
      });
    }
    console.log(`[ADMIN PROFILE] Fetching profile for user ${session.user.id}`);
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        bio: true,
        location: true,
        role: true,
        status: true,
        image: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!user) {
      console.log(`[ADMIN PROFILE] User ${session.user.id} not found in DB`);
      return res.status(404).json({
        error: { message: "Admin not found" }
      });
    }
    console.log(`[ADMIN PROFILE] Success! Returning data for ${user.email}. Name: ${user.name}`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      data: user
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({
      error: { message: "Failed to fetch profile" }
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
    const { name, phone, bio, location } = req.body;
    const updateData = {};
    if (name !== void 0) updateData.name = name;
    if (phone !== void 0) updateData.phone = phone;
    if (bio !== void 0) updateData.bio = bio;
    if (location !== void 0) updateData.location = location;
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: { message: "No fields to update" }
      });
    }
    console.log(`[ADMIN PROFILE] Updating profile for user ${session.user.id}:`, updateData);
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData
    });
    console.log(`[ADMIN PROFILE] Prisma update successful for ${session.user.id}`);
    try {
      await auth.api.updateUser({
        body: {
          userId: session.user.id,
          ...updateData
        }
      });
      console.log(`[ADMIN PROFILE] Auth update successful for ${session.user.id}`);
    } catch (authError) {
      console.error(`[ADMIN PROFILE] Auth update failed (continuing anyway):`, authError);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
router6.get("/applications", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const where = {};
    if (status) where.status = status;
    const [applications, total] = await Promise.all([
      prisma.tutorApplication.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" }
      }),
      prisma.tutorApplication.count({ where })
    ]);
    const formatted = applications.map((app2) => ({
      ...app2,
      hourlyRate: app2.hourlyRate / 100
    }));
    res.json({
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: { message: "Failed to fetch applications" } });
  }
});
router6.get("/applications/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    console.log("Requested Application ID:", id);
    if (!id || id === "undefined" || id === "[id]") {
      return res.status(400).json({ error: { message: "Invalid application ID" } });
    }
    const application = await prisma.tutorApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true, createdAt: true }
        }
      }
    });
    if (!application) {
      console.log(`[ADMIN API] No application found in DB for ID: ${id}`);
      return res.status(404).json({ error: { message: "Application not found in database" } });
    }
    console.log(`[ADMIN API] Success! Found application for: ${application.user.name}`);
    res.json({
      data: {
        ...application,
        hourlyRate: application.hourlyRate / 100
      }
    });
  } catch (error) {
    console.error("Error fetching application detail:", error);
    res.status(500).json({ error: { message: "Failed to fetch application details" } });
  }
});
router6.patch("/applications/:id/approve", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    const application = await prisma.tutorApplication.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!application) {
      return res.status(404).json({ error: { message: "Application not found" } });
    }
    if (application.status !== "PENDING") {
      return res.status(400).json({ error: { message: `Application is already ${application.status}` } });
    }
    const result = await prisma.$transaction(async (tx) => {
      const updatedApp = await tx.tutorApplication.update({
        where: { id },
        data: { status: "APPROVED" }
      });
      await tx.user.update({
        where: { id: application.userId },
        data: { role: "TUTOR" }
      });
      const profile = await tx.tutorProfile.upsert({
        where: { userId: application.userId },
        update: {
          bio: application.bio,
          hourlyRate: application.hourlyRate,
          experience: application.experience,
          education: application.education,
          portfolioUrl: application.portfolioUrl
        },
        create: {
          userId: application.userId,
          bio: application.bio,
          hourlyRate: application.hourlyRate,
          experience: application.experience,
          education: application.education,
          portfolioUrl: application.portfolioUrl,
          isVerified: true
          // auto-verify on admin approval
        }
      });
      await tx.tutorSubject.deleteMany({
        where: { tutorId: profile.id }
      });
      if (application.subjectIds && application.subjectIds.length > 0) {
        await tx.tutorSubject.createMany({
          data: application.subjectIds.map((subjectId) => ({
            tutorId: profile.id,
            subjectId
          }))
        });
      }
      await tx.notification.create({
        data: {
          userId: application.userId,
          title: "Application Approved!",
          message: "Congratulations! Your application to become a tutor has been approved.",
          type: "APPLICATION",
          link: "/tutor/dashboard"
        }
      });
      return updatedApp;
    });
    res.json({ data: result });
  } catch (error) {
    console.error("Error approving application:", error);
    res.status(500).json({ error: { message: "Failed to approve application" } });
  }
});
router6.patch("/applications/:id/reject", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const { id } = req.params;
    const application = await prisma.tutorApplication.findUnique({
      where: { id }
    });
    if (!application) {
      return res.status(404).json({ error: { message: "Application not found" } });
    }
    const updated = await prisma.tutorApplication.update({
      where: { id },
      data: { status: "REJECTED" }
    });
    try {
      await prisma.notification.create({
        data: {
          userId: application.userId,
          title: "Application Status Update",
          message: "We've reviewed your application to become a tutor. Unfortunately, it has been rejected at this time.",
          type: "APPLICATION",
          link: "/become-a-tutor"
          // Or wherever they can see status/try again
        }
      });
    } catch (notifErr) {
      console.error("Failed to notify user of rejection:", notifErr);
    }
    res.json({ data: updated });
  } catch (error) {
    console.error("Error rejecting application:", error);
    res.status(500).json({ error: { message: "Failed to reject application" } });
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
    const { name, phone, bio, location } = req.body;
    console.log("\u{1F4DD} Update request for user:", session.user.id, { name, phone, bio, location });
    const updateData = {};
    if (name !== void 0) updateData.name = name;
    if (phone !== void 0) updateData.phone = phone;
    if (bio !== void 0) updateData.bio = bio;
    if (location !== void 0) updateData.location = location;
    console.log("\u{1F4CA} Final update data:", updateData);
    console.log(`[STUDENT PROFILE] Updating profile for user ${session.user.id}:`, updateData);
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData
    });
    console.log(`[STUDENT PROFILE] Prisma update successful for ${session.user.id}`);
    try {
      await auth.api.updateUser({
        body: {
          userId: session.user.id,
          ...updateData
        }
      });
      console.log(`[STUDENT PROFILE] Auth update successful for ${session.user.id}`);
    } catch (authError) {
      console.error(`[STUDENT PROFILE] Auth update failed:`, authError);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
        bio: true,
        location: true,
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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

// src/routes/notifications.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.get("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    res.json({ data: notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
router8.patch("/:id/read", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { id }
    });
    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found" } });
    }
    if (notification.userId !== session.user.id) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });
    res.json({ data: updated });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
router8.patch("/read-all", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ data: { message: "All notifications marked as read" } });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
router8.delete("/:id", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers)
    });
    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { id }
    });
    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found" } });
    }
    if (notification.userId !== session.user.id) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    await prisma.notification.delete({
      where: { id }
    });
    res.json({ data: { message: "Notification deleted" } });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});
var notifications_default = router8;

// src/routes/ai.ts
import express from "express";
import Groq from "groq-sdk";
var router9 = express.Router();
var groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
router9.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "AI Service (Groq) is reachable",
    hasKey: !!process.env.GROQ_API_KEY
  });
});
var requestCount = 0;
var MAX_DAILY_REQUESTS = 100;
router9.post("/chat", async (req, res) => {
  console.log("AI ROUTE: POST /chat received (Groq Mode)");
  try {
    const { message, history } = req.body;
    if (!process.env.GROQ_API_KEY) {
      console.error("AI ROUTE ERROR: GROQ_API_KEY is missing.");
      return res.status(500).json({ error: "Server configuration error: Missing API Key" });
    }
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }
    if (requestCount >= MAX_DAILY_REQUESTS) {
      return res.json({ response: "Daily limit reached. Please try again tomorrow! \u{1F680}" });
    }
    requestCount++;
    const messages = [
      {
        role: "system",
        content: `You are the SkillBridge Product Assistant, an expert on the SkillBridge platform. 
    
                ABOUT SKILLBRIDGE:
                - SkillBridge is a premium online tutoring marketplace.
                - We connect students with verified expert tutors for 1-on-1 personalized learning.
                - Features: Advanced search, subject filtering, real-time booking, and student/tutor dashboards.
                - Pricing: Tutors set their own hourly rates (typically $20 - $100/hr). No hidden fees for students.

                BOOKING FLOW (3 STEPS):
                1. Search & Filter: Find your perfect tutor by subject, rating, or price.
                2. Check Availability: View the tutor's live calendar on their profile.
                3. Instant Booking: Select a time, confirm, and start learning.

                LEARNING ROADMAP:
                If a user asks how to learn or start, explicitly guide them through these 4 steps:
                1. Create an account (Sign up as a Student).
                2. Search for your subject (e.g., Physics, Music, Coding).
                3. Choose your perfect tutor (Check their profile and reviews).
                4. Book your first session (Select a time that fits).

                GUIDELINES:
                - BE DIRECT: Answer questions immediately without unnecessary redirects.
                - BE CONCISE: Keep answers informative but short.
                - BE THE EXPERT: Guide users step-by-step through account creation, searching, and booking.
                - PERSONALITY: Professional, encouraging, and highly knowledgeable.
                - RESTRICTION: Do not answer generic questions unrelated to education or SkillBridge.`
      }
    ];
    if (history && Array.isArray(history)) {
      const formattedHistory = history.map((h) => ({
        role: h.role === "assistant" || h.role === "bot" || h.role === "model" ? "assistant" : "user",
        content: h.text || h.content || ""
      })).filter((h) => h.content.trim() !== "");
      messages.push(...formattedHistory);
    }
    messages.push({
      role: "user",
      content: message
    });
    console.log(`AI REQUEST (Groq): Processing message using llama-3.1-8b-instant...`);
    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false
    });
    const responseText = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    console.log(`AI RESPONSE: Success`);
    res.json({ response: responseText });
  } catch (error) {
    console.error("Groq API Error:", error.message);
    res.status(500).json({
      error: "Failed to generate AI response",
      details: error.message
    });
  }
});
var ai_default = router9;

// src/app.ts
var app = express2();
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
app.use(express2.json());
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use("/api/tutors", tutors_default);
app.use("/api/tutor", tutor_default);
app.use("/api/bookings", bookings_default);
app.use("/api/categories", categories_default);
app.use("/api/reviews", reviews_default);
app.use("/api/admin", admin_default);
app.use("/api/student", student_default);
app.use("/api/notifications", notifications_default);
app.use("/api/ai", ai_default);
app.get("/", (req, res) => {
  res.send("SkillBridge Server Running");
});
var app_default = app;

// src/index.ts
var index_default = app_default;
export {
  index_default as default
};
