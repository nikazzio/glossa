import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { PipelineConfig, PipelineStageConfig, JudgeResult, ModelProvider, GlossaryEntry } from "../types";

// Lazy initialization helpers
let geminiClient: any = null;
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let deepseekClient: OpenAI | null = null;

function getGemini() {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing");
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

function getOpenAI() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY || (import.meta as any).env.VITE_OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is missing.");
    openaiClient = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  }
  return openaiClient;
}

function getAnthropic() {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY || (import.meta as any).env.VITE_ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is missing.");
    anthropicClient = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }
  return anthropicClient;
}

function getDeepSeek() {
  if (!deepseekClient) {
    const key = process.env.DEEPSEEK_API_KEY || (import.meta as any).env.VITE_DEEPSEEK_API_KEY;
    if (!key) throw new Error("DEEPSEEK_API_KEY is missing.");
    deepseekClient = new OpenAI({ 
      apiKey: key, 
      baseURL: "https://api.deepseek.com",
      dangerouslyAllowBrowser: true 
    });
  }
  return deepseekClient;
}

export const llmService = {
  async runStage(text: string, stage: PipelineStageConfig, config: PipelineConfig, previousResult?: string) {
    const glossaryStr = config.glossary.map(g => `- ${g.term} -> ${g.translation} (${g.notes || ''})`).join('\n');
    
    const systemPrompt = `
      You are an expert translator and linguist specialized in ${config.sourceLanguage} to ${config.targetLanguage} translation.
      
      Core Instructions:
      ${stage.prompt}
      
      Glossary of Terms:
      ${glossaryStr || 'No specific glossary entries.'}
    `;

    const userPrompt = previousResult 
      ? `Original: ${text}\n\nPrevious Iteration: ${previousResult}\n\nRefine the above translation according to your instructions. Provide ONLY the final text.`
      : `Text to translate: ${text}\n\nProvide ONLY the translated text.`;

    switch (stage.provider) {
      case 'gemini':
        const genAI = getGemini();
        const geminiResp = await genAI.models.generateContent({
          model: stage.model || "gemini-3-flash-preview",
          contents: userPrompt,
          config: { systemInstruction: systemPrompt }
        });
        return geminiResp.text || "";

      case 'openai':
      case 'deepseek':
        const client = stage.provider === 'openai' ? getOpenAI() : getDeepSeek();
        const oaiResp = await client.chat.completions.create({
          model: stage.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
        return oaiResp.choices[0]?.message.content || "";

      case 'anthropic':
        const anthro = getAnthropic();
        const anthroResp = await anthro.messages.create({
          model: stage.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        });
        const content = anthroResp.content[0];
        return content.type === 'text' ? content.text : "";

      default:
        throw new Error(`Unsupported provider: ${stage.provider}`);
    }
  },

  async judgeTranslation(originalText: string, translation: string, config: PipelineConfig): Promise<Omit<JudgeResult, 'status'>> {
    const glossaryJson = JSON.stringify(config.glossary);
    
    const systemPrompt = `
      As a translation quality judge, evaluate the following translation.
      Source (${config.sourceLanguage}): ${originalText}
      Target (${config.targetLanguage}): ${translation}
      
      Specific Audit Instructions:
      ${config.judgePrompt}
      
      Glossary to adhere to: ${glossaryJson}

      You MUST respond with a valid JSON object containing:
      - score: number (0-10)
      - issues: array of objects { type: 'glossary'|'fluency'|'accuracy'|'grammar', severity: 'low'|'medium'|'high', description: string, suggestedFix: string }
    `;

    const userPrompt = "Perform the audit now and return the JSON report.";

    let resultText = "";

    if (config.judgeProvider === 'gemini') {
      const genAI = getGemini();
      const response = await genAI.models.generateContent({
        model: config.judgeModel || "gemini-3-flash-preview",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['glossary', 'fluency', 'accuracy', 'grammar'] },
                    severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    description: { type: Type.STRING },
                    suggestedFix: { type: Type.STRING }
                  },
                  required: ['type', 'severity', 'description']
                }
              }
            },
            required: ['score', 'issues']
          }
        }
      });
      resultText = response.text || "";
    } else if (config.judgeProvider === 'openai' || config.judgeProvider === 'deepseek') {
        const client = config.judgeProvider === 'openai' ? getOpenAI() : getDeepSeek();
        const resp = await client.chat.completions.create({
            model: config.judgeModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" }
        });
        resultText = resp.choices[0]?.message.content || "";
    } else if (config.judgeProvider === 'anthropic') {
        const anthro = getAnthropic();
        // Anthropic doesn't have a forced JSON mode in the same way, but usually follows instructions well.
        const resp = await anthro.messages.create({
            model: config.judgeModel,
            max_tokens: 4096,
            system: systemPrompt + "\nIMPORTANT: Return ONLY valid JSON.",
            messages: [{ role: "user", content: userPrompt }]
        });
        const content = resp.content[0];
        resultText = content.type === 'text' ? content.text : "";
    }

    try {
      return JSON.parse(resultText);
    } catch (e) {
      console.error("Failed to parse judge response:", resultText);
      return { score: 0, issues: [{ type: 'accuracy', severity: 'high', description: 'Failed to parse judge response' }], content: "" };
    }
  },

  async optimizePrompt(currentPrompt: string) {
    const prompt = `
      The user is using the following prompt for an AI-powered translation pipeline. 
      Analyze the prompt and provide a more effective, professional, and detailed version.
      
      Current Prompt: "${currentPrompt}"
      
      Provide only the improved prompt text.
    `;

    const genAI = getGemini();
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || currentPrompt;
  }
};
