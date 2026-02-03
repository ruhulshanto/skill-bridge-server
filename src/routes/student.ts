import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

// PUT /api/student/profile - Update student profile
router.put("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
      });
    }

    const { name, phone, bio, location } = req.body;
    console.log("📝 Update request for user:", session.user.id, { name, phone, bio, location });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    
    // Only include bio and location if they are provided, 
    // but the user mentioned they might not be in the DB yet.
    // We'll keep them for future compatibility if the schema has them.
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;

    console.log("📊 Final update data:", updateData);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
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
        updatedAt: true,
      },
    });

    res.json({
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating student profile:", error);
    res.status(500).json({
      error: { message: "Failed to update profile" },
    });
  }
});

// GET /api/student/profile - Get student profile
router.get("/profile", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user || session.user.role !== "STUDENT") {
      return res.status(401).json({
        error: { message: "Unauthorized" },
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
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: { message: "Student not found" },
      });
    }

    res.json({
      data: user,
    });
  } catch (error) {
    console.error("Error fetching student profile:", error);
    res.status(500).json({
      error: { message: "Failed to fetch profile" },
    });
  }
});

export default router;
