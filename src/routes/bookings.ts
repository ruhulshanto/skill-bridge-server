import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";
import { createBookingSchema } from "../lib/validators.js";

const router: Router = Router();

// POST /api/bookings - Create new booking
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

    const parseResult = createBookingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }
    const { tutorId, date, startTime, endTime, notes } = parseResult.data;

    // tutorId in body = TutorProfile.id (from tutor detail page: tutor.tutorProfile.id)
    const tutorProfile = await prisma.tutorProfile.findFirst({
      where: {
        id: tutorId,
      },
      include: {
        user: {
          select: { id: true, role: true },
        },
      },
    });

    if (!tutorProfile || tutorProfile.user?.role !== "TUTOR") {
      return res.status(404).json({
        error: { message: "Tutor not found" },
      });
    }

    // Check for booking conflicts (tutorId in Booking is TutorProfile.id)
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const bookingDate = new Date(year!, month! - 1, day!); // month is 0-indexed in JS

    const existingBooking = await prisma.booking.findFirst({
      where: {
        tutorId,
        date: bookingDate,
        status: {
          in: ["CONFIRMED", "COMPLETED"],
        },
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
        ],
      },
    });

    if (existingBooking) {
      return res.status(409).json({
        error: { message: "Time slot already booked" },
      });
    }

    // Create booking (tutorId = TutorProfile.id); status CONFIRMED per assignment
    const booking = await prisma.booking.create({
      data: {
        studentId: session.user.id,
        tutorId: tutorProfile.id,
        date: bookingDate,
        startTime,
        endTime,
        status: "CONFIRMED",
        totalAmount: tutorProfile.hourlyRate,
        notes: notes ?? null,
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      data: booking,
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      error: { message: "Failed to create booking" },
    });
  }
});

// GET /api/bookings - Get all bookings (for students)
router.get("/", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      studentId: session.user.id,
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
                  image: true,
                },
              },
            },
          },
          review: true,
        },
        skip,
        take: limitNum,
        orderBy: {
          date: "desc",
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching student bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" },
    });
  }
});

// GET /api/bookings/my - Get user's bookings
router.get("/my", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { status, page = "1", limit = "10" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (session.user.role === "STUDENT") {
      where.studentId = session.user.id;
    } else if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!profile) {
        return res.json({
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
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
              image: true,
            },
          },
          tutor: {
            select: {
              id: true,
              hourlyRate: true,
            },
            include: {
              user: {
                select: {
                  name: true,
                  image: true,
                },
              },
            },
          },
          review: true,
        },
        skip,
        take: limitNum,
        orderBy: {
          date: "desc",
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" },
    });
  }
});

// PATCH /api/bookings/:id - Update booking status
router.patch("/:id", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { id } = req.params;
    const { status, date, startTime, endTime } = req.body;

    const booking = await prisma.booking.findFirst({
      where: {
        id,
      },
    });

    if (!booking) {
      return res.status(404).json({
        error: { message: "Booking not found" },
      });
    }

    // Check permissions
    if (session.user.role === "STUDENT" && booking.studentId !== session.user.id) {
      return res.status(403).json({
        error: { message: "Forbidden" },
      });
    }

    if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!profile || booking.tutorId !== profile.id) {
        return res.status(403).json({
          error: { message: "Forbidden" },
        });
      }
    }

    // Update booking
    const updateData: any = { status };
    
    // Handle rescheduling if date/time is provided
    if (date || startTime || endTime) {
      // Only students can reschedule their own bookings
      if (session.user.role !== "STUDENT" || booking.studentId !== session.user.id) {
        return res.status(403).json({
          error: { message: "Only students can reschedule their own bookings" },
        });
      }
      
      // Check if booking can be rescheduled (only confirmed bookings)
      if (booking.status !== "CONFIRMED") {
        return res.status(400).json({
          error: { message: "Only confirmed bookings can be rescheduled" },
        });
      }
      
      // Prepare new date/time
      let newDate = booking.date;
      if (date) {
        // Parse date as local date to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        newDate = new Date(year, month - 1, day);
      }
      
      const newStartTime = startTime || booking.startTime;
      const newEndTime = endTime || booking.endTime;
      
      // Check for conflicts with new time slot
      const conflictBooking = await prisma.booking.findFirst({
        where: {
          tutorId: booking.tutorId,
          date: newDate,
          status: {
            in: ["CONFIRMED", "COMPLETED"],
          },
          id: { not: id }, // Exclude current booking
          OR: [
            {
              AND: [
                { startTime: { lte: newStartTime } },
                { endTime: { gt: newStartTime } },
              ],
            },
            {
              AND: [
                { startTime: { lt: newEndTime } },
                { endTime: { gte: newEndTime } },
              ],
            },
          ],
        },
      });
      
      if (conflictBooking) {
        return res.status(409).json({
          error: { message: "Time slot already booked" },
        });
      }
      
      updateData.date = newDate;
      updateData.startTime = newStartTime;
      updateData.endTime = newEndTime;
    }

    const updatedBooking = await prisma.booking.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.json({
      data: updatedBooking,
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({
      error: { message: "Failed to update booking" },
    });
  }
});

// GET /api/bookings/:id - Get booking details
router.get("/:id", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { id } = req.params;

    // For TUTOR, tutorId in Booking is TutorProfile.id (not User.id)
    let tutorProfileId: string | null = null;
    if (session.user.role === "TUTOR") {
      const profile = await prisma.tutorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      tutorProfileId = profile?.id ?? null;
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        OR: [
          { studentId: session.user.id },
          ...(tutorProfileId ? [{ tutorId: tutorProfileId }] : []),
        ],
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
            image: true,
          },
        },
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            bio: true,
          },
          include: {
            user: {
              select: {
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        review: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        error: { message: "Booking not found" },
      });
    }

    res.json({
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      error: { message: "Failed to fetch booking" },
    });
  }
});

export default router;
