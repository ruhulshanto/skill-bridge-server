import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { getHeadersInit } from "../lib/request.js";

const router: Router = Router();

// GET /api/notifications - Get current user notifications
router.get("/", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const notifications = await (prisma as any).notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ data: notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

// PATCH /api/notifications/:id/read - Mark a notification as read
router.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const { id } = req.params;

    const notification = await (prisma as any).notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found" } });
    }

    if (notification.userId !== session.user.id) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const updated = await (prisma as any).notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ data: updated });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

// PATCH /api/notifications/read-all - Mark all as read
router.patch("/read-all", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    await (prisma as any).notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ data: { message: "All notifications marked as read" } });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: getHeadersInit(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const { id } = req.params;

    const notification = await (prisma as any).notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ error: { message: "Notification not found" } });
    }

    if (notification.userId !== session.user.id) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    await (prisma as any).notification.delete({
      where: { id },
    });

    res.json({ data: { message: "Notification deleted" } });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

export default router;
