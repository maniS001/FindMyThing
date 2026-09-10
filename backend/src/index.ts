// Backend v2.2 - Math CAPTCHA, Push Notifications, Payment Gateway, AI Validation
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { findMatchingComplaints } from './matching';

// Load environment variables
dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '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';

// Initialize Firebase Admin
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
            credential: cert(serviceAccount)
        });
    } else {
        console.warn("FIREBASE_SERVICE_ACCOUNT env variable not found. Phone auth will fail. Please add it to your .env file as a JSON string.");
        initializeApp();
    }
} catch (error) {
    console.error("Firebase Admin initialization error:", error);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Helper function to send push notification via Expo
async function sendPushNotification(pushToken: string, title: string, body: string, data?: any) {
    const message = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
    };

    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        console.log(`Push notification sent to ${pushToken.substring(0, 20)}...`);
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

// Middleware to authenticate token
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// ============= In-Memory CAPTCHA Store =============
// Stores { text, expiresAt } keyed by captchaId
const captchaStore = new Map<string, { text: string; expiresAt: number }>();

// Clean up expired captchas every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, captcha] of captchaStore.entries()) {
        if (captcha.expiresAt < now) captchaStore.delete(id);
    }
}, 10 * 60 * 1000);

// ============= Gemini AI Setup =============
const geminiClient = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

// Try models in order of preference (newest/cheapest first)
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-1.5-flash',
];

const getGeminiModel = (modelIndex = 0) => {
    if (!geminiClient) throw new Error('GEMINI_API_KEY not configured');
    const modelName = GEMINI_MODELS[modelIndex] || GEMINI_MODELS[0];
    return geminiClient.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json",
        },
        systemInstruction: `You are the dedicated AI Agent for FindMate, a modern Lost & Found application.
Your primary goals are to:
1. Ensure all lost and found item reports are logically consistent, genuine, and high quality.
2. Strictly protect user privacy by blocking any attempts to share phone numbers, emails, or social media handles in public descriptions.
3. Prevent fraud by carefully analyzing the context of claims and security questions.
Always respond exactly in the requested JSON format without markdown formatting.`
    });
};

// ============= AI Validation Endpoints =============

// Robust Gemini call — tries each model in fallback order
async function callGemini(prompt: string): Promise<string> {
    if (!geminiClient) throw new Error('GEMINI_API_KEY not configured');
    let lastErr: any;
    for (let i = 0; i < GEMINI_MODELS.length; i++) {
        try {
            const model = getGeminiModel(i);
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (err: any) {
            lastErr = err;
            const msg = (err.message || '').toLowerCase();
            // Retry on model-not-found, unsupported, or quota/rate-limit errors
            if (msg.includes('not found') || msg.includes('404') || msg.includes('not supported') || 
                msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests')) {
                console.warn(`Model ${GEMINI_MODELS[i]} failed (${msg}), trying next...`);
                continue;
            }
            throw err; // Other errors (like 401 Auth) — don't retry
        }
    }
    throw lastErr;
}

app.post('/api/ai/validate-complaint', async (req, res) => {
    const { name, category, description, location, date } = req.body;
    const prompt = `You are a lost item complaint validator for a mobile app.
Validate the following fields and return JSON only.
Today's Date: ${new Date().toISOString().split('T')[0]}

Fields submitted:
- Item Name: "${name || ''}"
- Category: "${category || ''}"
- Description: "${description || ''}"
- Location Lost: "${location || ''}"
- Date Lost: "${date || ''}"

Rules:
1. STRICT: The Category must logically match the Item Name. (e.g., iPhone must be Electronics. If Name is "Wallet" and Category is "Pets", set valid:false).
2. STRICT: The Location must be a realistic place. If it is gibberish or non-sensical, set valid:false.
3. STRICT: The Date Lost cannot be in the future. If it is after Today's Date, set valid:false.
4. Description must not contain phone numbers, emails, or social media handles.
5. If the report is otherwise genuine and makes sense, set valid:true.

Respond ONLY with this JSON:
{
  "valid": true or false,
  "issues": ["list of issues if any"],
  "suggestions": ["optional improvements"]
}`;
    try {
        let text = await callGemini(prompt);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        const parsed = JSON.parse(text);
        res.json(parsed);
    } catch (err: any) {
        console.error('AI validate-complaint error:', err.message);
        // On AI failure, don't block the submission
        res.json({ valid: true, issues: [], suggestions: [], error: err.message });
    }
});

// 1b. Validate founder report form fields
app.post('/api/ai/validate-founder-report', async (req, res) => {
    const { name, category, location, date, description, questions } = req.body;
    const qList = (questions || []).map((q: any, i: number) => `Q${i+1}: ${q.question} (Answer: ${q.answer})`).join('\n');
    const prompt = `You are a lost & found claim validator.
Check this founder report for logical consistency and security.
Today's Date: ${new Date().toISOString().split('T')[0]}

Fields:
- Name: "${name || ''}"
- Category: "${category || ''}"
- Location: "${location || ''}"
- Date: "${date || ''}"
- Description: "${description || ''}"
- Security Questions:
${qList}

Rules:
1. STRICT: The Category must logically match the Item Name. (e.g., If Name is "Wallet" and Category is "Pets", set valid:false).
2. STRICT: The Location must be a realistic place. If it is gibberish or non-sensical, set valid:false.
3. STRICT: The Date Found cannot be in the future. If it is after Today's Date, set valid:false.
4. Security questions must be highly relevant to the item.
5. STRICTLY BLOCK any phone numbers, emails, or social media links in the description or questions.
If all strict rules are passed and the report is realistic without contact info, set valid to true. Otherwise, set valid to false.

Respond ONLY with JSON:
{
  "valid": true/false,
  "reason": "explanation if invalid, empty string if valid",
  "issues": ["list of issues"],
  "detectedContactInfo": ["any detected contact info"]
}`;
    try {
        let text = await callGemini(prompt);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        res.json(JSON.parse(text));
    } catch (err: any) {
        console.error('AI validate-founder-report error:', err.message);
        res.json({ valid: true, reason: '', issues: [], detectedContactInfo: [] });
    }
});

// 2. Validate founder description (detect hidden phone numbers/contacts)
app.post('/api/ai/validate-description', async (req, res) => {
    const { description } = req.body;
    const prompt = `You are a content moderator for a lost & found app.
Check if the following description contains any contact information that should not be there.

Description: "${description || ''}"

Check for:
1. Phone numbers (any format: 9876543210, +91-98765-43210, 98765 43210, etc.)
2. Email addresses
3. WhatsApp numbers or links
4. Social media handles (@username, facebook.com/...)
5. Any other direct contact bypass attempts

Respond ONLY with this JSON (no markdown, no explanation):
{
  "valid": true/false,
  "reason": "explanation if invalid, empty string if valid",
  "detected": ["detected contact info if any"]
}`;
    try {
        let text = await callGemini(prompt);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        res.json(JSON.parse(text));
    } catch (err: any) {
        console.error('AI validate-description error:', err.message);
        res.json({ valid: true, reason: '', detected: [] });
    }
});

// 2b. Auto-generate description
app.post('/api/ai/generate-description', async (req, res) => {
    const { name, category, location, date, role } = req.body;
    const isVictim = role !== 'founder';
    const action = isVictim ? 'lost' : 'found';
    const firstWord = isVictim ? 'I lost my' : 'I found a';

    const prompt = `You are a user of a lost & found app writing a personal note.
Write exactly 2 sentences from a FIRST-PERSON perspective describing an item you ${action}.

CRITICAL RULES — you will be rejected if you break any:
1. The VERY FIRST words of the description MUST be: "${firstWord} ${name}"
   Example for victim: "I lost my ${name} at ${location}..."
   Example for founder: "I found a ${name} at ${location}..."
2. Write as the PERSON who ${action} the item — NOT as a support team or system.
3. Do NOT use phrases like "reported", "please contact", "FindMate", "contact support".
4. Do NOT include phone numbers, emails, or placeholder text.
5. Do NOT invent details beyond what is provided.
6. Keep it natural and personal, like a real person writing.

Item details:
- Name: ${name}
- Category: ${category}
- Location: ${location}
- Date: ${date}

Respond ONLY with this JSON (no markdown, no extra text):
{
  "description": "the 2-sentence personal description starting with '${firstWord} ${name}'"
}`;
    try {
        let text = await callGemini(prompt);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        const parsed = JSON.parse(text);
        let desc = parsed.description || '';
        // Enforce first-person start as a safety net
        if (desc && !desc.toLowerCase().startsWith('i ')) {
            desc = `${firstWord} ${name} at ${location} on ${date}. ${desc}`;
        }
        res.json({ description: desc });
    } catch (err: any) {
        console.error('AI generate-description error:', err.message);
        res.json({ description: '', error: err.message });
    }
});

// 3. Validate Q&A answers using mixed dynamic flow
app.post('/api/ai/validate-answers', async (req, res) => {
    const { questions, founderReportData } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'questions array required' });
    }
    
    // First, check for exact matches locally
    let allExact = true;
    for (const q of questions) {
        const u = q.userAnswer.toLowerCase().trim();
        const c = q.correctAnswer.toLowerCase().trim();
        if (u !== c) {
            allExact = false;
            break;
        }
    }
    
    if (allExact) {
        return res.json({ status: 'exact', message: 'Perfect match.' });
    }

    try {
        const qList = questions.map((q: any, i: number) =>
            `Q${i + 1}: "${q.question}"\n  Founder's Expected Answer: "${q.correctAnswer}"\n  Victim's Answer: "${q.userAnswer}"`
        ).join('\n\n');

        const prompt = `You are a lost item claim verifier.
Evaluate if the victim's answers logically prove they own the item, even if they aren't the exact words the founder used.

Founder's hidden report context:
Name: ${founderReportData?.name || ''}
Description: ${founderReportData?.description || ''}

Questions and answers:
${qList}

If the answers are completely wrong, respond with status "wrong".
If the answers are logically correct or very close (semantic match), respond with status "semantic" AND generate 2 follow-up questions. 
CRITICAL RULES FOR FOLLOW-UP QUESTIONS:
1. Do NOT ask questions where the answer is obvious from the Item's Name (e.g., if the name is "Physics Book Volume 1", do NOT ask "What is the subject?" or "What is the volume?").
2. Ask about HIDDEN details from the description (e.g., color, scratches, specific contents).
3. If the description is empty or lacks hidden details, ask questions only the true owner would know (e.g., "Are there any specific markings or names written on it?", "What specific brand or model is it?", "What was inside it?").
4. Make the questions challenging to prevent fraud.

Respond ONLY with this JSON:
{
  "status": "wrong" | "semantic",
  "followUpQuestions": ["Question 1?", "Question 2?"],
  "reason": "Brief explanation of your decision"
}`;

        let text = await callGemini(prompt);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        const parsed = JSON.parse(text);
        res.json(parsed);
    } catch (err: any) {
        console.error('AI validate-answers error:', err.message);
        res.json({ status: 'wrong', message: 'Validation failed.' });
    }
});

// ============= CAPTCHA Endpoints =============

// Generate CAPTCHA
app.get('/api/captcha/generate', (req, res) => {
    // Generate two random numbers for a math problem
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const answer = String(a + b);
    const question = `${a} + ${b} = ?`;

    const captchaId = uuidv4();
    // Store the answer server-side, expire in 5 minutes
    captchaStore.set(captchaId, { text: answer, expiresAt: Date.now() + 5 * 60 * 1000 });
    // Return the question as plain text — frontend renders it (no SVG/image, avoids Fabric incompatibility)
    res.json({ captchaId, question });
});

// Verify CAPTCHA
app.post('/api/captcha/verify', (req, res) => {
    const { captchaId, answer } = req.body;
    const stored = captchaStore.get(captchaId);
    if (!stored) return res.status(400).json({ valid: false, error: 'CAPTCHA expired or not found. Please refresh.' });
    if (Date.now() > stored.expiresAt) {
        captchaStore.delete(captchaId);
        return res.status(400).json({ valid: false, error: 'CAPTCHA expired. Please refresh.' });
    }
    const isValid = String(answer).trim() === String(stored.text).trim();
    if (isValid) captchaStore.delete(captchaId); // Single-use
    res.json({ valid: isValid });
});

// ============= Auth Endpoints =============

// Phone Login (Primary Authentication)
app.post('/api/auth/phone-login', async (req, res) => {
    try {
        const { firebaseIdToken, name, pushToken, latitude, longitude, location } = req.body;

        if (!firebaseIdToken) {
            return res.status(400).json({ error: 'Firebase ID Token is required' });
        }

        // Verify the token with Firebase Admin
        const decodedToken = await getAuth().verifyIdToken(firebaseIdToken);
        const phone = decodedToken.phone_number;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number not found in token' });
        }

        let user = await prisma.user.findUnique({ where: { phone } });

        if (!user) {
            if (!name) {
                // If user doesn't exist, name must be provided (from Onboarding screen)
                return res.status(400).json({ error: 'User does not exist. Name is required to register.' });
            }
            
            user = await prisma.user.create({
                data: {
                    phone,
                    name,
                    location,
                    latitude,
                    longitude,
                    pushToken,
                    password: ''
                },
            });
        } else {
            // User exists, update location/push token if provided
            try {
                if (location || latitude || longitude || pushToken) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { location, latitude, longitude, pushToken }
                    });
                }
            } catch (ignore) {
                console.warn('Could not update user location (schema mismatch?)');
            }
        }

        const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET);
        res.json({ token, user: { id: user.id, name: user.name, phone: user.phone } });
    } catch (error) {
        console.error('Phone auth error:', error);
        res.status(500).json({
            error: 'Phone auth failed',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// Update Push Token (called on every app launch when user is already logged in)
app.post('/api/auth/update-push-token', authenticateToken, async (req: any, res: any) => {
    try {
        const { pushToken, latitude, longitude } = req.body;
        const userId = req.user.id;
        if (!pushToken) return res.status(400).json({ error: 'pushToken is required' });
        await prisma.user.update({
            where: { id: userId },
            data: {
                pushToken,
                ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
            },
        });
        res.json({ message: 'Push token and location updated successfully' });
    } catch (error) {
        console.error('Error updating push token:', error);
        res.status(500).json({ error: 'Failed to update push token' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                items: {
                    orderBy: { createdAt: 'desc' },
                    include: { questions: true }
                },
                complaints: { orderBy: { createdAt: 'desc' } },
                notifications: { orderBy: { createdAt: 'desc' } },
            },
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ============= Notification Endpoints =============

app.get('/api/notifications', authenticateToken, async (req: any, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });

        // Enrich notifications with current complaint status
        const enrichedNotifications = await Promise.all(
            notifications.map(async (notification) => {
                if (notification.type === 'CLAIM_REQUEST' && notification.payload) {
                    try {
                        const payload = JSON.parse(notification.payload);
                        if (payload.complaintId) {
                            const complaint = await prisma.complaint.findUnique({
                                where: { id: payload.complaintId },
                                select: { status: true }
                            });
                            payload.complaintStatus = complaint?.status || 'OPEN';
                            return {
                                ...notification,
                                payload: JSON.stringify(payload)
                            };
                        }
                    } catch (e) {
                        console.error('Error enriching notification', e);
                    }
                }
                return notification;
            })
        );

        res.json(enrichedNotifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get unread notification count
app.get('/api/notifications/unread-count', authenticateToken, async (req: any, res) => {
    try {
        const count = await prisma.notification.count({
            where: {
                userId: req.user.id,
                read: false
            }
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', authenticateToken, async (req: any, res) => {
    try {
        const notification = await prisma.notification.update({
            where: { id: req.params.id },
            data: { read: true }
        });
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Delete a single notification
app.delete('/api/notifications/:id', authenticateToken, async (req: any, res) => {
    try {
        await prisma.notification.delete({
            where: { id: req.params.id, userId: req.user.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Clear all notifications
app.delete('/api/notifications', authenticateToken, async (req: any, res) => {
    try {
        await prisma.notification.deleteMany({
            where: { userId: req.user.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

// ============= Existing Endpoints (Updated with userId optional) =============

// Create Item (Updated to link user)

// Preview matches without creating an item
app.post('/api/items/preview-matches', async (req, res) => {
    try {
        const { name, category, location, date } = req.body;
        const matches = await findMatchingComplaints({ name, category, location, date }, prisma);
        res.json({ matches });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to preview matches' });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const { name, category, location, date, description, contactInfo, imageUri, imageUris, questions, userId, latitude, longitude, notifyRadius, targetCommunityId, targetOrganizationId, skipNotifications } = req.body;

        // Handle both imageUri (single) and imageUris (array)
        const images = imageUris || (imageUri ? [imageUri] : []);

        // Create the item
        const item = await prisma.item.create({
            data: {
                name: String(name).trim(),
                category: String(category).trim(),
                location: String(location).trim(),
                date,
                description,
                contactInfo,
                imageUris: images,
                questions: {
                    create: questions,
                },
                userId: userId || null, // Link to user if provided
                latitude: latitude || null,
                longitude: longitude || null,
                notifyRadius: notifyRadius || null,
                targetCommunityId: targetCommunityId || null,
                targetOrganizationId: targetOrganizationId || null,
            },
            include: {
                questions: true,
            },
        });

        // Check for matching complaints
        const matches = await findMatchingComplaints({ name, category, location, date }, prisma);

        // Create notification for matching complaints
        if (matches.length > 0 && !skipNotifications) {
            for (const match of matches) {
                const complaint = match.complaint;
                if (complaint.userId && complaint.userId !== userId) {
                    const complaintUser = await prisma.user.findUnique({ where: { id: complaint.userId } });
                    
                    if (complaintUser) {
                        // 1. Save notification to database
                        await prisma.notification.create({
                            data: {
                                userId: complaintUser.id,
                                title: 'Possible Match Found!',
                                message: `Someone found a "${item.name}" that might be yours!`,
                                type: 'MATCH_ALERT',
                                payload: JSON.stringify({ itemId: item.id, complaintId: complaint.id }),
                            }
                        });

                        // 2. Send Expo Push Notification
                        if (complaintUser.pushToken) {
                            await sendPushNotification(
                                complaintUser.pushToken,
                                'Possible Match Found! 🎉',
                                `Someone found a "${item.name}" that matches your complaint. Check it out now!`,
                                { url: `/notifications` }
                            );
                        }
                    }
                }
            }
        }
        res.json({
            item,
            matches: matches.map(m => ({
                complaintId: m.complaintId,
                complaint: m.complaint,
                score: m.score,
                matchedFields: m.matchedFields,
            })),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// Create Complaint (Updated to link user)
app.post('/api/complaints', async (req, res) => {
    try {
        const { name, category, location, date, description, contactInfo, imageUris, userId, cashPrize, latitude, longitude, notifyRadius, targetCommunityId, targetOrganizationId } = req.body;
        const complaint = await prisma.complaint.create({
            data: {
                name: String(name).trim(),
                category: String(category).trim(),
                location: String(location).trim(),
                date,
                description,
                contactInfo,
                imageUris: imageUris ? JSON.stringify(imageUris) : '[]',
                userId: userId || null,
                cashPrize: cashPrize || null,
                latitude: latitude || null,
                longitude: longitude || null,
                notifyRadius: notifyRadius || 1,
                targetCommunityId: targetCommunityId || null,
                targetOrganizationId: targetOrganizationId || null,
            },
        });
        res.json(complaint);

        // Notify relevant users
        if (location || targetCommunityId || targetOrganizationId) {
            try {
                const allUsers = await prisma.user.findMany({
                    where: { NOT: { id: userId || 'unknown-id' } },
                    include: { memberships: true, orgAdmins: true }
                });

                const complaintLat = latitude || null;
                const complaintLon = longitude || null;
                const radius = notifyRadius || 5;

                let usersToNotify = allUsers.filter((user: any) => {
                    // 1. Community target: only notify community members
                    if (targetCommunityId) {
                        return user.memberships.some((m: any) => m.communityId === targetCommunityId);
                    }

                    // 2. Organization target: only notify org admins/members
                    if (targetOrganizationId) {
                        return user.orgAdmins.some((a: any) => a.organizationId === targetOrganizationId);
                    }

                    // 3. Radius: GPS-based if complaint has coordinates
                    if (complaintLat && complaintLon) {
                        // If user has GPS saved → filter by distance
                        if (user.latitude && user.longitude) {
                            const distance = calculateDistance(complaintLat, complaintLon, user.latitude, user.longitude);
                            return distance <= radius;
                        }
                        // If user has no GPS saved → skip them (they haven't opened the app recently)
                        return false;
                    }

                    // 4. Complaint has no GPS at all → notify everyone as best effort
                    return true;
                });

                console.log(`Found ${usersToNotify.length} users to notify for complaint in ${location}`);

                if (usersToNotify.length > 0) {
                    const notifications = usersToNotify.map(user => ({
                        userId: user.id,
                        title: 'New Complaint Matching Your Notification Settings',
                        message: `Someone lost a "${name}" in ${location}. Check if you can help!`,
                        type: 'AREA_ALERT',
                        payload: JSON.stringify({ complaintId: complaint.id, location }),
                    }));

                    await prisma.notification.createMany({
                        data: notifications
                    });
                    
                    // Actually trigger the push notifications!
                    for (const user of usersToNotify) {
                        if (user.pushToken) {
                            await sendPushNotification(
                                user.pushToken,
                                'New Complaint',
                                `Someone lost a "${name}" in ${location}. Check if you can help!`,
                                { url: `/notifications` }
                            );
                        }
                    }
                    console.log(`Sent ${notifications.length} notifications.`);
                }
            } catch (notifyError) {
                console.error('Error sending location notifications:', notifyError);
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create complaint' });
    }
});

// ... (Rest of existing endpoints remain same)

// List Items (with search)
app.get('/api/items', async (req, res) => {
    try {
        let currentUser: any = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as any;
                    currentUser = await prisma.user.findUnique({
                        where: { id: decoded.id },
                        include: { memberships: true, orgAdmins: true }
                    });
                } catch (e) {
                    // Ignore, continue as guest
                }
            }
        }

        const { query, claimedBy, excludeClaimed, communityId, orgId, lat, lng, radius } = req.query;
        let where: any = {};

        if (currentUser) {
            where.userId = { not: currentUser.id };
        }

        if (query) {
            const q = String(query).trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
                { location: { contains: q, mode: 'insensitive' as const } },
            ];
        }

        if (communityId) {
            where.targetCommunityId = String(communityId);
        } else if (orgId) {
            where.targetOrganizationId = String(orgId);
        }

        if (claimedBy) {
            where.claimedByUserId = String(claimedBy);
        }

        if (excludeClaimed === 'true') {
            where.status = { in: ['OPEN', 'REOPENED'] };
        }

        let items = await prisma.item.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { questions: true },
        });

        items = items.filter(item => {
            // Founder's Community constraint
            if (item.targetCommunityId) {
                if (!currentUser) return false;
                const isMember = currentUser.memberships.some((m: any) => 
                    m.communityId === item.targetCommunityId && 
                    (m.role === 'MEMBER' || m.role === 'ADMIN')
                );
                if (!isMember) return false;
            }
            
            // Founder's Organization constraint
            if (item.targetOrganizationId) {
                if (!currentUser) return false;
                const isAdmin = currentUser.orgAdmins.some((o: any) => o.organizationId === item.targetOrganizationId);
                if (!isAdmin) return false;
            }

            // Founder's Radius constraint
            if (item.notifyRadius && item.latitude && item.longitude && !item.targetCommunityId && !item.targetOrganizationId) {
                if (!currentUser || !currentUser.latitude || !currentUser.longitude) return false;
                const distance = calculateDistance(item.latitude, item.longitude, currentUser.latitude, currentUser.longitude);
                if (distance > item.notifyRadius) return false;
            }

            return true;
        });

        // Apply radius filter if provided and not filtering by community/org
        if (lat && lng && radius && !communityId && !orgId) {
            const userLat = parseFloat(String(lat));
            const userLng = parseFloat(String(lng));
            const searchRadius = parseFloat(String(radius));
            
            items = items.filter(item => {
                if (item.latitude && item.longitude) {
                    const distance = calculateDistance(userLat, userLng, item.latitude, item.longitude);
                    return distance <= searchRadius;
                }
                return true; // If item has no coordinates, we keep it as a fallback
            });
        }

        res.json(items);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Get Item by ID
app.get('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const item = await prisma.item.findUnique({
            where: { id },
            include: { questions: true },
        });
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(item);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// List Complaints (with search)
app.get('/api/complaints', async (req, res) => {
    try {
        let currentUser: any = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as any;
                    currentUser = await prisma.user.findUnique({ where: { id: decoded.id } });
                } catch (e) {
                    // Ignore, continue as guest
                }
            }
        }

        const { query, communityId, orgId, lat, lng, radius } = req.query;
        let where: any = { status: 'OPEN' };

        if (currentUser) {
            where.userId = { not: currentUser.id };
        }

        if (query) {
            const q = String(query).trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
                { location: { contains: q, mode: 'insensitive' as const } },
            ];
        }

        if (communityId) {
            where.targetCommunityId = String(communityId);
        } else if (orgId) {
            where.targetOrganizationId = String(orgId);
        }

        let complaints = await prisma.complaint.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        // Apply radius filter if provided and not filtering by community/org
        if (lat && lng && radius && !communityId && !orgId) {
            const userLat = parseFloat(String(lat));
            const userLng = parseFloat(String(lng));
            const searchRadius = parseFloat(String(radius));
            
            complaints = complaints.filter(complaint => {
                if (complaint.latitude && complaint.longitude) {
                    const distance = calculateDistance(userLat, userLng, complaint.latitude, complaint.longitude);
                    return distance <= searchRadius;
                }
                return true; // Keep if no coordinates available
            });
        }

        res.json(complaints);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch complaints' });
    }
});

// Get Complaint by ID
app.get('/api/complaints/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await prisma.complaint.findUnique({
            where: { id },
        });
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        res.json(complaint);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch complaint' });
    }
});

// Update Item (Status and Details)
app.patch('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, name, category, location, date, description, contactInfo, imageUris, questions, notifyRadius, targetCommunityId, targetOrganizationId } = req.body;

        const data: any = {};
        if (status !== undefined) data.status = status;
        if (name !== undefined) data.name = name;
        if (category !== undefined) data.category = category;
        if (location !== undefined) data.location = location;
        if (date !== undefined) data.date = date;
        if (description !== undefined) data.description = description;
        if (contactInfo !== undefined) data.contactInfo = contactInfo;
        if (notifyRadius !== undefined) data.notifyRadius = notifyRadius;
        if (targetCommunityId !== undefined) data.targetCommunityId = targetCommunityId;
        if (targetOrganizationId !== undefined) data.targetOrganizationId = targetOrganizationId;

        // Handle images array
        if (imageUris) {
            // Prisma expects string[] for scalar list
            data.imageUris = imageUris;
        }

        // Handle nested questions update if provided
        if (questions) {
            data.questions = {
                deleteMany: {}, // Delete all existing questions
                create: questions.map((q: any) => ({
                    question: q.question,
                    answer: q.answer
                }))
            };
        }

        const item = await prisma.item.update({
            where: { id },
            data,
            include: { questions: true }
        });
        res.json(item);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// Update Complaint Status (with founder notification)
app.patch('/api/complaints/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, closureReason, reopenReason, resolvedAt, name, category, location, date, description, contactInfo, imageUris, notifyRadius, targetCommunityId, targetOrganizationId } = req.body;

        // Get the current complaint to check if status is changing
        const currentComplaint = await prisma.complaint.findUnique({ where: { id } });
        if (!currentComplaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        const previousStatus = currentComplaint.status;
        const data: any = {};
        if (status) data.status = status;
        if (closureReason) data.closureReason = closureReason;
        if (reopenReason) data.reopenReason = reopenReason;
        if (resolvedAt) data.resolvedAt = resolvedAt;

        // Allow updating content fields
        if (name !== undefined) data.name = name;
        if (category !== undefined) data.category = category;
        if (location !== undefined) data.location = location;
        if (date !== undefined) data.date = date;
        if (description !== undefined) data.description = description;
        if (contactInfo !== undefined) data.contactInfo = contactInfo;
        if (notifyRadius !== undefined) data.notifyRadius = notifyRadius;
        if (targetCommunityId !== undefined) data.targetCommunityId = targetCommunityId;
        if (targetOrganizationId !== undefined) data.targetOrganizationId = targetOrganizationId;
        if (imageUris !== undefined) data.imageUris = typeof imageUris === 'string' ? imageUris : JSON.stringify(imageUris);

        const complaint = await prisma.complaint.update({
            where: { id },
            data,
        });

        // If status changed to CLOSED, check if there's a linked notification and notify the founder
        if (status === 'CLOSED' && previousStatus !== 'CLOSED') {
            // Find the notification that has this complaint to get the founder's item
            const victimNotifications = await prisma.notification.findMany({
                where: {
                    userId: currentComplaint.userId || undefined,
                    type: 'CLAIM_REQUEST'
                }
            });

            console.log(`Looking for notifications for complaint ${id}, found ${victimNotifications.length}`);

            for (const notification of victimNotifications) {
                try {
                    const payload = JSON.parse(notification.payload || '{}');
                    console.log(`Checking notification payload:`, payload);
                    if (payload.complaintId === id && payload.itemId) {
                        // Get the item to find founder
                        const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
                        console.log(`Found item:`, item?.id, item?.status);
                        if (item && item.userId) {
                            // Determine if this was a Claim (via verification) or intentional close
                            const isClaim = closureReason === 'Founder contacted via Notification';
                            const newStatus = isClaim ? 'CLAIMED' : 'CLOSED';

                            // Update item status
                            await prisma.item.update({
                                where: { id: payload.itemId },
                                data: { status: newStatus }
                            });
                            console.log(`Updated item ${payload.itemId} status to ${newStatus}`);

                            // Notify founder that victim closed the complaint
                            await prisma.notification.create({
                                data: {
                                    userId: item.userId,
                                    title: 'Complaint Closed by Victim',
                                    message: `The victim has closed their complaint "${currentComplaint.name}". Reason: ${closureReason || 'No reason provided'}`,
                                    type: 'COMPLAINT_CLOSED',
                                    payload: JSON.stringify({ complaintId: id, itemId: payload.itemId, reason: closureReason }),
                                }
                            });
                            console.log(`Created notification for founder ${item.userId}`);
                        }
                        break;
                    }
                } catch (e) {
                    console.error('Error processing notification', e);
                }
            }
        }

        // If reopening a complaint (any status -> OPEN), notify founder if there was a previous notification
        if (status === 'OPEN' && previousStatus !== 'OPEN') {
            const victimNotifications = await prisma.notification.findMany({
                where: {
                    userId: currentComplaint.userId || undefined,
                    type: 'CLAIM_REQUEST'
                }
            });

            console.log(`Looking for notifications for reopening complaint ${id}, found ${victimNotifications.length}`);

            for (const notification of victimNotifications) {
                try {
                    const payload = JSON.parse(notification.payload || '{}');
                    if (payload.complaintId === id && payload.itemId) {
                        const item = await prisma.item.findUnique({ where: { id: payload.itemId } });
                        console.log(`Found item for reopen:`, item?.id, item?.status);
                        if (item && item.userId) {
                            // Update item status to REOPENED
                            await prisma.item.update({
                                where: { id: payload.itemId },
                                data: {
                                    status: 'REOPENED',
                                    reopenReason: reopenReason,
                                    linkedComplaintId: id
                                }
                            });
                            console.log(`Updated item ${payload.itemId} status to REOPENED`);

                            // Notify founder that victim reopened the complaint
                            await prisma.notification.create({
                                data: {
                                    userId: item.userId,
                                    title: 'Complaint Reopened',
                                    message: `The victim has reopened their complaint "${currentComplaint.name}". ${reopenReason || ''}`,
                                    type: 'COMPLAINT_REOPENED',
                                    payload: JSON.stringify({ complaintId: id, itemId: payload.itemId, reason: reopenReason }),
                                }
                            });
                            console.log(`Created reopen notification for founder ${item.userId}`);

                            // Send Push Notification
                            const founderUser = await prisma.user.findUnique({ where: { id: item.userId } });
                            if (founderUser && founderUser.pushToken) {
                                await sendPushNotification(
                                    founderUser.pushToken,
                                    'Complaint Reopened ⚠️',
                                    `The victim has reopened their complaint "${currentComplaint.name}". ${reopenReason || ''}`,
                                    { url: `/notifications` }
                                );
                            }
                        }
                        break;
                    }
                } catch (e) {
                    console.error('Error processing notification', e);
                }
            }
        }

        res.json(complaint);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update complaint' });
    }
});

// Resolve Complaint (with feedback) - Victim marks complaint as resolved
app.post('/api/complaints/:id/resolve', authenticateToken, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;

        // Update complaint to RESOLVED with feedback
        const complaint = await prisma.complaint.update({
            where: { id },
            data: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
                feedbackRating: rating,
                feedbackComment: comment,
                closureReason: 'Item recovered via FindMate'
            },
        });

        // Find and update any linked items (from notifications) to RECOVERED
        const notifications = await prisma.notification.findMany({
            where: {
                userId: req.user.id,
                type: 'CLAIM_REQUEST',
            }
        });

        // Find notification with this complaint and update linked item
        for (const notification of notifications) {
            try {
                const payload = JSON.parse(notification.payload || '{}');
                if (payload.complaintId === id && payload.itemId) {
                    const item = await prisma.item.findUnique({ where: { id: payload.itemId } });

                    // Update item to RECOVERED
                    await prisma.item.update({
                        where: { id: payload.itemId },
                        data: {
                            status: 'RECOVERED',
                            recoveredAt: new Date(),
                            feedbackRating: rating,
                            feedbackComment: comment,
                        }
                    });

                    // Notify founder about successful recovery
                    if (item && item.userId) {
                        const messageText = `The victim has confirmed recovering "${complaint.name}". Thank you for helping!` +
                            (rating ? ` Rating: ${rating}/5` : '') +
                            (comment ? ` Feedback: "${comment}"` : '');

                        await prisma.notification.create({
                            data: {
                                userId: item.userId,
                                title: 'Item Successfully Recovered! 🎉',
                                message: messageText,
                                type: 'ITEM_RECOVERED',
                                payload: JSON.stringify({ complaintId: id, itemId: payload.itemId, rating, comment }),
                            }
                        });

                        // Send Push Notification
                        const founderUser = await prisma.user.findUnique({ where: { id: item.userId } });
                        if (founderUser && founderUser.pushToken) {
                            await sendPushNotification(
                                founderUser.pushToken,
                                'Item Successfully Recovered! 🎉',
                                messageText,
                                { url: `/notifications` }
                            );
                        }
                    }
                    break;
                }
            } catch (e) {
                console.error('Error parsing notification payload', e);
            }
        }

        res.json({ success: true, complaint });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to resolve complaint' });
    }
});

// Notify Owner (Founder -> Victim)
app.post('/api/complaints/:id/notify', authenticateToken, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { questions, description, phone, itemId } = req.body;
        const founderUserId = req.user.id;

        const complaint = await prisma.complaint.findUnique({
            where: { id },
        });

        if (!complaint || !complaint.userId) {
            return res.status(404).json({ error: 'Complaint or owner not found' });
        }

        // Handle Item Linking or Creation
        // Handle Item Linking or Creation
        let finalItemId = itemId;

        // If no confirmed itemId, try to find an existing item for this complaint linkage
        if (!finalItemId) {
            const existingItem = await prisma.item.findFirst({
                where: {
                    userId: founderUserId,
                    linkedComplaintId: id
                }
            });
            if (existingItem) finalItemId = existingItem.id;
        }

        if (!finalItemId) {
            // Create a "Shadow Item" to track this notification
            const newItem = await prisma.item.create({
                data: {
                    name: `Found: ${complaint.name}`,
                    category: complaint.category,
                    location: complaint.location, // Approximate
                    date: new Date().toISOString().split('T')[0],
                    description: description || `Matches complaint: ${complaint.description}`,
                    contactInfo: phone,
                    imageUris: [],
                    userId: founderUserId,
                    status: 'NOTIFIED',
                    linkedComplaintId: id,
                    questions: {
                        create: questions ? questions.map((q: any) => ({
                            question: q.question,
                            answer: q.answer
                        })) : []
                    }
                }
            });
            finalItemId = newItem.id;
        } else {
            // Update existing item status
            await prisma.item.update({
                where: { id: finalItemId },
                data: {
                    status: 'NOTIFIED',
                    linkedComplaintId: id
                }
            });
        }

        // Create or Update notification for the victim
        console.log('Processing notification for user:', complaint.userId, { id, phone });

        const existingNotification = await prisma.notification.findFirst({
            where: {
                userId: complaint.userId,
                type: 'CLAIM_REQUEST',
            }
        });

        // Check if the existing notification is for the same complaint/item
        let notificationToUpdate = null;
        if (existingNotification) {
            const payload = JSON.parse(existingNotification.payload || '{}');
            if (payload.complaintId === id && payload.itemId === finalItemId) {
                notificationToUpdate = existingNotification;
            }
        }

        if (notificationToUpdate) {
            await prisma.notification.update({
                where: { id: notificationToUpdate.id },
                data: {
                    title: 'Item Match Update',
                    message: `The founder has updated their message regarding '${complaint.name}'.`,
                    read: false, // Mark as unread so they see it
                    createdAt: new Date(), // Bump to top
                    payload: JSON.stringify({
                        complaintId: id,
                        founderPhone: phone,
                        questions,
                        description,
                        itemId: finalItemId
                    }),
                }
            });
            console.log('Notification updated');
        } else {
            const notification = await prisma.notification.create({
                data: {
                    userId: complaint.userId,
                    title: 'Someone found your item!',
                    message: `A founder has reached out regarding '${complaint.name}'.`,
                    type: 'CLAIM_REQUEST',
                    payload: JSON.stringify({
                        complaintId: id,
                        founderPhone: phone,
                        questions,
                        description,
                        itemId: finalItemId
                    }),
                },
            });
            console.log('Notification created:', notification);
        }

        // --- ADDED: Send Expo Push Notification to the Victim ---
        const victimUser = await prisma.user.findUnique({ where: { id: complaint.userId } });
        if (victimUser && victimUser.pushToken) {
            await sendPushNotification(
                victimUser.pushToken,
                'Someone found your item! 🎉',
                `A founder has reached out regarding '${complaint.name}'. Open the app to view their message and claim your item.`,
                { url: `/notifications` }
            );
        }

        res.json({ success: true, itemId: finalItemId });
    } catch (error: any) {
        console.error('Error in notify endpoint:', error);
        res.status(500).json({
            error: 'Failed to notify owner',
            details: error.message || String(error)
        });
    }
});

// Claim Item
app.post('/api/items/:id/claim', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        const item = await prisma.item.update({
            where: { id },
            data: {
                status: 'CLAIMED',
                claimedByUserId: userId,
            },
        });
        res.json(item);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to claim item' });
    }
});

// Recover Item (with feedback)
app.post('/api/items/:id/recover', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedbackRating, feedbackComment } = req.body;

        console.log('Recovering item:', id, req.body);
        const item = await prisma.item.update({
            where: { id },
            data: {
                status: 'RECOVERED',
                recoveredAt: new Date(),
                feedbackRating,
                feedbackComment,
            },
        });
        console.log('Item recovered:', item);
        res.json(item);
    } catch (error: any) {
        console.error('Error in recover endpoint:', error);
        res.status(500).json({
            error: 'Failed to recover item',
            details: error.message || String(error),
            meta: error.meta // Prisma specific
        });
    }
});

// ============= ORGANIZATION & COMMUNITY =============

// Create Organization
app.post('/api/orgs', authenticateToken, async (req: any, res: any) => {
    try {
        const { name } = req.body;
        const org = await prisma.organization.create({
            data: { name, creatorId: req.user.id }
        });
        await prisma.organizationAdmin.create({
            data: { organizationId: org.id, userId: req.user.id }
        });
        res.json(org);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get User's Organizations
app.get('/api/users/me/orgs', authenticateToken, async (req: any, res: any) => {
    try {
        const orgs = await prisma.organization.findMany({
            where: { admins: { some: { userId: req.user.id } } },
            include: { communities: true }
        });
        res.json(orgs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Search Communities (public, for join)
app.get('/api/communities/search', authenticateToken, async (req: any, res: any) => {
    try {
        const { q } = req.query;
        const userId: string | undefined = req.user?.id;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const communities = await prisma.community.findMany({
            where: {
                scope: 'PUBLIC',
                ...(q ? { name: { contains: String(q), mode: 'insensitive' } } : {})
            },
            include: {
                organization: true,
                // Count only non-pending members
                _count: { select: { members: { where: { role: { not: 'PENDING' } } } } }
            },
            take: 20
        });

        // Fetch current user's membership for these communities in a separate safe query
        const communityIds = communities.map((c: any) => c.id);
        const myMemberships = await prisma.communityMember.findMany({
            where: {
                communityId: { in: communityIds },
                userId: userId
            }
        });

        // Map result: tag each community with current user's membership status
        const mapped = communities.map((comm: any) => {
            const membership = myMemberships.find((m: any) => m.communityId === comm.id);
            return {
                ...comm,
                myRole: membership ? membership.role : null, // null = not a member
                memberCount: comm._count?.members ?? 0,
            };
        });

        res.json(mapped);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get Community Detail with full member list
app.get('/api/communities/:id', authenticateToken, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const comm = await prisma.community.findUnique({
            where: { id },
            include: {
                organization: true,
                members: {
                    where: { role: { not: 'PENDING' } },
                    include: {
                        user: { select: { id: true, name: true, email: true } }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });
        if (!comm) return res.status(404).json({ error: 'Community not found' });
        // Check if requester is a member (non-pending)
        const isMember = comm.members.some((m: any) => m.userId === req.user.id);
        if (!isMember) return res.status(403).json({ error: 'You are not a member of this community' });
        res.json(comm);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Remove member from community (admin) OR leave community (self)
app.delete('/api/communities/:id/members/:userId', authenticateToken, async (req: any, res: any) => {
    try {
        const { id, userId } = req.params;
        const requesterId = req.user.id;

        const requesterMembership = await prisma.communityMember.findFirst({
            where: { communityId: id, userId: requesterId }
        });

        const isAdmin = requesterMembership?.role === 'ADMIN';
        const isSelf = requesterId === userId;

        if (!isSelf && !isAdmin) {
            return res.status(403).json({ error: 'Only admins can remove other members' });
        }

        // Prevent admin from leaving without transferring ownership
        if (isSelf && isAdmin) {
            const otherMembers = await prisma.communityMember.findMany({
                where: { communityId: id, role: { not: 'PENDING' }, userId: { not: requesterId } }
            });
            if (otherMembers.length > 0) {
                // Promote the oldest other member to admin
                await prisma.communityMember.update({
                    where: { id: otherMembers[0].id },
                    data: { role: 'ADMIN' }
                });
            }
            // If no other members, community will be empty — allow leaving
        }

        await prisma.communityMember.deleteMany({
            where: { communityId: id, userId }
        });

        res.json({ message: isSelf ? 'You have left the community' : 'Member removed' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create Community
app.post('/api/communities', authenticateToken, async (req: any, res: any) => {
    try {
        const { name, description, organizationId, scope } = req.body;
        const communityScope = (scope === 'PRIVATE') ? 'PRIVATE' : 'PUBLIC';
        const comm = await prisma.community.create({
            data: { name, description, organizationId: organizationId || null, creatorId: req.user.id, scope: communityScope }
        });
        await prisma.communityMember.create({
            data: { communityId: comm.id, userId: req.user.id, role: 'ADMIN' }
        });
        res.json(comm);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get User's Communities
app.get('/api/users/me/communities', authenticateToken, async (req: any, res: any) => {
    try {
        const comms = await prisma.community.findMany({
            where: { members: { some: { userId: req.user.id } } },
            include: { organization: true, members: { include: { user: { select: { id: true, name: true, email: true } } } } }
        });
        res.json(comms);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Add Members to Community (Bulk)
app.post('/api/communities/:id/members/bulk', authenticateToken, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const { identifiers } = req.body; // Array of phone numbers

        if (!Array.isArray(identifiers)) {
            return res.status(400).json({ error: "identifiers must be an array" });
        }

        const added: string[] = [];
        const alreadyMembers: string[] = [];
        const notFound: string[] = [];

        for (const phone of identifiers) {
            const cleanPhone = phone.replace(/[^0-9+]/g, '');
            const userToAdd = await prisma.user.findFirst({
                where: { phone: cleanPhone }
            });

            if (!userToAdd) {
                notFound.push(phone);
                continue;
            }

            const existing = await prisma.communityMember.findFirst({
                where: { communityId: id, userId: userToAdd.id }
            });

            if (existing) {
                alreadyMembers.push(phone);
                continue;
            }

            await prisma.communityMember.create({
                data: { communityId: id, userId: userToAdd.id, role: 'MEMBER' }
            });
            added.push(phone);
        }

        res.json({ added, alreadyMembers, notFound });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Join Community Request
app.post('/api/communities/:id/join-request', authenticateToken, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const comm = await prisma.community.findUnique({ where: { id } });
        if (!comm) return res.status(404).json({ error: 'Community not found' });

        const existing = await prisma.communityMember.findFirst({
            where: { communityId: id, userId: req.user.id }
        });
        if (existing) return res.status(400).json({ error: 'Already a member or request pending' });

        const member = await prisma.communityMember.create({
            data: { communityId: id, userId: req.user.id, role: 'PENDING' }
        });

        // Notify the community admin
        const admin = await prisma.communityMember.findFirst({
            where: { communityId: id, role: 'ADMIN' },
            include: { user: true }
        });
        if (admin?.user) {
            await prisma.notification.create({
                data: {
                    userId: admin.user.id,
                    title: 'New Join Request',
                    message: `${req.user.name || req.user.email} wants to join your community "${comm.name}"`,
                    type: 'AREA_ALERT',
                    payload: JSON.stringify({ communityId: id, requestUserId: req.user.id })
                }
            });
        }
        res.json({ message: 'Join request sent', member });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Accept/Reject Join Request
app.patch('/api/communities/:id/members/:userId', authenticateToken, async (req: any, res: any) => {
    try {
        const { id, userId } = req.params;
        const { action } = req.body; // 'ACCEPT' or 'REJECT'

        // Check requester is admin
        const isAdmin = await prisma.communityMember.findFirst({
            where: { communityId: id, userId: req.user.id, role: 'ADMIN' }
        });
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can approve requests' });

        if (action === 'ACCEPT') {
            await prisma.communityMember.updateMany({
                where: { communityId: id, userId },
                data: { role: 'MEMBER' }
            });
            res.json({ message: 'Member accepted' });
        } else {
            await prisma.communityMember.deleteMany({
                where: { communityId: id, userId }
            });
            res.json({ message: 'Request rejected' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// Add Community to Organization
app.patch('/api/orgs/:orgId/communities/:commId', authenticateToken, async (req: any, res: any) => {
    try {
        const { orgId, commId } = req.params;
        // Check requester is org admin
        const isAdmin = await prisma.organizationAdmin.findFirst({
            where: { organizationId: orgId, userId: req.user.id }
        });
        if (!isAdmin) return res.status(403).json({ error: 'Only org admins can add communities' });

        const comm = await prisma.community.update({
            where: { id: commId },
            data: { organizationId: orgId }
        });
        res.json(comm);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Get pending join requests for communities I admin
app.get('/api/users/me/pending-requests', authenticateToken, async (req: any, res: any) => {
    try {
        const adminOf = await prisma.communityMember.findMany({
            where: { userId: req.user.id, role: 'ADMIN' }
        });
        const communityIds = adminOf.map((m: any) => m.communityId);
        const pending = await prisma.communityMember.findMany({
            where: { communityId: { in: communityIds }, role: 'PENDING' },
            include: { user: { select: { id: true, name: true, email: true } }, community: true }
        });
        res.json(pending);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Start server after all routes are registered
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

