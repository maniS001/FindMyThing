// Backend v2.3 - WebRTC Signaling, In-App Chat, Push Notifications, AI Validation
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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
const httpServer = http.createServer(app);
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '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';

// ====== WebSocket Signaling Server ======
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Map userId -> Set of active WebSocket clients (supports multiple tabs / mobile reconnection)
const wsClients = new Map<string, Set<WebSocket>>();

// In-memory ICE candidate buffer per conversation/call so offline receivers answering via push get ICE candidates
const pendingCallIceMap = new Map<string, any[]>();

const wsBroadcastToUser = (userId: string, payload: object) => {
    const clients = wsClients.get(userId);
    if (clients) {
        const json = JSON.stringify(payload);
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                try { client.send(json); } catch {}
            }
        }
    }
};

wss.on('connection', (ws) => {
    let authenticatedUserId: string | null = null;

    ws.on('message', async (rawData) => {
        try {
            const msg = JSON.parse(rawData.toString());

            // PING / HEARTBEAT
            if (msg.type === 'PING') {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'PONG' }));
                }
                return;
            }

            // AUTH: client sends JWT token to identify itself
            if (msg.type === 'AUTH') {
                try {
                    const decoded: any = jwt.verify(msg.token, JWT_SECRET);
                    authenticatedUserId = decoded.id;
                    if (!wsClients.has(authenticatedUserId!)) {
                        wsClients.set(authenticatedUserId!, new Set());
                    }
                    wsClients.get(authenticatedUserId!)!.add(ws);
                    ws.send(JSON.stringify({ type: 'AUTH_OK' }));
                    console.log(`[WS] User ${authenticatedUserId} connected (active sockets: ${wsClients.get(authenticatedUserId!)!.size})`);
                } catch {
                    ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid token' }));
                }
                return;
            }

            if (!authenticatedUserId) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Not authenticated' }));
                return;
            }

            const { type, conversationId, content, sdp, candidate } = msg;

            // Verify sender belongs to this conversation
            const conversation = await prisma.conversation.findFirst({
                where: {
                    id: conversationId,
                    OR: [{ initiatorId: authenticatedUserId }, { recipientId: authenticatedUserId }]
                }
            });
            if (!conversation) return;

            const otherUserId = conversation.initiatorId === authenticatedUserId
                ? conversation.recipientId
                : conversation.initiatorId;

            const senderUser = await prisma.user.findUnique({ where: { id: authenticatedUserId } });

            if (type === 'CHAT_MESSAGE') {
                // Persist message to DB
                const message = await prisma.message.create({
                    data: { content, conversationId, senderId: authenticatedUserId! }
                });
                // Update conversation timestamp
                await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

                const recipientSockets = wsClients.get(otherUserId);
                const hasOpenSocket = recipientSockets && Array.from(recipientSockets).some(s => s.readyState === WebSocket.OPEN);

                const payload = {
                    type: 'CHAT_MESSAGE',
                    conversationId,
                    messageId: message.id,
                    content,
                    senderId: authenticatedUserId,
                    senderName: senderUser?.name,
                    createdAt: message.createdAt,
                    delivered: !!hasOpenSocket,
                    read: false
                };

                // Send to sender (with delivered status if recipient has active socket)
                ws.send(JSON.stringify(payload));
                // Send to receiver
                wsBroadcastToUser(otherUserId, payload);

                // Create persistent in-app notification in DB for recipient
                try {
                    await prisma.notification.create({
                        data: {
                            userId: otherUserId,
                            title: `New message from ${senderUser?.name || 'Someone'}`,
                            message: content.length > 80 ? content.slice(0, 77) + '...' : content,
                            type: 'CHAT_MESSAGE',
                            payload: JSON.stringify({
                                conversationId,
                                senderId: authenticatedUserId,
                                senderName: senderUser?.name
                            })
                        }
                    });
                } catch (notifErr) {
                    console.error('[Chat notification error]', notifErr);
                }

                // Always send Expo Push Notification so mobile notification drawer displays it
                try {
                    const recipient = await prisma.user.findUnique({ where: { id: otherUserId } });
                    if (recipient) {
                        await sendPushToUser(
                            recipient,
                            `New message from ${senderUser?.name || 'Someone'}`,
                            content.length > 100 ? content.slice(0, 97) + '...' : content,
                            { url: `/chat/${conversationId}`, type: 'CHAT_MESSAGE', conversationId }
                        );
                    }
                } catch (pushErr) {
                    console.error('[Message push notification error]', pushErr);
                }

            } else if (type === 'MESSAGE_DELIVERED') {
                wsBroadcastToUser(otherUserId, {
                    type: 'MESSAGE_DELIVERED',
                    conversationId,
                    messageId: msg.messageId
                });

            } else if (type === 'MESSAGE_READ') {
                await prisma.message.updateMany({
                    where: { conversationId, senderId: otherUserId, read: false },
                    data: { read: true }
                });
                wsBroadcastToUser(otherUserId, {
                    type: 'MESSAGES_READ',
                    conversationId,
                    readBy: authenticatedUserId
                });

            } else if (type === 'CALL_OFFER') {
                // End any previous pending calls for this conversation so re-calls work seamlessly
                await prisma.callRequest.updateMany({
                    where: { conversationId, status: 'PENDING' },
                    data: { status: 'ENDED', endedAt: new Date() }
                });
                pendingCallIceMap.delete(conversationId);

                // Create a call record storing the WebRTC offer SDP for offline/closed notification answer
                const callReq = await prisma.callRequest.create({
                    data: {
                        conversationId,
                        initiatorId: authenticatedUserId!,
                        recipientId: otherUserId,
                        status: 'PENDING',
                        sdp: sdp ? JSON.stringify(sdp) : null,
                        iceCandidates: '[]',
                    }
                });

                const callerName = senderUser?.name || 'Someone';

                // Broadcast to all active sockets of the recipient
                wsBroadcastToUser(otherUserId, {
                    type: 'CALL_INCOMING',
                    conversationId,
                    callRequestId: callReq.id,
                    sdp,
                    senderName: callerName,
                    senderId: authenticatedUserId
                });

                // Create persistent in-app notification in DB
                try {
                    await prisma.notification.create({
                        data: {
                            userId: otherUserId,
                            title: `Call from ${callerName}`,
                            message: `Incoming call regarding your item. Tap to open.`,
                            type: 'INCOMING_CALL',
                            payload: JSON.stringify({ conversationId, senderId: authenticatedUserId, callRequestId: callReq.id })
                        }
                    });
                } catch {}

                // High-priority Push Notification with common ringtone channel for background / closed app users
                try {
                    const recipient = await prisma.user.findUnique({ where: { id: otherUserId } });
                    if (recipient) {
                        const callUrl = `/call/${conversationId}?otherName=${encodeURIComponent(callerName)}&isInitiator=false&callRequestId=${encodeURIComponent(callReq.id)}`;
                        await sendPushToUser(
                            recipient,
                            `📞 Incoming call from ${callerName}`,
                            'Tap to answer your FindMyThing call',
                            {
                                url: callUrl,
                                type: 'INCOMING_CALL',
                                conversationId,
                                callRequestId: callReq.id,
                                senderName: callerName,
                            },
                            { channelId: 'calls', sound: 'ringtone.wav', categoryId: 'incoming_call' }
                        );
                    }
                } catch (callPushErr) {
                    console.error('[Call push notification error]', callPushErr);
                }

            } else if (type === 'CALL_ANSWER') {
                await prisma.callRequest.updateMany({
                    where: { conversationId, recipientId: authenticatedUserId, status: 'PENDING' },
                    data: { status: 'ACCEPTED' }
                });
                wsBroadcastToUser(otherUserId, { type: 'CALL_ANSWER', conversationId, sdp, senderId: authenticatedUserId });

            } else if (type === 'ICE_CANDIDATE') {
                if (candidate) {
                    const list = pendingCallIceMap.get(conversationId) || [];
                    if (list.length < 50) {
                        list.push(candidate);
                        pendingCallIceMap.set(conversationId, list);
                    }
                }
                wsBroadcastToUser(otherUserId, { type: 'ICE_CANDIDATE', conversationId, candidate, senderId: authenticatedUserId });

            } else if (type === 'CALL_ENDED') {
                pendingCallIceMap.delete(conversationId);
                await prisma.callRequest.updateMany({ where: { conversationId, status: { in: ['PENDING', 'ACCEPTED'] } }, data: { status: 'ENDED', endedAt: new Date() } });
                wsBroadcastToUser(otherUserId, { type: 'CALL_ENDED', conversationId });

            } else if (type === 'CALL_REJECTED') {
                pendingCallIceMap.delete(conversationId);
                await prisma.callRequest.updateMany({ where: { conversationId, recipientId: authenticatedUserId, status: 'PENDING' }, data: { status: 'REJECTED', endedAt: new Date() } });
                wsBroadcastToUser(otherUserId, { type: 'CALL_REJECTED', conversationId });
            }

        } catch (err: any) {
            console.error('[WS] Error:', err);
        }
    });

    ws.on('close', () => {
        if (authenticatedUserId && wsClients.has(authenticatedUserId)) {
            const set = wsClients.get(authenticatedUserId)!;
            set.delete(ws);
            if (set.size === 0) {
                wsClients.delete(authenticatedUserId);
            }
            console.log(`[WS] User ${authenticatedUserId} socket closed (remaining: ${set.size})`);
        }
    });
});

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

// Health Check Endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'FindMyThing Backend', time: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'FindMyThing Backend', time: new Date() }));

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

function isValidExpoPushToken(token?: string | null): token is string {
    if (!token || typeof token !== 'string') return false;
    return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

interface PushOptions {
    channelId?: string;
    sound?: string;
    categoryId?: string;
}

// Helper function to send push notification via Expo with full response error checks
async function sendPushNotification(pushToken: string, title: string, body: string, data?: any, options?: PushOptions): Promise<boolean> {
    if (!isValidExpoPushToken(pushToken)) {
        console.warn(`[Push] Skipped invalid Expo push token: ${String(pushToken).substring(0, 25)}`);
        return false;
    }

    const message: any = {
        to: pushToken,
        sound: options?.sound || 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: options?.channelId || 'default',
        _displayInForeground: true,
    };
    if (options?.categoryId) {
        message.categoryId = options.categoryId;
    }

    try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        const json: any = await res.json().catch(() => null);
        const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
        if (ticket?.status === 'error') {
            console.error(`[Push] Expo push error for ${pushToken.substring(0, 24)}...:`, ticket.message, ticket.details);
            return false;
        }
        console.log(`[Push] Sent "${title}" to ${pushToken.substring(0, 24)}... (id: ${ticket?.id || 'ok'})`);
        return true;
    } catch (error) {
        console.error('[Push] Network error sending push notification:', error);
        return false;
    }
}

// Send push notification across all registered app tokens of a user
async function sendPushToUser(user: any, title: string, body: string, data?: any, options?: PushOptions): Promise<void> {
    if (!user) return;
    const tokenSet = new Set<string>();
    if (isValidExpoPushToken(user.pushToken)) tokenSet.add(user.pushToken);
    if (Array.isArray(user.pushTokens)) {
        for (const t of user.pushTokens) {
            if (isValidExpoPushToken(t)) tokenSet.add(t);
        }
    }
    if (tokenSet.size === 0) return;

    await Promise.allSettled(
        Array.from(tokenSet).map(token => sendPushNotification(token, title, body, data, options))
    );
}

function getGoogleMapsKey(): string {
    return (
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        'AIzaSyBfBd_6W9AndpyPJW0gPsBUvlyiG21UWjc'
    );
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

const getGeminiModel = (modelIndex = 0, jsonMode = true) => {
    if (!geminiClient) throw new Error('GEMINI_API_KEY not configured');
    const modelName = GEMINI_MODELS[modelIndex] || GEMINI_MODELS[0];
    return geminiClient.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: jsonMode ? "application/json" : "text/plain",
        },
        systemInstruction: jsonMode
            ? `You are the dedicated AI Agent for FindMyThing, a modern Lost & Found application.
Your primary goals are to:
1. Ensure all lost and found item reports are logically consistent, genuine, and high quality.
2. Strictly protect user privacy by blocking any attempts to share phone numbers, emails, or social media handles in public descriptions.
3. Prevent fraud by carefully analyzing the context of claims and security questions.
Always respond exactly in the requested JSON format without markdown formatting.`
            : `You are FindBot, a helpful, empathetic customer support assistant for the FindMyThing lost-and-found app.
Always reply in clean, friendly, plain conversational text using numbered steps or bullet points (•).
NEVER output JSON, curly braces, or code blocks.`
    });
};

// ============= AI Validation Endpoints =============

// Robust Gemini call — tries each model in fallback order
async function callGemini(prompt: string, jsonMode = true): Promise<string> {
    if (!geminiClient) throw new Error('GEMINI_API_KEY not configured');
    let lastErr: any;
    for (let i = 0; i < GEMINI_MODELS.length; i++) {
        try {
            const model = getGeminiModel(i, jsonMode);
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
3. Do NOT use phrases like "reported", "please contact", "FindMyThing", "contact support".
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

// ============= AI Support Assistant Endpoint =============

function getFallbackSupportResponse(query: string): string {
    const q = (query || '').toLowerCase();

    if (q.includes('wallet') || q.includes('purse') || q.includes('card') || q.includes('atm') || q.includes('credit') || q.includes('debit')) {
        return `🚨 Immediate Steps for Lost Wallet/Cards:
1. Block All Cards Immediately: Open your bank mobile apps or call customer care to block your debit/credit cards right now to prevent fraudulent transactions.
2. File a Lost Report (NCR): Visit your local police station or state police citizen portal to lodge a lost report for documents (PAN, Aadhaar, Driving License, Voter ID). This protects you from identity theft.
3. Post a Report on FindMyThing: Go to "Report Lost Item" -> Choose "Wallet / Purse". Mark the exact location and approximate time. Mention brand, color, but DO NOT publicly disclose full card numbers or sensitive credentials.
4. Keep Checking Notifications: If an honest finder spots it, our AI smart matching will alert you instantly.`;
    }

    if (q.includes('phone') || q.includes('mobile') || q.includes('iphone') || q.includes('android')) {
        return `🚨 Immediate Steps for Lost Mobile Phone:
1. Track / Mark as Lost:
   - Android: Visit google.com/android/find to locate, ring, secure, or erase the device.
   - iPhone: Visit icloud.com/find and mark the device as "Lost Mode".
2. Block SIM Card: Contact your telecom provider (Airtel/Jio/Vi/BSNL) to block your SIM so no one can intercept incoming OTPs or reset passwords.
3. Block IMEI on CEIR Portal: Visit ceir.gov.in to block your phone's IMEI across all Indian telecom networks so it cannot be reused.
4. Post on FindMyThing: Submit a Lost Report with model, color, and unique case details.
5. Watch out for scams: Never share your lock-screen passcode, Apple ID, or Google password with anyone claiming to have your phone.`;
    }

    if (q.includes('verify') || q.includes('ownership') || q.includes('proof') || q.includes('claim')) {
        return `🛡️ How to Verify Item Ownership:
1. Secret Verification Questions: When reporting a found item, keep private details hidden (e.g., serial number, wallpaper, contents inside pockets). Ask the claimant to describe these specific secret details.
2. Cross-Check Proof: Request a purchase invoice, serial number match, photo of the owner with the item, or ID verification.
3. Never release the item without mutual verification!
4. Use QR Handover: The owner must generate the handover QR code from within FindMyThing, and the founder scans it to confirm the exchange.`;
    }

    if (q.includes('qr') || q.includes('handover') || q.includes('return')) {
        return `🤝 How the Secure QR Handover Works:
1. Once both parties agree to meet after verification, the Owner opens the claim in FindMyThing and taps "Generate Handover QR Code".
2. The Finder taps "Scan Handover QR Code" using the in-app scanner.
3. Once scanned, the system registers the secure digital handshake, immediately updating the status to "Resolved" and releasing any pledged reward acknowledgment.
4. Always conduct the handover in a well-lit, public location (such as a metro station, coffee shop, or police station).`;
    }

    if (q.includes('call') || q.includes('audio') || q.includes('mic') || q.includes('hear')) {
        return `📞 Troubleshooting In-App Audio Calls:
1. Microphone Permission: Make sure your browser or phone has granted microphone permission to FindMyThing.
2. Audio Controls: You can toggle Mute and Speaker directly from the call screen or ringing screen.
3. Network Stability: WebRTC voice calls require an active internet connection (Wi-Fi or 4G/5G).
4. If Call Fails to Connect: Try hanging up and calling again, or send a direct in-app message in the chat screen to coordinate.`;
    }

    if (q.includes('money') || q.includes('ransom') || q.includes('charge') || q.includes('fee') || q.includes('pay') || q.includes('scam') || q.includes('fraud')) {
        return `⚠️ CRITICAL SAFETY ALERT — Beware of Scams:
1. DO NOT SEND ADVANCE MONEY: Never pay any upfront courier charges, delivery fees, or "reward deposits" before seeing and verifying your item in person.
2. Legitimate finders will gladly meet in a public location or hand the item over to a local police station or lost-and-found desk.
3. If anyone threatens you or demands unreasonable payments, block them and report the user immediately via FindMyThing support or your local police.`;
    }

    if (q.includes('message') || q.includes('chat') || q.includes('tick')) {
        return `💬 In-App Chat Status Guide:
- Single Tick (✓): Message sent from your device to the server.
- Double Grey Ticks (✓✓): Message successfully delivered to the recipient's phone.
- Double Blue Ticks (✓✓): Recipient has opened and read your message.
- If the other person is not replying, their phone might be offline or silent. Check back in a little while or try the in-app audio call button.`;
    }

    if (q.includes('safe') || q.includes('meet') || q.includes('location')) {
        return `💡 Safe Handover Guidelines:
1. Meet in Broad Daylight: Choose busy, well-lit public spots such as metro/train stations, shopping malls, university desks, or near police stations.
2. Never Meet in Secluded Areas: Never meet alone at late night or invite strangers to private residences.
3. Bring a Friend: Whenever possible, bring a friend or family member along for the handover.
4. Verify First, Return Second: Complete the digital QR verification handshake on the spot.`;
    }

    return `👋 I am FindBot, your FindMyThing assistant!
Here is how I can assist you:
- Report a Lost Item: Tap "Report Lost Item" on the home screen to submit item details and location.
- Report a Found Item: Tap "Report Found Item" to upload photos and assist the owner.
- AI Smart Matching: Our AI automatically pairs lost reports with found reports and notifies you.
- Safe Communication: Chat or call anonymously inside the app without revealing your personal phone number.
- Need urgent advice? Ask me about: "Lost wallet", "Lost phone", "How to verify ownership", "Secure QR handover", or "Safety tips".`;
}

function formatPlainSupportReply(raw: string): string {
    const trimmed = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (trimmed.startsWith('{')) {
        try {
            const parsed: any = JSON.parse(trimmed);
            const parts: string[] = [];
            const root = parsed.response || parsed;
            const mainText = root.text || root.message || root.reply || root.answer;
            if (typeof mainText === 'string' && mainText.trim()) parts.push(mainText.trim());
            const items = root.actions || root.steps || root.bullets || [];
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (typeof item === 'string' && item.trim()) parts.push(`• ${item.trim()}`);
                    else if (item && typeof item === 'object' && (item.text || item.label || item.description)) {
                        parts.push(`• ${String(item.text || item.label || item.description).trim()}`);
                    }
                }
            }
            if (parts.length > 0) return parts.join('\n\n');
        } catch {}
    }
    return trimmed;
}

app.post('/api/ai/support-assistant', async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }

        const prompt = `You are "FindBot", the official AI Support & Safety Assistant for "FindMyThing", an AI-powered lost and found recovery network.
Your mission is to provide clear, reassuring, empathetic, and actionable guidance to users.

CONTEXT ABOUT FINDMYTHING:
- Core Capabilities:
  1. "Report Lost Item" (Victim): Submit category, title, description, location, photos, optional reward, and secret verification questions.
  2. "Report Found Item" (Founder): Honest finders report discovered items with location and photos. Sensitive details (serial numbers, cash amount, inside marks) are kept hidden as proof challenges.
  3. "Smart AI Matching": Automatically matches lost complaints with found reports using AI semantic comparison and geo-proximity, sending instant push notifications.
  4. "In-App Chat & Voice Calls": Real-time chat with delivery receipts (Single tick = Sent, Double tick = Delivered, Blue = Read). Anonymous WebRTC voice calls without revealing phone numbers, with mute and speaker toggles.
  5. "Ownership Verification": Claimant answers secret questions or provides proof (receipt, unique mark, photo) before handover.
  6. "Secure QR Handover": Owner generates claim QR code in the app; founder scans it upon meeting to digitally confirm item return and resolve the claim.
  7. "Communities & Local Alerts": College campuses, offices, residential areas with localized lost-and-found boards.

INSTRUCTION RULES:
- If user asks about lost wallet/cards/phone/IDs: Give urgent, prioritized security actions first (blocking cards/SIM/CEIR, filing police NCR report) before app reporting steps.
- If user mentions ransom, upfront payment, courier fees, or scams: Warn them strongly NEVER to pay advance money or share OTPs/passwords.
- If user has technical issues (calls, notifications, QR scan, chat ticks): Explain the exact technical remedy clearly.
- Keep responses friendly, structured with bullet points, concise, and focused on resolution.

User Question: "${message}"
${history && history.length ? 'Recent Context:\n' + JSON.stringify(history.slice(-4)) : ''}

Respond directly:`;

        let reply;
        try {
            reply = await callGemini(prompt, false);
            reply = formatPlainSupportReply(reply);
        } catch (aiErr: any) {
            console.warn('Gemini support bot call failed, falling back to rule-based assistant:', aiErr.message);
            reply = getFallbackSupportResponse(message);
        }

        res.json({ reply });
    } catch (err) {
        console.error('Support assistant error:', err);
        res.json({ reply: getFallbackSupportResponse(req.body?.message || '') });
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
            // User exists, update location/push token only with valid non-null values (never overwrite valid pushToken with null)
            try {
                const updateData: any = {};
                if (location) updateData.location = location;
                if (typeof latitude === 'number' && typeof longitude === 'number') {
                    updateData.latitude = latitude;
                    updateData.longitude = longitude;
                }
                if (isValidExpoPushToken(pushToken)) {
                    updateData.pushToken = pushToken;
                    const merged = Array.from(new Set([pushToken, ...(user.pushTokens || [])])).slice(0, 5);
                    updateData.pushTokens = merged;
                }
                if (Object.keys(updateData).length > 0) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: updateData
                    });
                }
            } catch (ignore) {
                console.warn('Could not update user location/push token on login:', ignore);
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

// Update Push Token and/or Location (supports updating location on Web without a pushToken)
app.post('/api/auth/update-push-token', authenticateToken, async (req: any, res: any) => {
    try {
        const { pushToken, latitude, longitude } = req.body;
        const userId = req.user.id;
        const hasValidToken = isValidExpoPushToken(pushToken);
        const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';

        if (!hasValidToken && !hasCoords) {
            return res.status(400).json({ error: 'Valid pushToken or latitude/longitude coordinates required' });
        }

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });
        const updateData: any = {};
        if (hasValidToken) {
            updateData.pushToken = pushToken;
            const existingList = existingUser?.pushTokens || [];
            updateData.pushTokens = Array.from(new Set([pushToken, ...existingList])).slice(0, 5);
        }
        if (hasCoords) {
            updateData.latitude = latitude;
            updateData.longitude = longitude;
        }

        await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });
        res.json({ message: 'Push token and location updated successfully' });
    } catch (error) {
        console.error('Error updating push token:', error);
        res.status(500).json({ error: 'Failed to update push token' });
    }
});

// Delete user account cleanly
app.delete('/api/auth/account', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        await prisma.notification.deleteMany({ where: { userId } });
        await prisma.message.deleteMany({ where: { senderId: userId } });
        await prisma.callRequest.deleteMany({ where: { OR: [{ initiatorId: userId }, { recipientId: userId }] } });
        await prisma.communityMember.deleteMany({ where: { userId } });
        await prisma.organizationAdmin.deleteMany({ where: { userId } });
        await prisma.complaint.deleteMany({ where: { userId } });
        const userItems = await prisma.item.findMany({ where: { userId }, select: { id: true } });
        const itemIds = userItems.map(i => i.id);
        if (itemIds.length > 0) {
            await prisma.question.deleteMany({ where: { itemId: { in: itemIds } } });
            await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
        }
        await prisma.user.delete({ where: { id: userId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// ============= Google Maps & Places Proxy Endpoints (with OSM/Overpass Fallback) =============

app.get('/api/places/autocomplete', async (req, res) => {
    const input = String(req.query.input || '').trim();
    const lat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    const lng = req.query.lng ? parseFloat(String(req.query.lng)) : undefined;
    if (input.length < 2) return res.json({ results: [] });

    const key = getGoogleMapsKey();
    try {
        let gUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${encodeURIComponent(key)}`;
        if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
            gUrl += `&location=${lat},${lng}&radius=50000`;
        }
        const gRes = await fetch(gUrl);
        if (gRes.ok) {
            const gData: any = await gRes.json();
            if (gData.status === 'OK' && Array.isArray(gData.predictions)) {
                const results = gData.predictions.map((p: any) => ({
                    place_id: p.place_id,
                    googlePlaceId: p.place_id,
                    display_name: p.description,
                    main_text: p.structured_formatting?.main_text || p.description,
                    secondary_text: p.structured_formatting?.secondary_text || '',
                    source: 'google',
                }));
                return res.json({ results, provider: 'google' });
            }
            if (gData.status === 'ZERO_RESULTS') {
                return res.json({ results: [], provider: 'google' });
            }
            console.warn('[Places Autocomplete] Google status:', gData.status, gData.error_message || '');
        }
    } catch (err: any) {
        console.warn('[Places Autocomplete] Google error:', err.message);
    }

    // Fallback to Photon + Nominatim
    const combined: any[] = [];
    try {
        let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(input)}&limit=10`;
        if (lat !== undefined && lng !== undefined) photonUrl += `&lat=${lat}&lon=${lng}`;
        const pRes = await fetch(photonUrl, { headers: { 'User-Agent': 'FindMyThingApp/1.0' } });
        if (pRes.ok) {
            const pData: any = await pRes.json();
            for (const f of (pData.features || [])) {
                const p = f.properties || {};
                const c = f.geometry?.coordinates || [0, 0];
                const name = p.name || p.street || input;
                const display = [name, p.city || p.district || p.state].filter(Boolean).join(', ');
                combined.push({
                    place_id: `photon-${c[1]}-${c[0]}`,
                    display_name: display,
                    lat: String(c[1]),
                    lon: String(c[0]),
                    distanceKm: (lat !== undefined && lng !== undefined) ? calculateDistance(lat, lng, c[1], c[0]) : undefined,
                    source: 'osm',
                });
            }
        }
    } catch {}
    try {
        let nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=8`;
        if (lat !== undefined && lng !== undefined) {
            const delta = 0.5;
            nomUrl += `&viewbox=${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;
        }
        const nRes = await fetch(nomUrl, { headers: { 'User-Agent': 'FindMyThingApp/1.0' } });
        if (nRes.ok) {
            const nData: any = await nRes.json();
            if (Array.isArray(nData)) {
                for (const item of nData) {
                    const itemLat = parseFloat(item.lat);
                    const itemLon = parseFloat(item.lon);
                    combined.push({
                        place_id: String(item.place_id),
                        display_name: item.display_name,
                        lat: item.lat,
                        lon: item.lon,
                        distanceKm: (lat !== undefined && lng !== undefined) ? calculateDistance(lat, lng, itemLat, itemLon) : undefined,
                        source: 'osm',
                    });
                }
            }
        }
    } catch {}
    res.json({ results: combined, provider: 'osm' });
});

app.get('/api/places/details', async (req, res) => {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'placeId required' });

    const key = getGoogleMapsKey();
    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${encodeURIComponent(key)}`;
        const gRes = await fetch(url);
        if (gRes.ok) {
            const gData: any = await gRes.json();
            if (gData.status === 'OK' && gData.result?.geometry?.location) {
                const r = gData.result;
                return res.json({
                    name: r.name,
                    display_name: r.name && !r.formatted_address?.startsWith(r.name)
                        ? `${r.name}, ${r.formatted_address}`
                        : (r.formatted_address || r.name),
                    lat: r.geometry.location.lat,
                    lon: r.geometry.location.lng,
                });
            }
        }
    } catch {}
    res.status(404).json({ error: 'Place details unavailable' });
});

app.get('/api/places/nearby', async (req, res) => {
    const lat = parseFloat(String(req.query.lat || ''));
    const lng = parseFloat(String(req.query.lng || ''));
    if (isNaN(lat) || isNaN(lng)) return res.json({ results: [] });

    const key = getGoogleMapsKey();
    try {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&key=${encodeURIComponent(key)}`;
        const gRes = await fetch(url);
        if (gRes.ok) {
            const gData: any = await gRes.json();
            if (gData.status === 'OK' && Array.isArray(gData.results)) {
                const results = gData.results.slice(0, 15).map((p: any) => {
                    const pLat = p.geometry?.location?.lat;
                    const pLon = p.geometry?.location?.lng;
                    const display = [p.name, p.vicinity].filter(Boolean).join(', ');
                    return {
                        place_id: p.place_id,
                        display_name: display,
                        lat: String(pLat),
                        lon: String(pLon),
                        distanceKm: (pLat && pLon) ? calculateDistance(lat, lng, pLat, pLon) : 0,
                        source: 'google',
                    };
                });
                return res.json({ results, provider: 'google' });
            }
        }
    } catch {}

    // Fallback: OpenStreetMap Overpass API nearby named POIs within 1.5 km
    try {
        const overpassQuery = `[out:json][timeout:6];(node(around:1500,${lat},${lng})[name];way(around:1500,${lat},${lng})[name]["amenity"];way(around:1500,${lat},${lng})[name]["shop"];way(around:1500,${lat},${lng})[name]["building"];);out center 20;`;
        const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(overpassQuery)}`,
        });
        if (ovRes.ok) {
            const ovData: any = await ovRes.json();
            const pois = (ovData.elements || [])
                .map((el: any) => {
                    const elLat = el.lat || el.center?.lat;
                    const elLon = el.lon || el.center?.lon;
                    const name = el.tags?.name;
                    if (!elLat || !elLon || !name) return null;
                    const extra = el.tags?.['addr:street'] || el.tags?.['addr:suburb'] || el.tags?.amenity || el.tags?.shop || '';
                    return {
                        place_id: `ov-${el.id}`,
                        display_name: extra ? `${name}, ${extra}` : name,
                        lat: String(elLat),
                        lon: String(elLon),
                        distanceKm: calculateDistance(lat, lng, elLat, elLon),
                        source: 'overpass',
                    };
                })
                .filter(Boolean)
                .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
                .slice(0, 15);
            return res.json({ results: pois, provider: 'overpass' });
        }
    } catch {}

    res.json({ results: [] });
});

app.get('/api/places/geocode', async (req, res) => {
    const lat = parseFloat(String(req.query.lat || ''));
    const lng = parseFloat(String(req.query.lng || ''));
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

    const key = getGoogleMapsKey();
    try {
        const [geoRes, nearbyRes] = await Promise.all([
            fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`),
            fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&key=${encodeURIComponent(key)}`)
        ]);
        let landmark = '';
        if (nearbyRes.ok) {
            const nData: any = await nearbyRes.json();
            if (nData.status === 'OK' && nData.results?.length > 0) {
                const top = nData.results[0];
                const dKm = calculateDistance(lat, lng, top.geometry.location.lat, top.geometry.location.lng);
                if (dKm <= 0.15 && top.name) {
                    landmark = top.name;
                }
            }
        }
        if (geoRes.ok) {
            const gData: any = await geoRes.json();
            if (gData.status === 'OK' && gData.results?.length > 0) {
                const formatted = gData.results[0].formatted_address;
                const address = landmark && !formatted.toLowerCase().includes(landmark.toLowerCase())
                    ? `${landmark}, ${formatted}`
                    : formatted;
                return res.json({ address, provider: 'google' });
            }
        }
    } catch {}

    // Fallback to OpenStreetMap Nominatim zoom=18
    try {
        const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' } }
        );
        if (nomRes.ok) {
            const data: any = await nomRes.json();
            if (data?.address) {
                const a = data.address;
                const parts = [
                    data.name || a.amenity || a.building || a.shop || a.place,
                    a.road || a.street,
                    a.suburb || a.village || a.neighbourhood,
                    a.town || a.city || a.county,
                    a.state_district || a.district,
                    a.postcode
                ].filter(Boolean);
                const uniq: string[] = [];
                for (const p of parts) { if (!uniq.includes(p)) uniq.push(p); }
                if (uniq.length >= 2) return res.json({ address: uniq.join(', '), provider: 'osm' });
                if (data.display_name) return res.json({ address: data.display_name, provider: 'osm' });
            }
        }
    } catch {}
    res.json({ address: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, provider: 'coords' });
});

// ============= Call State Recovery Endpoints (for Background / Closed App Notification Answering) =============

app.get('/api/calls/pending', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const cutoff = new Date(Date.now() - 75 * 1000); // Active ringing calls within 75s
        const call = await prisma.callRequest.findFirst({
            where: {
                recipientId: userId,
                status: 'PENDING',
                createdAt: { gte: cutoff },
            },
            orderBy: { createdAt: 'desc' },
            include: { initiator: { select: { id: true, name: true } } },
        });
        if (!call) return res.json({ call: null });

        let parsedSdp = null;
        try { parsedSdp = call.sdp ? JSON.parse(call.sdp) : null; } catch {}
        const iceCandidates = pendingCallIceMap.get(call.conversationId) || [];

        res.json({
            call: {
                callRequestId: call.id,
                conversationId: call.conversationId,
                senderId: call.initiatorId,
                senderName: call.initiator?.name || 'Unknown',
                sdp: parsedSdp,
                iceCandidates,
                createdAt: call.createdAt,
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/calls/conversation/:conversationId/pending', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const cutoff = new Date(Date.now() - 120 * 1000);
        const call = await prisma.callRequest.findFirst({
            where: {
                conversationId,
                recipientId: userId,
                status: 'PENDING',
                createdAt: { gte: cutoff },
            },
            orderBy: { createdAt: 'desc' },
            include: { initiator: { select: { id: true, name: true } } },
        });
        if (!call) return res.json({ call: null });

        let parsedSdp = null;
        try { parsedSdp = call.sdp ? JSON.parse(call.sdp) : null; } catch {}
        const iceCandidates = pendingCallIceMap.get(conversationId) || [];

        res.json({
            call: {
                callRequestId: call.id,
                conversationId: call.conversationId,
                senderId: call.initiatorId,
                senderName: call.initiator?.name || 'Unknown',
                sdp: parsedSdp,
                iceCandidates,
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/calls/:id/reject', authenticateToken, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const call = await prisma.callRequest.findUnique({ where: { id } });
        if (!call) return res.status(404).json({ error: 'Call not found' });
        await prisma.callRequest.update({
            where: { id },
            data: { status: 'REJECTED', endedAt: new Date() }
        });
        pendingCallIceMap.delete(call.conversationId);
        wsBroadcastToUser(call.initiatorId, { type: 'CALL_REJECTED', conversationId: call.conversationId });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/calls/:id/end', authenticateToken, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const call = await prisma.callRequest.findUnique({ where: { id } });
        if (!call) return res.status(404).json({ error: 'Call not found' });
        await prisma.callRequest.update({
            where: { id },
            data: { status: 'ENDED', endedAt: new Date() }
        });
        pendingCallIceMap.delete(call.conversationId);
        const peerId = call.initiatorId === req.user.id ? call.recipientId : call.initiatorId;
        wsBroadcastToUser(peerId, { type: 'CALL_ENDED', conversationId: call.conversationId });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
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

                        // 2. Broadcast live notification & send Expo Push Notification across all user tokens
                        wsBroadcastToUser(complaintUser.id, {
                            type: 'NEW_NOTIFICATION',
                            title: 'Possible Match Found! 🎉',
                            message: `Someone found a "${item.name}" that matches your complaint!`,
                            url: '/notifications',
                        });
                        await sendPushToUser(
                            complaintUser,
                            'Possible Match Found! 🎉',
                            `Someone found a "${item.name}" that matches your complaint. Check it out now!`,
                            { url: `/notifications`, type: 'MATCH_ALERT' }
                        );
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

// Create Complaint (Updated with optional phone, exposePhoneNumber, and reliable cross-platform push notifications)
app.post('/api/complaints', async (req, res) => {
    try {
        const {
            name,
            category,
            location,
            date,
            description,
            contactInfo,
            exposePhoneNumber,
            imageUris,
            userId,
            cashPrize,
            latitude,
            longitude,
            notifyRadius,
            targetCommunityId,
            targetOrganizationId
        } = req.body;

        const cleanContact = (contactInfo && String(contactInfo).trim()) || null;
        const canExposePhone = Boolean(exposePhoneNumber) && Boolean(cleanContact);

        const complaint = await prisma.complaint.create({
            data: {
                name: String(name).trim(),
                category: String(category).trim(),
                location: String(location).trim(),
                date,
                description: description || '',
                contactInfo: cleanContact,
                exposePhoneNumber: canExposePhone,
                imageUris: imageUris ? JSON.stringify(imageUris) : '[]',
                userId: userId || null,
                cashPrize: cashPrize || null,
                latitude: typeof latitude === 'number' ? latitude : (latitude ? parseFloat(latitude) : null),
                longitude: typeof longitude === 'number' ? longitude : (longitude ? parseFloat(longitude) : null),
                notifyRadius: notifyRadius || 5,
                targetCommunityId: targetCommunityId || null,
                targetOrganizationId: targetOrganizationId || null,
            },
        });

        // Notify relevant users BEFORE finalizing response so push delivery never gets cut off
        if (location || targetCommunityId || targetOrganizationId) {
            try {
                const allUsers = await prisma.user.findMany({
                    where: userId ? { NOT: { id: userId } } : undefined,
                    include: { memberships: true, orgAdmins: true }
                });

                const complaintLat = complaint.latitude;
                const complaintLon = complaint.longitude;
                const radius = Number(notifyRadius) || 5;
                const locTokens = String(location || '')
                    .toLowerCase()
                    .split(/[\s,]+/)
                    .filter(w => w.length >= 4);

                const usersToNotify = allUsers.filter((u: any) => {
                    // 1. Community target: notify approved members
                    if (targetCommunityId) {
                        return u.memberships.some((m: any) => m.communityId === targetCommunityId && m.role !== 'PENDING');
                    }

                    // 2. Organization target: notify org admins/members
                    if (targetOrganizationId) {
                        return u.orgAdmins.some((a: any) => a.organizationId === targetOrganizationId);
                    }

                    // 3. Radius matching when complaint has coordinates
                    if (complaintLat && complaintLon) {
                        if (u.latitude && u.longitude) {
                            const distance = calculateDistance(complaintLat, complaintLon, u.latitude, u.longitude);
                            if (distance <= radius) return true;
                            // Also match if user has a matching town/city text within generous local browser drift (e.g. web IP offset up to 15km)
                            if (u.location && locTokens.length > 0 && distance <= Math.max(radius, 15)) {
                                const uLocLower = String(u.location).toLowerCase();
                                if (locTokens.some(tok => uLocLower.includes(tok))) return true;
                            }
                            return false;
                        }
                        // User does not have GPS coordinates saved yet: match city name or best-effort push if registered with app token
                        if (u.location && locTokens.length > 0) {
                            const uLocLower = String(u.location).toLowerCase();
                            if (locTokens.some(tok => uLocLower.includes(tok))) return true;
                        }
                        if (isValidExpoPushToken(u.pushToken) || (Array.isArray(u.pushTokens) && u.pushTokens.length > 0)) {
                            return true;
                        }
                        return false;
                    }

                    // 4. Complaint has no GPS coordinates → notify all users as best effort
                    return true;
                });

                console.log(`[Complaint Notify] Found ${usersToNotify.length} users to notify for "${name}" in "${location}"`);

                if (usersToNotify.length > 0) {
                    const notifTitle = 'New Lost Item Nearby 📍';
                    const notifBody = `Someone lost a "${name}" near ${location}. Check if you can help!`;
                    const notifUrl = `/founder/complaint-detail?id=${complaint.id}`;

                    const notifications = usersToNotify.map(u => ({
                        userId: u.id,
                        title: notifTitle,
                        message: notifBody,
                        type: 'AREA_ALERT',
                        payload: JSON.stringify({ complaintId: complaint.id, location }),
                    }));

                    await prisma.notification.createMany({ data: notifications });

                    await Promise.allSettled(
                        usersToNotify.map(async (u: any) => {
                            wsBroadcastToUser(u.id, {
                                type: 'NEW_NOTIFICATION',
                                title: notifTitle,
                                message: notifBody,
                                url: notifUrl,
                                notificationType: 'AREA_ALERT',
                            });
                            await sendPushToUser(
                                u,
                                notifTitle,
                                notifBody,
                                { url: notifUrl, type: 'AREA_ALERT', complaintId: complaint.id }
                            );
                        })
                    );
                }
            } catch (notifyError) {
                console.error('Error sending complaint notifications:', notifyError);
            }
        }

        res.json(complaint);
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

        const sanitizedComplaints = complaints.map((c: any) => ({
            ...c,
            contactInfo: (c.exposePhoneNumber || (currentUser && c.userId === currentUser.id)) ? c.contactInfo : null,
        }));

        res.json(sanitizedComplaints);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch complaints' });
    }
});

// Get Complaint by ID
app.get('/api/complaints/:id', async (req, res) => {
    try {
        let requesterId: string | null = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as any;
                    requesterId = decoded.id;
                } catch {}
            }
        }

        const { id } = req.params;
        const complaint: any = await prisma.complaint.findUnique({
            where: { id },
            include: { user: { select: { id: true, name: true } } },
        });
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }

        const isOwner = requesterId && complaint.userId === requesterId;
        if (!complaint.exposePhoneNumber && !isOwner) {
            complaint.contactInfo = null;
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
        const { status, closureReason, reopenReason, resolvedAt, name, category, location, date, description, contactInfo, exposePhoneNumber, imageUris, notifyRadius, targetCommunityId, targetOrganizationId } = req.body;

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
        if (contactInfo !== undefined) data.contactInfo = (contactInfo && String(contactInfo).trim()) || null;
        if (exposePhoneNumber !== undefined) {
            const resultingContact = contactInfo !== undefined ? contactInfo : currentComplaint.contactInfo;
            data.exposePhoneNumber = Boolean(exposePhoneNumber) && Boolean(resultingContact && String(resultingContact).trim());
        }
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

                            const founderUser = await prisma.user.findUnique({ where: { id: item.userId } });
                            if (founderUser) {
                                await sendPushToUser(
                                    founderUser,
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
                closureReason: 'Item recovered via FindMyThing'
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

                        const founderUser = await prisma.user.findUnique({ where: { id: item.userId } });
                        if (founderUser) {
                            await sendPushToUser(
                                founderUser,
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

        // Send live WS + Expo Push Notification to the Victim
        const victimUser = await prisma.user.findUnique({ where: { id: complaint.userId } });
        if (victimUser) {
            wsBroadcastToUser(victimUser.id, {
                type: 'NEW_NOTIFICATION',
                title: 'Someone found your item! 🎉',
                message: `A founder has reached out regarding '${complaint.name}'.`,
                url: '/notifications',
            });
            await sendPushToUser(
                victimUser,
                'Someone found your item! 🎉',
                `A founder has reached out regarding '${complaint.name}'. Open the app to view their message and claim your item.`,
                { url: `/notifications`, type: 'CLAIM_REQUEST' }
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

// ====== Chat REST API ======

// Create or get existing conversation
app.post('/api/conversations', authenticateToken, async (req: any, res: any) => {
    try {
        const { recipientId, complaintId } = req.body;
        const initiatorId = req.user.id;

        if (initiatorId === recipientId) return res.status(400).json({ error: 'Cannot chat with yourself' });

        // Find existing conversation between these two users about this complaint
        let conversation = await prisma.conversation.findFirst({
            where: {
                complaintId: complaintId || undefined,
                OR: [
                    { initiatorId, recipientId },
                    { initiatorId: recipientId, recipientId: initiatorId }
                ]
            },
            include: { initiator: { select: { id: true, name: true } }, recipient: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 1 } }
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { initiatorId, recipientId, complaintId: complaintId || null },
                include: { initiator: { select: { id: true, name: true } }, recipient: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 1 } }
            });
        }

        res.json(conversation);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get all conversations for me
app.get('/api/conversations', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const conversations = await prisma.conversation.findMany({
            where: { OR: [{ initiatorId: userId }, { recipientId: userId }] },
            include: {
                initiator: { select: { id: true, name: true } },
                recipient: { select: { id: true, name: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
                complaint: { select: { id: true, name: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(conversations);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get messages in a conversation
app.get('/api/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        // Verify membership
        const conv = await prisma.conversation.findFirst({ where: { id, OR: [{ initiatorId: userId }, { recipientId: userId }] } });
        if (!conv) return res.status(403).json({ error: 'Not in this conversation' });

        // Mark all as read
        await prisma.message.updateMany({ where: { conversationId: id, senderId: { not: userId }, read: false }, data: { read: true } });
        const otherUserId = conv.initiatorId === userId ? conv.recipientId : conv.initiatorId;
        wsBroadcastToUser(otherUserId, { type: 'MESSAGES_READ', conversationId: id, readBy: userId });

        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, name: true } } }
        });
        res.json(messages);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Send message via REST (fallback for when WS is unavailable)
app.post('/api/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { content } = req.body;
        const conv = await prisma.conversation.findFirst({ where: { id, OR: [{ initiatorId: userId }, { recipientId: userId }] } });
        if (!conv) return res.status(403).json({ error: 'Not in this conversation' });

        const message = await prisma.message.create({
            data: { content, conversationId: id, senderId: userId },
            include: { sender: { select: { id: true, name: true } } }
        });
        await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
        res.json(message);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Start server after all routes are registered
httpServer.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket server running at ws://localhost:${port}/ws`);
});

