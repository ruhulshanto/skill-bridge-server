import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const session = await auth.api.getSession({
    headers: getHeadersInit(req.headers),
  });
  if (!session?.user || session.user.role !== "ADMIN") {
    res.status(403).json({ error: { message: "Forbidden" } });
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

    res.json({
      data: users,
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

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
        ...(location !== undefined && { location }),
      },
    });

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

export default router;
