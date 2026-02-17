
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { OutreachOutputs } from "../types";

export const generateOutreach = async (query: string): Promise<OutreachOutputs> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Multi-Agent Intelligence Task:
    1. Research the following entity or topic extensively: "${query}".
    2. Focus on recent news from February 2026, participation in the IndiaAI Impact Summit (Feb 16-20, 2026), and connections to MeitY, NITI Aayog, or foundational education in India.
    3. Construct a professional outreach strategy for Abhishek Gupta (SahayakAI) based on this intelligence.
    
    Current Date: February 21, 2026.
    
    You must return a JSON response matching the schema.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT + "\n\nCRITICAL: Use the googleSearch tool to find the most recent professional activity, quotes, and policy stances of the subject.",
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          researchSummary: { 
            type: Type.STRING, 
            description: "A comprehensive summary of findings about the person/topic from various sources, emphasizing recent hooks." 
          },
          formalEmail: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING }
            },
            required: ["subject", "body"]
          },
          socialMessage: { type: Type.STRING },
          elevatorPitch: { type: Type.STRING }
        },
        required: ["researchSummary", "formalEmail", "socialMessage", "elevatorPitch"]
      }
    }
  });

  const result = JSON.parse(response.text || "{}");
  
  // Extract grounding sources if available
  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any;
  if (sources) {
    result.sources = sources;
  }

  return result as OutreachOutputs;
};
