import express from "express";
import Groq from "groq-sdk";

const router = express.Router();

// Initialize Groq Client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

router.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        message: "AI Service (Groq) is reachable", 
        hasKey: !!process.env.GROQ_API_KEY 
    });
});

// Simple global rate limiting
let requestCount = 0;
const MAX_DAILY_REQUESTS = 100; // Groq typically has higher limits

router.post("/chat", async (req, res) => {
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
            return res.json({ response: "Daily limit reached. Please try again tomorrow! 🚀" });
        }

        requestCount++;

        // 1. Prepare Messages for Groq
        const messages: any[] = [
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

        // 2. Add History
        if (history && Array.isArray(history)) {
            const formattedHistory = history.map((h: any) => ({
                role: h.role === "assistant" || h.role === "bot" || h.role === "model" ? "assistant" : "user",
                content: h.text || h.content || ""
            })).filter(h => h.content.trim() !== "");
            
            messages.push(...formattedHistory);
        }

        // 3. Add Current Message
        messages.push({
            role: "user",
            content: message
        });

        console.log(`AI REQUEST (Groq): Processing message using llama-3.1-8b-instant...`);
        
        const completion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.1-8b-instant",
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
        });

        const responseText = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

        console.log(`AI RESPONSE: Success`);
        res.json({ response: responseText });

    } catch (error: any) {
        console.error("Groq API Error:", error.message);
        res.status(500).json({ 
            error: "Failed to generate AI response", 
            details: error.message 
        });
    }
});

export default router;
