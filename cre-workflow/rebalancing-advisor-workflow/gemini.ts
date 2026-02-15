import { type Runtime } from "@chainlink/cre-sdk";
import { StructuredLogger, makeHttpPost } from "./utils";

/**
 * Google Gemini API Client for AI-powered analysis
 * Uses CRE HTTPClient for reliable external API calls
 */

export interface GeminiAnalysisRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiAnalysisResponse {
  analysis: string;
  confidence: number;
  reasoning: string[];
  recommendations: string[];
}

interface GeminiAPIResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiClient {
  private logger: StructuredLogger;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(
    runtime: Runtime<any>,
    apiKey: string,
    model = "gemini-2.5-flash",
  ) {
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    this.model = model;
  }

  /**
   * Generate AI analysis using Gemini
   */
  analyze(
    runtime: Runtime<any>,
    request: GeminiAnalysisRequest,
  ): GeminiAnalysisResponse {
    this.logger.info("Gemini: Generating AI analysis");

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: request.prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: request.temperature || 0.7,
          maxOutputTokens: request.maxTokens || 2048,
        },
      };

      const response = makeHttpPost<GeminiAPIResponse>(
        runtime,
        `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`,
        requestBody,
        {},
      );

      const analysis = this.parseGeminiResponse(response);

      this.logger.success("Gemini: Analysis complete", {
        confidence: analysis.confidence,
        recommendationCount: analysis.recommendations.length,
      });

      return analysis;
    } catch (error) {
      this.logger.error("Gemini: Analysis failed", error as Error);
      throw error;
    }
  }

  /**
   * Parse Gemini API response
   */
  private parseGeminiResponse(
    response: GeminiAPIResponse,
  ): GeminiAnalysisResponse {
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const recommendations = this.extractRecommendations(text);
    const reasoning = this.extractReasoning(text);
    const confidence = this.extractConfidence(text);

    return {
      analysis: text,
      confidence,
      reasoning,
      recommendations,
    };
  }

  /**
   * Extract recommendations from AI response
   */
  private extractRecommendations(text: string): string[] {
    const recommendations: string[] = [];

    const lines = text.split("\n");
    for (const line of lines) {
      if (
        line.match(/^\d+\./) ||
        line.match(/^[-*]/) ||
        line.toLowerCase().includes("recommend")
      ) {
        const cleaned = line
          .replace(/^\d+\./, "")
          .replace(/^[-*]/, "")
          .trim();
        if (cleaned.length > 10) {
          recommendations.push(cleaned);
        }
      }
    }

    return recommendations;
  }

  /**
   * Extract reasoning points from AI response
   */
  private extractReasoning(text: string): string[] {
    const reasoning: string[] = [];

    const keywords = [
      "because",
      "due to",
      "given that",
      "considering",
      "therefore",
    ];

    const sentences = text.split(/[.!?]/);
    for (const sentence of sentences) {
      for (const keyword of keywords) {
        if (sentence.toLowerCase().includes(keyword)) {
          reasoning.push(sentence.trim());
          break;
        }
      }
    }

    return reasoning.slice(0, 5);
  }

  /**
   * Extract confidence level from AI response
   */
  private extractConfidence(text: string): number {
    const confidenceMatch = text.match(/confidence[:\s]+(\d+)%/i);
    if (confidenceMatch) {
      return parseInt(confidenceMatch[1]);
    }

    const lowConfidenceWords = [
      "might",
      "could",
      "possibly",
      "uncertain",
      "unclear",
    ];
    const highConfidenceWords = [
      "will",
      "definitely",
      "certainly",
      "clearly",
      "strongly",
    ];

    let score = 70;

    for (const word of lowConfidenceWords) {
      if (text.toLowerCase().includes(word)) score -= 5;
    }

    for (const word of highConfidenceWords) {
      if (text.toLowerCase().includes(word)) score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate portfolio risk analysis
   */
  analyzePortfolioRisk(
    runtime: Runtime<any>,
    portfolioData: {
      totalAssets: string;
      assetAllocations?: Record<string, number>;
      currentRiskScore: number;
      marketConditions?: string;
    },
  ): GeminiAnalysisResponse {
    const prompt = `You are an expert DeFi risk analyst. Analyze the following portfolio and provide a detailed risk assessment.

Portfolio Data:
- Total Assets: ${portfolioData.totalAssets} USDC
- Current Risk Score: ${portfolioData.currentRiskScore}/100
${portfolioData.assetAllocations ? `- Asset Allocations: ${JSON.stringify(portfolioData.assetAllocations)}` : ""}
${portfolioData.marketConditions ? `- Market Conditions: ${portfolioData.marketConditions}` : ""}

Please provide:
1. Updated risk score (0-100) with justification
2. Key risk factors identified
3. Specific recommendations to mitigate risks
4. Your confidence level in this assessment (0-100%)

Format your response clearly with sections for each item.`;

    return this.analyze(runtime, { prompt, maxTokens: 1500 });
  }

  /**
   * Generate rebalancing recommendations
   */
  generateRebalancingAdvice(
    runtime: Runtime<any>,
    data: {
      totalAssets: string;
      currentAllocations: Record<string, number>;
      riskScore: number;
      targetRiskLevel: string;
    },
  ): GeminiAnalysisResponse {
    const prompt = `You are an expert DeFi portfolio manager. Generate rebalancing recommendations for the following portfolio.

Portfolio Data:
- Total Assets: ${data.totalAssets} USDC
- Current Allocations: ${JSON.stringify(data.currentAllocations)}
- Risk Score: ${data.riskScore}/100
- Target Risk Level: ${data.targetRiskLevel}

Please provide:
1. Recommended asset allocation changes (specific percentages)
2. Execution strategy (immediate vs gradual)
3. Expected impact on risk profile
4. Timeline for rebalancing
5. Your confidence level (0-100%)

Be specific with numerical recommendations and provide clear reasoning.`;

    return this.analyze(runtime, { prompt, maxTokens: 2000, temperature: 0.5 });
  }
}
