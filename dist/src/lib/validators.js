import { z } from "zod";
export const createBookingSchema = z.object({
    tutorId: z.string().min(1, "tutorId is required"),
    date: z.string().min(1, "date is required"),
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "startTime must be HH:MM"),
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/, "endTime must be HH:MM"),
    notes: z.string().optional(),
});
export const createReviewSchema = z.object({
    bookingId: z.string().min(1, "bookingId is required"),
    rating: z.coerce.number().min(1).max(5).default(5),
    comment: z.string().optional(),
});
//# sourceMappingURL=validators.js.map