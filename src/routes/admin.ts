import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const session = await auth.api.getSession({
    headers: getHeadersInit(req.headers),
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

// GET /api/admin/users - Get all users (students and tutors)
router.get("/users", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { role, status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
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
               totalReviews: true,
             },
           },
         },
         skip,
         take: limitNum,
         orderBy: { createdAt: "desc" },
       }),
       prisma.user.count({ where }),
     ]);

     // Convert hourlyRate from cents to dollars
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
         totalPages: Math.ceil(total / limitNum),
       },
     });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).json({
      error: { message: "Failed to fetch users" },
    });
  }
});

// PATCH /api/admin/users/:id - Update user status (e.g. ban/unban)
router.patch("/users/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const { status } = req.body;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({
        error: { message: "User not found" },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: status ?? user.status,
      },
    });

    res.json({ data: updated });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      error: { message: "Failed to update user" },
    });
  }
});

// PATCH /api/admin/tutors/:id/verify - Verify tutor (admin only)
router.patch("/tutors/:id/verify", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    const profile = await prisma.tutorProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      return res.status(404).json({
        error: { message: "Tutor profile not found" },
      });
    }

    const updated = await prisma.tutorProfile.update({
      where: { id },
      data: { isVerified: true },
    });

    res.json({ data: updated });
  } catch (error) {
    console.error("Error verifying tutor:", error);
    res.status(500).json({
      error: { message: "Failed to verify tutor" },
    });
  }
});

// GET /api/admin/bookings - View all bookings (admin only)
router.get("/bookings", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
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
           review: true,
         },
         skip,
         take: limitNum,
         orderBy: { date: "desc" },
       }),
       prisma.booking.count({ where }),
     ]);

     // Convert cents to dollars
     const bookingsWithDollars = bookings.map((booking) => ({
       ...booking,
       totalAmount: booking.totalAmount / 100,
       tutor: booking.tutor
         ? {
             ...booking.tutor,
             hourlyRate: booking.tutor.hourlyRate / 100,
           }
         : null,
     }));

     res.json({
       data: bookingsWithDollars,
       pagination: {
         page: pageNum,
         limit: limitNum,
         total,
         totalPages: Math.ceil(total / limitNum),
       },
     });
  } catch (error) {
    console.error("Error fetching admin bookings:", error);
    res.status(500).json({
      error: { message: "Failed to fetch bookings" },
    });
  }
});

// GET /api/admin/categories - Get all categories (admin; for manage UI)
router.get("/categories", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const categories = await prisma.subject.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ data: categories });
  } catch (error) {
    console.error("Error fetching admin categories:", error);
    res.status(500).json({
      error: { message: "Failed to fetch categories" },
    });
  }
});

// POST /api/admin/categories - Create category (admin)
router.post("/categories", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { name, slug, description, icon } = req.body;
    if (!name || !slug) {
      return res.status(400).json({
        error: { message: "name and slug are required" },
      });
    }

    const category = await prisma.subject.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, "-"),
        description: description ?? null,
        icon: icon ?? null,
      },
    });
    res.status(201).json({ data: category });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      error: { message: "Failed to create category" },
    });
  }
});

// PATCH /api/admin/categories/:id - Update category (admin)
router.patch("/categories/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const { name, slug, description, icon } = req.body;

    const category = await prisma.subject.update({
      where: { id },
      data: {
        ...(name != null && { name }),
        ...(slug != null && { slug: slug.toLowerCase().replace(/\s+/g, "-") }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
      },
    });
    res.json({ data: category });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      error: { message: "Failed to update category" },
    });
  }
});

// DELETE /api/admin/categories/:id - Delete category (admin)
router.delete("/categories/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    await prisma.subject.delete({
      where: { id },
    });
    res.json({ data: { message: "Category deleted" } });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      error: { message: "Failed to delete category" },
    });
  }
});

// POST /api/admin/register - Register new admin (super admin only)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        error: { message: "Name, email, and password are required" },
      });
    }

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    });

    // If no admin exists, allow first admin registration
    // If admin exists, require existing admin session
    if (existingAdmin) {
      const session = await auth.api.getSession({
        headers: getHeadersInit(req.headers),
      });

      if (!session?.user || session.user.role !== "ADMIN") {
        return res.status(403).json({
          error: { message: "Only existing admins can create new admins" },
        });
      }
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        error: { message: "Email already exists" },
      });
    }

    // Create admin user using Better Auth
    const result = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
        phone: "", // Required field
        bio: "",   // Required field
        location: "", // Required field
        role: "ADMIN"
      }
    });

    if (!result.user) {
      return res.status(400).json({
        error: { message: "Failed to create admin" }
      });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
      error: { message: "Failed to create admin" },
    });
  }
});

// GET /api/admin/stats - Dashboard statistics (admin only)
router.get("/stats", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const [totalUsers, totalTutors, totalStudents, totalBookings, totalReviews] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: "TUTOR" } }),
        prisma.user.count({ where: { role: "STUDENT" } }),
        prisma.booking.count(),
        prisma.review.count(),
      ]);

    const completedBookings = await prisma.booking.count({
      where: { status: "COMPLETED" },
    });

    res.json({
      data: {
        totalUsers,
        totalTutors,
        totalStudents,
        totalBookings,
        completedBookings,
        totalReviews,
      },
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({
      error: { message: "Failed to fetch stats" },
    });
  }
});

// GET /api/admin/profile - Get current admin profile
router.get("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "ADMIN") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
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
        updatedAt: true,
      },
    });

    if (!user) {
      console.log(`[ADMIN PROFILE] User ${session.user.id} not found in DB`);
      return res.status(404).json({
        error: { message: "Admin not found" },
      });
    }

    console.log(`[ADMIN PROFILE] Success! Returning data for ${user.email}. Name: ${user.name}`);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      data: user,
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({
      error: { message: "Failed to fetch profile" },
    });
  }
});

// PUT /api/admin/profile - Update admin profile
router.put("/profile", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { name, phone, bio, location } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: { message: "No fields to update" },
      });
    }

    console.log(`[ADMIN PROFILE] Updating profile for user ${session.user.id}:`, updateData);

    // 1. Update via Prisma - SINGLE SOURCE OF TRUTH
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    });
    
    console.log(`[ADMIN PROFILE] Prisma update successful for ${session.user.id}`);

    // 2. Update via Better Auth - Synchronize Auth state
    try {
      await auth.api.updateUser({
        body: {
          userId: session.user.id,
          ...updateData,
        },
      });
      console.log(`[ADMIN PROFILE] Auth update successful for ${session.user.id}`);
    } catch (authError) {
      console.error(`[ADMIN PROFILE] Auth update failed (continuing anyway):`, authError);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" },
    });
  }
});

// GET /api/admin/applications - Get all tutor applications
router.get("/applications", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.tutorApplication.count({ where }),
    ]);

    // Format for frontend
    const formatted = applications.map(app => ({
      ...app,
      hourlyRate: app.hourlyRate / 100
    }));

    res.json({
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: { message: "Failed to fetch applications" } });
  }
});

// GET /api/admin/applications/:id - Get specific application
router.get("/applications/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    console.log("Requested Application ID:", id);

    if (!id || id === 'undefined' || id === '[id]') {
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

// PATCH /api/admin/applications/:id/approve - Approve application
router.patch("/applications/:id/approve", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    const application = await prisma.tutorApplication.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!application) {
      return res.status(404).json({ error: { message: "Application not found" } });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({ error: { message: `Application is already ${application.status}` } });
    }

    // Run in transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update application status
      const updatedApp = await tx.tutorApplication.update({
        where: { id },
        data: { status: 'APPROVED' }
      });

      // 2. Update user role
      await tx.user.update({
        where: { id: application.userId },
        data: { role: 'TUTOR' }
      });

      // 3. Create or update TutorProfile
      const profile = await tx.tutorProfile.upsert({
        where: { userId: application.userId },
        update: {
          bio: application.bio,
          hourlyRate: application.hourlyRate,
          experience: application.experience,
          education: application.education,
          portfolioUrl: application.portfolioUrl,
        },
        create: {
          userId: application.userId,
          bio: application.bio,
          hourlyRate: application.hourlyRate,
          experience: application.experience,
          education: application.education,
          portfolioUrl: application.portfolioUrl,
          isVerified: true // auto-verify on admin approval
        }
      });

      // 4. Create TutorSubject entries
      // First delete any existing to avoid duplicates if profile existed
      await tx.tutorSubject.deleteMany({
        where: { tutorId: profile.id }
      });

      if (application.subjectIds && application.subjectIds.length > 0) {
        await tx.tutorSubject.createMany({
          data: application.subjectIds.map(subjectId => ({
            tutorId: profile.id,
            subjectId
          }))
        });
      }

      // 5. Notify the user
      await (tx as any).notification.create({
        data: {
          userId: application.userId,
          title: "Application Approved!",
          message: "Congratulations! Your application to become a tutor has been approved.",
          type: "APPLICATION",
          link: "/tutor/dashboard",
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

// PATCH /api/admin/applications/:id/reject - Reject application
router.patch("/applications/:id/reject", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    const application = await prisma.tutorApplication.findUnique({
      where: { id }
    });

    if (!application) {
      return res.status(404).json({ error: { message: "Application not found" } });
    }

    const updated = await prisma.tutorApplication.update({
      where: { id },
      data: { status: 'REJECTED' }
    });

    // Notify the user
    try {
      await (prisma as any).notification.create({
        data: {
          userId: application.userId,
          title: "Application Status Update",
          message: "We've reviewed your application to become a tutor. Unfortunately, it has been rejected at this time.",
          type: "APPLICATION",
          link: "/become-a-tutor", // Or wherever they can see status/try again
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

export default router;
