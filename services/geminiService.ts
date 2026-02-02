
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { FieldBoundary, PathOptimizationResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const optimizePrecisionPath = async (
  boundary: FieldBoundary,
  machineryWidth: number
): Promise<PathOptimizationResult> => {
  if (!navigator.onLine) {
    throw new Error("Não é possível otimizar offline. Verifique sua conexão.");
  }

  const prompt = `Analyze this agricultural field boundary (coordinates: ${JSON.stringify(boundary.points)}) 
  for an implement width of ${machineryWidth} meters. 
  Determine the most efficient AB line (parallel path) heading and suggested spacing to minimize turns and overlap.
  The spacing should be close to the machinery width of ${machineryWidth} meters but adjusted for optimal field coverage if necessary.
  Return a JSON object with efficiency (0-1), suggestedHeading (0-360 degrees), suggestedSpacing (meters), overlapPercentage, estimatedTimeHours, and recommendations.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          efficiency: { type: Type.NUMBER },
          suggestedHeading: { type: Type.NUMBER },
          suggestedSpacing: { type: Type.NUMBER },
          overlapPercentage: { type: Type.NUMBER },
          estimatedTimeHours: { type: Type.NUMBER },
          recommendations: { type: Type.STRING },
        },
        required: ["efficiency", "suggestedHeading", "suggestedSpacing", "overlapPercentage", "estimatedTimeHours", "recommendations"],
      },
    },
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Failed to parse AI response", error);
    throw new Error("Erro na otimização de caminho via IA.");
  }
};

export const findNearbyAgroServices = async (lat: number, lng: number, query: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Encontre ${query} próximos a esta localização: latitude ${lat}, longitude ${lng}. Liste os nomes e o que eles oferecem.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    }
  });
  
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
};

export const connectLiveAssistant = (callbacks: any) => {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: 'Você é o AgroVision Assistant, um co-piloto de máquinas agrícolas. Ajude o operador com dúvidas sobre o talhão, clima e manutenção. Seja breve e técnico.',
    },
  });
};
