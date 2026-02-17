
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { OutreachOutputs } from "../types";

export const generateOutreach = async (query: string): Promise<OutreachOutputs> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Multi-Agent Intelligence Task:
    1. Research the following entity or topic extensively: "${query}".
    2. Focus on recent news from February 2026, participation in the IndiaAI Impact Summit (Feb 16-20, 2026), and connections to MeitY, NITI Aayog, or foundational education in India.
    3. SEARCH for and extract publicly available contact details (Email, LinkedIn, Twitter) for the individual or organization.
    4. Construct a professional outreach strategy for Abhishek Gupta (SahayakAI) based on this intelligence.
    
    Current Date: February 21, 2026.
    
    You must return a JSON response matching the schema.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT + "\n\nCRITICAL: Use the googleSearch tool to find the most recent professional activity, quotes, contact details, and policy stances of the subject.",
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          researchSummary: { 
            type: Type.STRING, 
            description: "A comprehensive summary of findings about the person/topic from various sources, emphasizing recent hooks." 
          },
          contactDetails: {
            type: Type.OBJECT,
            properties: {
                email: { type: Type.STRING, description: "Publicly available professional email address if found." },
                linkedIn: { type: Type.STRING, description: "LinkedIn profile URL." },
                twitter: { type: Type.STRING, description: "Twitter/X handle or URL." }
            },
            description: "Contact information for the target."
          },
          formalEmail: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, description: "A highly professional, concise, and value-driven email subject line. NO salesy language. Format: 'Topic: Context' or similar." },
              body: { type: Type.STRING, description: "The main content of the email. STRICTLY PLAIN TEXT. Do not use Markdown formatting (no **bold**, no *italics*, no headers). Use natural paragraph breaks. Do not include the subject line here." }
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

export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Using gemini-2.0-flash for high-accuracy multilingual transcription as the preview model was unavailable
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64
          }
        },
        {
          text: "Transcribe the following audio query accurately. It is a professional search query which may contain Indian names, government organizations (like NITI Aayog, MeitY), technical terms, or mixed Hindi/English. Return ONLY the text of the query, no other commentary."
        }
      ]
    }
  });

  return response.text || "";
};
