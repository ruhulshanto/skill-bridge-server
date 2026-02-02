import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";
const router = Router();
// GET /api/tutors - Get all tutors with filters
router.get("/", async (req, res) => {
    try {
        const { category, search, page = "1", limit = "10", minRating, maxRate, } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const tutorProfileWhere = {};
        if (category) {
            tutorProfileWhere.subjects = {
                some: {
                    subject: { slug: category },
                },
            };
        }
        if (minRating) {
            tutorProfileWhere.rating = { gte: parseFloat(minRating) };
        }
        if (maxRate) {
            tutorProfileWhere.hourlyRate = { lte: parseInt(maxRate) };
        }
        const where = {
            role: "TUTOR",
        };
        // Only add tutorProfile filter if there are conditions
        if (Object.keys(tutorProfileWhere).length > 0) {
            where.tutorProfile = tutorProfileWhere;
        }
        if (search) {
            const searchConditions = [
                { name: { contains: search, mode: "insensitive" } },
                {
                    tutorProfile: {
                        bio: { contains: search, mode: "insensitive" },
                    },
                },
            ];
            if (Object.keys(tutorProfileWhere).length > 0) {
                searchConditions.push({
                    tutorProfile: tutorProfileWhere,
                });
            }
            where.AND = [
                { role: "TUTOR" },
                {
                    OR: searchConditions,
                }
            ];
            // Remove role from where since it's now in AND
            delete where.role;
            // Remove tutorProfile from where since it's handled in search
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
                                    subject: true,
                                },
                            },
                        },
                    },
                },
                skip,
                take: limitNum,
                orderBy: [
                    // Order by tutors with profiles first (by rating), then by name
                    {
                        tutorProfile: {
                            rating: 'desc',
                        },
                    },
                    {
                        name: 'asc',
                    },
                ],
            }),
            prisma.user.count({ where }),
        ]);
        const totalPages = Math.ceil(total / limitNum);
        res.json({
            data: tutors,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages,
            },
        });
    }
    catch (error) {
        console.error("Error fetching tutors:", error);
        res.status(500).json({
            error: { message: "Failed to fetch tutors" },
        });
    }
});
// GET /api/tutors/:id - Get tutor by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const tutor = await prisma.user.findFirst({
            where: {
                id: id,
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
        // Get tutor's reviews
        const reviews = await prisma.review.findMany({
            where: {
                booking: {
                    tutorId: id,
                },
            },
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
            take: 10,
        });
        res.json({
            data: {
                ...tutor,
                reviews,
            },
        });
    }
    catch (error) {
        console.error("Error fetching tutor:", error);
        res.status(500).json({
            error: { message: "Failed to fetch tutor" },
        });
    }
});
// PUT /api/tutors/profile - Update tutor profile (protected)
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
        const { bio, hourlyRate, experience, education, subjects, availability, } = req.body;
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
                    data: subjects.map((subjectId) => ({
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
                    data: availability.map((avail) => ({
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
    }
    catch (error) {
        console.error("Error updating tutor profile:", error);
        res.status(500).json({
            error: { message: "Failed to update profile" },
        });
    }
});
export default router;
//# sourceMappingURL=tutors.js.map