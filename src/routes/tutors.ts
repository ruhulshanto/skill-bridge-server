import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

// GET /api/tutors - Get all tutors with filters
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      category,
      search,
      page = "1",
      limit = "10",
      minRating,
      minRate,
      maxRate,
      free, // filter free tutors only
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build base tutorProfile filter
    const tutorProfileWhere: any = {};

    if (category) {
      tutorProfileWhere.subjects = {
        some: {
          subject: {
            OR: [{ slug: category }, { category: { slug: category } }],
          },
        },
      };
    }

    if (minRating) {
      tutorProfileWhere.rating = { gte: parseFloat(minRating as string) };
    }

    // Handle price filters
    if (free === "true") {
      tutorProfileWhere.hourlyRate = 0;
    } else {
      const priceFilter: any = {};
      if (minRate) priceFilter.gte = parseInt(minRate as string) * 100;
      if (maxRate) priceFilter.lte = parseInt(maxRate as string) * 100;
      if (Object.keys(priceFilter).length > 0) {
        tutorProfileWhere.hourlyRate = priceFilter;
      }
    }

    // Build main where clause
    const where: any = {
      role: "TUTOR",
    };

    // Always apply tutorProfile filter if any conditions exist
    if (Object.keys(tutorProfileWhere).length > 0) {
      where.tutorProfile = tutorProfileWhere;
    }

    // Apply search (maintains category filters via tutorProfileWhere)
    if (search) {
      const searchTerm = (search as string).trim();

      // If we have other filters (category, rating, price), combine them properly
      if (Object.keys(tutorProfileWhere).length > 0) {
        where.AND = [
          { role: "TUTOR" },
          {
            OR: [
              { name: { contains: searchTerm, mode: "insensitive" } },
              {
                tutorProfile: {
                  bio: { contains: searchTerm, mode: "insensitive" },
                },
              },
            ],
          },
          { tutorProfile: tutorProfileWhere },
        ];
        delete where.role;
        delete where.tutorProfile;
      } else {
        // Only search filter
        where.OR = [
          { name: { contains: searchTerm, mode: "insensitive" } },
          {
            tutorProfile: {
              bio: { contains: searchTerm, mode: "insensitive" },
            },
          },
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
                  subject: true,
                },
              },
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: [
          // Order by verified tutors first, then by rating, then by name
          {
            tutorProfile: {
              isVerified: "desc",
            },
          },
          {
            tutorProfile: {
              rating: "desc",
            },
          },
          {
            name: "asc",
          },
        ],
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    // Convert hourly rate from cents to dollars for frontend
    const tutorsWithDollars = tutors.map((tutor) => {
      const plainTutor = JSON.parse(JSON.stringify(tutor));
      if (plainTutor.tutorProfile) {
        plainTutor.tutorProfile.hourlyRate =
          plainTutor.tutorProfile.hourlyRate / 100;
      }
      return plainTutor;
    }) as Array<Record<string, unknown> & { tutorProfile?: { id?: string } }>;

    const profileIds = tutorsWithDollars
      .map((t) => t.tutorProfile?.id)
      .filter((id): id is string => Boolean(id));

    const aggByProfile = new Map<string, { count: number; avg: number }>();
    await Promise.all(
      profileIds.map(async (tid) => {
        const where = { tutorId: tid };
        const [count, agr] = await Promise.all([
          prisma.review.count({ where }),
          prisma.review.aggregate({
            where,
            _avg: { rating: true },
          }),
        ]);
        aggByProfile.set(tid, {
          count,
          avg:
            count > 0
              ? Math.round((agr._avg.rating ?? 0) * 10) / 10
              : 0,
        });
      }),
    );

    for (const t of tutorsWithDollars) {
      const tp = t.tutorProfile as
        | {
            id: string;
            totalReviews?: number;
            rating?: number;
          }
        | undefined;
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
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching tutors:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutors" },
    });
  }
});

// GET /api/tutors/:id - Get tutor by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let tutor = await prisma.user.findFirst({
      where: {
        id: id as string,
        role: "TUTOR",
        // Removed isVerified requirement - all tutors should be visible
      },
      include: {
        tutorProfile: {
          include: {
            subjects: {
              include: {
                subject: true,
              },
            },
            availability: true,
          },
        },
      },
    });

    if (!tutor) {
      return res.status(404).json({
        error: { message: "Tutor not found" },
      });
    }

    // If tutor doesn't have a profile, create a default one
    if (!tutor.tutorProfile) {
      const newProfile = await prisma.tutorProfile.create({
        data: {
          userId: tutor.id,
          bio: tutor.bio || `${tutor.name} is a tutor on SkillBridge.`,
          hourlyRate: 5000, // Default: $50/hour in cents
          experience: 1,
          rating: 0,
          totalReviews: 0,
          isVerified: false,
        },
        include: {
          subjects: {
            include: {
              subject: true,
            },
          },
          availability: true,
        },
      });
      tutor.tutorProfile = newProfile;
    }

    const tutorProfileId = tutor.tutorProfile!.id;

    const reviewWhere = { tutorId: tutorProfileId };

    const [reviews, reviewCount, reviewAgg] = await Promise.all([
      prisma.review.findMany({
        where: reviewWhere,
        include: {
          student: {
            select: {
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      }),
      prisma.review.count({ where: reviewWhere }),
      prisma.review.aggregate({
        where: reviewWhere,
        _avg: { rating: true },
      }),
    ]);

    // Convert hourly rate from cents to dollars for frontend
    const plainTutor = JSON.parse(JSON.stringify(tutor));
    if (plainTutor.tutorProfile) {
      plainTutor.tutorProfile.hourlyRate =
        plainTutor.tutorProfile.hourlyRate / 100;
      plainTutor.tutorProfile.totalReviews = reviewCount;
      plainTutor.tutorProfile.rating =
        reviewCount > 0
          ? Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10
          : 0;
    }

    // Keep stored profile aggregates in sync (fixes stale seeded totals)
    prisma.tutorProfile
      .update({
        where: { id: tutorProfileId },
        data: {
          totalReviews: reviewCount,
          rating:
            reviewCount > 0
              ? Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10
              : 0,
        },
      })
      .catch(() => {});

    res.json({
      data: {
        ...plainTutor,
        reviews: reviews.map((review) => ({
          id: review.id,
          user: review.student.name,
          userImage: review.student.image,
          rating: review.rating,
          comment: review.comment ?? "",
          createdAt: review.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching tutor:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutor" },
    });
  }
});

// PUT /api/tutors/profile - Update tutor profile (protected)
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

    const { bio, hourlyRate, experience, education, subjects, availability } =
      req.body;

    // Update or create tutor profile (tutorId in TutorSubject/Availability is TutorProfile.id)
    const tutorProfile = await prisma.tutorProfile.upsert({
      where: {
        userId: session.user.id,
      },
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

    // Update subjects if provided (tutorId = TutorProfile.id)
    if (subjects && Array.isArray(subjects)) {
      await prisma.tutorSubject.deleteMany({
        where: {
          tutorId: tutorProfile.id,
        },
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

    // Update availability if provided (tutorId = TutorProfile.id)
    if (availability && Array.isArray(availability)) {
      await prisma.availability.deleteMany({
        where: {
          tutorId: tutorProfile.id,
        },
      });

      if (availability.length > 0) {
        await prisma.availability.createMany({
          data: availability.map((avail: any) => ({
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

// GET /api/tutors/stats - Get tutor price statistics
router.get("/stats", async (_req, res) => {
  try {
    const stats = await prisma.tutorProfile.aggregate({
      _min: { hourlyRate: true },
      _max: { hourlyRate: true },
      _avg: { hourlyRate: true },
    });

     res.json({
       data: {
         minPrice: (stats._min?.hourlyRate || 0) / 100,
         maxPrice: (stats._max?.hourlyRate || 200) / 100,
         avgPrice: (stats._avg?.hourlyRate || 50) / 100,
       },
     });
  } catch (error) {
    console.error("Error fetching tutor stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch tutor stats" },
    });
  }
});

export default router;
