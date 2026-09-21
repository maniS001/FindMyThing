import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

const getGeminiModel = () => {
    return geminiClient.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
            responseMimeType: "application/json",
        },
        systemInstruction: `You are the dedicated AI Agent for FindMyThing.`
    });
};

async function test() {
    try {
        const model = getGeminiModel();
        
        const action = 'lost';
        const pronoun = 'my';
        const name = 'Physics book';
        const category = 'Books & Stationery';
        const location = 'Chennai park';
        const date = '2026-06-14';

        const prompt = `You are a user of a lost & found app. Write a 2 sentence description for an item you just ${action}.
CRITICAL INSTRUCTIONS:
1. You MUST start the description with the exact words: "I ${action} ${pronoun} ${name}".
2. Do NOT act like a system administrator, support team, or third party.
3. Do NOT include placeholders, emails, or phone numbers.
4. Do NOT invent any details not provided.

Item: ${name}
Category: ${category}
Location: ${location}
Date: ${date}

Respond ONLY with this JSON (no markdown, no explanation):
{
  "description": "the generated text description"
}`;

        console.log("Sending prompt to Gemini...");
        const result = await model.generateContent(prompt);
        console.log("Result received:", result.response.text());
    } catch (err: any) {
        console.error("Error from Gemini:", err);
    }
}
test();
