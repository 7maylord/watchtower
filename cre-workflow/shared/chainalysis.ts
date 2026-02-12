import { type Runtime } from "@chainlink/cre-sdk";
import { type Address } from "viem";
import { ResilientHTTPClient, StructuredLogger } from "./utils";

/**
 * Chainalysis KYT API Client
 *
 * Screens cryptocurrency addresses for sanctions, illicit activity, and risk exposure.
 *
 * API Documentation: https://docs.chainalysis.com/api/kyt/
 */

export interface ChainalysisScreeningResult {
  address: Address;
  isSanctioned: boolean;
  riskScore: number; // 0-100, higher = more risky
  exposures: {
    category: string; // e.g., "sanctions", "darknet", "stolen funds"
    value: number; // exposure percentage
  }[];
  detailedReport: string;
  confidence: number; // 0-100
}

export class ChainalysisClient {
  private httpClient: ResilientHTTPClient;
  private logger: StructuredLogger;
  private apiKey: string;
  private baseUrl: string;

  constructor(runtime: Runtime<any>, apiKey: string) {
    this.httpClient = new ResilientHTTPClient();
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.baseUrl = "https://api.chainalysis.com/api/kyt/v2";
  }

  /**
   * Screen a cryptocurrency address for sanctions and risk
   */
  async screenAddress(address: Address): Promise<ChainalysisScreeningResult> {
    this.logger.info("Chainalysis: Screening address", { address });

    try {
      // Register the address for monitoring (if not already registered)
      await this.registerAddress(address);

      // Get risk assessment
      const assessment = await this.getAddressRisk(address);

      this.logger.success("Chainalysis: Screening complete", {
        address,
        riskScore: assessment.riskScore,
        isSanctioned: assessment.isSanctioned,
      });

      return assessment;
    } catch (error) {
      this.logger.error("Chainalysis: Screening failed", error as Error, {
        address,
      });
      throw error;
    }
  }

  /**
   * Register address with Chainalysis for monitoring
   */
  private async registerAddress(address: Address): Promise<void> {
    const response = await this.httpClient.post<any>(
      `${this.baseUrl}/users`,
      {
        address,
        asset: "USDC",
        network: "ethereum",
      },
      {
        Token: this.apiKey,
      },
    );

    return response;
  }

  /**
   * Get risk assessment for an address
   */
  private async getAddressRisk(
    address: Address,
  ): Promise<ChainalysisScreeningResult> {
    const response = await this.httpClient.get<any>(
      `${this.baseUrl}/users/${address}/risk`,
      {
        Token: this.apiKey,
      },
    );

    // Parse Chainalysis response
    const isSanctioned = this.checkSanctionsExposure(response.exposures || []);
    const riskScore = this.calculateRiskScore(response.exposures || []);

    return {
      address,
      isSanctioned,
      riskScore,
      exposures: response.exposures || [],
      detailedReport: JSON.stringify(response, null, 2),
      confidence: response.confidence || 85,
    };
  }

  /**
   * Check if address has sanctions exposure
   */
  private checkSanctionsExposure(exposures: any[]): boolean {
    return exposures.some(
      (exp) =>
        exp.category.toLowerCase().includes("sanction") ||
        exp.category.toLowerCase().includes("ofac") ||
        exp.value > 0.01, // Any direct exposure to sanctioned entities
    );
  }

  /**
   * Calculate overall risk score from exposures
   */
  private calculateRiskScore(exposures: any[]): number {
    if (exposures.length === 0) return 0;

    // Weight different risk categories
    const weights: Record<string, number> = {
      sanctions: 100,
      "stolen funds": 90,
      darknet: 80,
      scam: 70,
      ransomware: 95,
      "child abuse": 100,
      terrorism: 100,
    };

    let totalRisk = 0;
    let totalWeight = 0;

    for (const exposure of exposures) {
      const category = exposure.category.toLowerCase();
      const weight = weights[category] || 50; // Default weight for unknown categories
      totalRisk += exposure.value * weight;
      totalWeight += exposure.value;
    }

    // Normalize to 0-100 scale
    return totalWeight > 0 ? Math.min(100, totalRisk / totalWeight) : 0;
  }

  /**
   * Batch screen multiple addresses (for efficiency)
   */
  async screenMultipleAddresses(
    addresses: Address[],
  ): Promise<Map<Address, ChainalysisScreeningResult>> {
    this.logger.info(
      `Chainalysis: Batch screening ${addresses.length} addresses`,
    );

    const results = new Map<Address, ChainalysisScreeningResult>();

    // Screen addresses sequentially to respect rate limits
    for (const address of addresses) {
      try {
        const result = await this.screenAddress(address);
        results.set(address, result);

        // Rate limiting: wait 100ms between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(
          `Chainalysis: Failed to screen ${address}`,
          error as Error,
        );
        // Continue with other addresses even if one fails
      }
    }

    return results;
  }
}
