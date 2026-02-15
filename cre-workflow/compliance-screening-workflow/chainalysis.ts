import { type Runtime } from "@chainlink/cre-sdk";
import { type Address } from "viem";
import { StructuredLogger, makeHttpGet } from "./utils";

/**
 * Chainalysis Sanctions API Client
 * Uses the FREE public Sanctions API for address screening
 * Docs: https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/
 */

export interface ChainalysisScreeningResult {
  address: Address;
  isSanctioned: boolean;
  riskScore: number;
  exposures: Array<{
    category: string;
    value: number;
  }>;
  detailedReport: string;
  confidence: number;
}

export class ChainalysisClient {
  private logger: StructuredLogger;
  private apiKey: string;
  private baseUrl: string;

  constructor(runtime: Runtime<any>, apiKey: string) {
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.baseUrl = "https://public.chainalysis.com/api/v1";
  }

  /**
   * Screen a cryptocurrency address for sanctions
   */
  screenAddress(
    runtime: Runtime<any>,
    address: Address,
  ): ChainalysisScreeningResult {
    this.logger.info("Chainalysis: Screening address", { address });

    try {
      const response = makeHttpGet<any>(
        runtime,
        `${this.baseUrl}/address/${address}`,
        {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
      );

      // The public API returns { identifications: [...] }
      // If identifications array is non-empty, address is sanctioned
      const identifications = response.identifications || [];
      const isSanctioned = identifications.length > 0;

      // Build risk score: 100 if sanctioned, 0 if clean
      const riskScore = isSanctioned ? 100 : 0;

      // Map identifications to exposures format
      const exposures = identifications.map((id: any) => ({
        category: id.category || "sanctions",
        value: 1,
      }));

      const result: ChainalysisScreeningResult = {
        address,
        isSanctioned,
        riskScore,
        exposures,
        detailedReport: JSON.stringify(response, null, 2),
        confidence: 95,
      };

      this.logger.success("Chainalysis: Screening complete", {
        address,
        riskScore: result.riskScore,
        isSanctioned: result.isSanctioned,
        identificationCount: identifications.length,
      });

      return result;
    } catch (error) {
      this.logger.error("Chainalysis: Screening failed", error as Error, {
        address,
      });
      throw error;
    }
  }
}
