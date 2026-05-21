import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// Initialize Firebase Admin
try {
  admin.initializeApp();
} catch (e) {
  // If already initialized or fails
  console.log("Firebase Admin initialization skipped/failed");
}

const dbAdmin = admin.firestore();

async function getPrompt(id: string, fallback: string): Promise<string> {
  try {
    const doc = await dbAdmin.collection('prompts').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      if (data?.useAdminText && data?.adminText) {
        return data.adminText;
      }
      return data?.text || fallback;
    }
  } catch (e) {
    // Silently fallback
  }
  return fallback;
}

function parseGeminiResponse(text: string) {
  // Strip hallucinated base64 strings that bloat the JSON
  let cleanedText = text.replace(/"(?:[A-Za-z0-9+\/]{4}){250,}(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?([ "])/g, '"$1');
  
  try {
    return JSON.parse(cleanedText);
  } catch (error: any) {
    if (cleanedText.includes('```json')) {
      const match = cleanedText.match(/```json\n([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (e) {}
      }
    }
    // Attempt to salvage truncated JSON (common when max tokens is reached)
    let cleaned = cleanedText.trim();
    if (cleaned.endsWith('",')) cleaned = cleaned.slice(0, -2) + '}';
    if (!cleaned.endsWith('}')) cleaned += '"}';
    
    // One final trick: sometimes it truncates right in the middle of a massive string without quotes
    cleaned = cleaned.replace(/,\s*"[^"]*$/, '}');

    try {
      return JSON.parse(cleaned);
    } catch (salvageError) {
      console.error("Failed to parse Gemini response payload:", cleanedText.slice(0, 1000) + '...');
      throw new Error(`Invalid JSON format from AI: ${error.message}`);
    }
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() { // force sync
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { imageBase64, language, existingLooks } = req.body;
      
      const defaultPrompt = `Analyze this image which contains either a single clothing item or a full outfit/look. 
        Language: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}
        Determine whether it's a single clothing piece mostly isolated ('Item') or a photo of a person/mannequin wearing a complete outfit ('Look'). Even if it's just a person wearing a top and pants, it MUST be classified as a 'Look'.
        If it's an Item, provide its category and color.
        If it's a Look, provide its overall style as category (e.g. 'Casual', 'Business', 'Streetwear'), its main color palette as color, and extract up to 5 clothing items clearly visible in the look. Use the extracted items to count what is worn.
        FOR 'Look' ONLY:
        - We provide a list of existing looks the user has: ${existingLooks ? JSON.stringify(existingLooks) : '[]'}.
        - CHECK carefully: if the clothing layout, posture, and items worn in this new image tightly match the text tags of one of the existing looks, return type as 'Duplicate'. Let minor variations slide, we only want exact duplicates.
        - If it is a 'Duplicate', set the 'advice' string to tell the user to delete this copy ("This is a duplicate of a previously uploaded look. Delete it."). Do not provide a rating. 
        FOR BOTH 'Item' and 'Look' (if not Duplicate):
        - Automatically rate it from 1.0 to 5.0 (fractional allowed). For a Look, rate the overall appearance. For an Item, rate its versatility, style, and condition.
        - Provide an "advice" string. Explain how these clothes fit together (or what this item combines well with), what does NOT combine with it, and why this rating is given. Mention the number of items and what they are. Keep it concise.
        FOR 'Look' ONLY (if not Duplicate):
        - Provide an array 'extractedItems'. Each object should have 'name', 'category', 'color', and 'attributes' (brief description of texture, pattern etc).
        Translate all string values into the given Language.
        IMPORTANT: Never output image base64 data or URLs in your text.`;

      const prompt = await getPrompt('analyze-image', defaultPrompt);
        
      if (!imageBase64 || !imageBase64.includes(',')) {
        throw new Error("Invalid image base64 data");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: prompt },
          { inlineData: { data: imageBase64.split(',')[1], mimeType: "image/webp" } }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["Item", "Look", "Duplicate"] },
              category: { type: Type.STRING },
              color: { type: Type.STRING },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of clothing items visible in the image if it is a Look"
              },
              rating: { type: Type.NUMBER, description: "Rating from 1.0 to 5.0" },
              advice: { type: Type.STRING, description: "Explanation of combinations and why this rating is given" },
              extractedItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    color: { type: Type.STRING },
                    attributes: { type: Type.STRING }
                  }
                },
                description: "Detailed extracted items for Look"
              }
            },
            required: ["type", "category", "color", "tags", "advice"]
          }
        }
      });
      
      res.json(parseGeminiResponse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/evaluate-outfit", async (req, res) => {
    try {
      const { items, language, targetEvent } = req.body;
      
      const defaultPrompt = `Evaluate the following outfit combinations for a user going to ${targetEvent || 'daily activities'}.
        Language: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}
        Outfit items:
        ${items.map((i: any) => i.type === 'Look' 
             ? `- Look Style: ${i.category} (Palette: ${i.color}). Pieces in look: ${(i.tags || []).join(', ')}` 
             : `- ${i.category} (${i.color})`
        ).join('\\n')}
        
        Analyze the style, color matching, formal correctness, and give a short advice. 
        Determine if the outfit is "READY", "NEEDS_IMPROVEMENT" or "NOT_RECOMMENDED".
        Finally, suggest 1 missing item that the user should buy to improve their wardrobe based on these items.
        Return the result in JSON.`;

      const prompt = await getPrompt('evaluate-outfit', defaultPrompt);
        
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              evaluation: { type: Type.STRING, description: "Detailed evaluation message in the user's language" },
              status: { type: Type.STRING, description: "Enum string", enum: ["READY", "NEEDS_IMPROVEMENT", "NOT_RECOMMENDED", "MISSING_ITEM"] },
              recommendationToBuy: { type: Type.STRING, description: "Description of a generic item to buy that goes well with this, in the user's language" }
            },
            required: ["evaluation", "status"]
          }
        }
      });
      
      res.json(parseGeminiResponse(response.text));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/evaluate-single-item", async (req, res) => {
    try {
      const { item, language, weather, city } = req.body;
      const defaultPrompt = `Evaluate this clothing item or look for a personal wardrobe.
        Language: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}
        Current location: ${city || 'unknown'}
        Weather context: ${weather || 'none'}
        Item details: Type: ${item.type}, Category: ${item.category}, Color: ${item.color}, Tags: ${(item.tags || []).join(', ')}.
        Rate it on a scale of 1 to 5 based on versatility, style, and utility. Fractional numbers (e.g. 4.5) are allowed. Return a JSON object with rating (number) and advice (string).`;

      const prompt = await getPrompt('evaluate-single-item', defaultPrompt);
        
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { 
              rating: { type: Type.NUMBER },
              advice: { type: Type.STRING }
            },
            required: ["rating", "advice"]
          }
        }
      });
      res.json(parseGeminiResponse(response.text));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/suggest-improvements", async (req, res) => {
    try {
      const { item, language, weather, city, profile } = req.body;
      const defaultPrompt = `Analyze this clothing item or look for a personal wardrobe and suggest specific, actionable improvements based on current trends.
        Language: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}
        ${city ? `Location: ${city}` : ""}
        ${weather ? `Weather context: ${weather}` : ""}
        ${profile?.height ? `User height: ${profile.height} cm` : ""}
        ${profile?.weight ? `User weight: ${profile.weight} kg` : ""}
        Item details: Type: ${item.type}, Category: ${item.category}, Color: ${item.color}, Source: ${item.source}, Tags: ${(item.tags || []).join(', ')}.
        
        Keep the answer very short and specific. What must be changed? What should be bought? 
        If an item needs to be bought to improve this look, add it to itemsToBuy.`;

      const prompt = await getPrompt('suggest-improvements', defaultPrompt);
        
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              advice: { type: Type.STRING, description: "Detailed advice message" },
              itemsToBuy: {
                type: Type.ARRAY,
                description: "List of items to buy (only populated if item is from the internet)",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  },
                  required: ["name", "reason"]
                }
              }
            },
            required: ["advice"]
          }
        }
      });
      res.json(parseGeminiResponse(response.text));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-weekly-plan", async (req, res) => {
    try {
      const { items, language, weather, city } = req.body;
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      
      const defaultPrompt = `You are a virtual stylist. Create a weekly wardrobe plan (7 days).
        Current Location: ${city || 'unknown'}
        Current/Forecast Weather: ${weather || 'unknown'}
        
        I will provide a list of wardrobe items (with IDs and details). 
        You must assign 1 outfit (can be composed of 1 or more item IDs) for each day of the week from Monday to Sunday.
        Take weather and location into account when choosing outfits.
        
        If there are not enough items, you can repeat looks throughout the week, but try to vary them.
        Language: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}
        
        Available items (JSON):
        ${JSON.stringify(items.map((i: any) => ({ id: i.id, type: i.type, category: i.category, color: i.color, tags: i.tags })))}
        
        Return a JSON object mapping each day key to an array of item IDs.`;

      const prompt = await getPrompt('generate-weekly-plan', defaultPrompt);
        
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              monday: { type: Type.ARRAY, items: { type: Type.STRING } },
              tuesday: { type: Type.ARRAY, items: { type: Type.STRING } },
              wednesday: { type: Type.ARRAY, items: { type: Type.STRING } },
              thursday: { type: Type.ARRAY, items: { type: Type.STRING } },
              friday: { type: Type.ARRAY, items: { type: Type.STRING } },
              saturday: { type: Type.ARRAY, items: { type: Type.STRING } },
              sunday: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: days
          }
        }
      });
      res.json(parseGeminiResponse(response.text));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, wardrobeItems, language, profile } = req.body;
      const defaultSystemPrompt = `You are an expert personal stylist. Be concise, direct, and knowledgeable.
        Language to use: ${language === 'ru' ? 'Russian' : 'Azerbaijani'}.
        User profile (height/weight): ${profile?.height ? profile.height+'cm' : 'unknown'}, ${profile?.weight ? profile.weight+'kg' : 'unknown'}.
        User's Wardrobe (JSON):
        ${JSON.stringify(wardrobeItems.map((i: any) => ({ category: i.category, color: i.color, type: i.type, source: i.source, rating: i.rating, tags: i.tags })))}
        
        Answer the user's fashion & styling questions using their wardrobe items as context.`;

      const systemPrompt = await getPrompt('chat-assistant', defaultSystemPrompt);
        
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
           { role: "user", parts: [{ text: systemPrompt }] },
           { role: "model", parts: [{ text: "Understood. I will act as a styling assistant and keep my answers concise, using the wardrobe data provided." }] },
           ...messages.map((m: any) => ({
             role: m.role === 'user' ? 'user' : 'model',
             parts: [{ text: m.content }]
           }))
        ],
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a global error handler for JSON parsing issues
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
      console.error('Body parser syntax error:', err.message);
      return res.status(400).json({ error: 'Invalid JSON payload sent to server. The request might have been truncated. ' + err.message });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    // Provide a wildcard fallback so client-side routing works
    // Assuming express v4 as per package.json
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
