import { type Runtime } from "@chainlink/cre-sdk";
import { StructuredLogger, makeHttpPost } from "./utils";

/**
 * Pinata IPFS API Client
 * Uses CRE HTTPClient for decentralized storage
 */

export interface IPFSUploadResult {
  ipfsHash: string;
  pinataUrl: string;
  timestamp: number;
}

export class PinataClient {
  private logger: StructuredLogger;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(runtime: Runtime<any>, apiKey: string, apiSecret: string) {
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = "https://api.pinata.cloud";
  }

  /**
   * Upload JSON data to IPFS via Pinata
   */
  uploadJSON(
    runtime: Runtime<any>,
    data: any,
    metadata?: { name?: string; keyvalues?: Record<string, string> },
  ): IPFSUploadResult {
    this.logger.info("Pinata: Uploading to IPFS", {
      name: metadata?.name || "unnamed",
    });

    try {
      const requestBody = {
        pinataContent: data,
        pinataMetadata: metadata || {},
      };

      const response = makeHttpPost<any>(
        runtime,
        `${this.baseUrl}/pinning/pinJSONToIPFS`,
        requestBody,
        {
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.apiSecret,
        },
      );

      const result: IPFSUploadResult = {
        ipfsHash: response.IpfsHash,
        pinataUrl: `https://gateway.pinata.cloud/ipfs/${response.IpfsHash}`,
        timestamp: Date.now(),
      };

      this.logger.success("Pinata: Upload successful", {
        ipfsHash: result.ipfsHash,
      });

      return result;
    } catch (error) {
      this.logger.error("Pinata: Upload failed", error as Error);
      throw error;
    }
  }

  /**
   * Upload risk report to IPFS
   */
  uploadRiskReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      riskScore: number;
      totalAssets: string;
      analysis: string;
      recommendations: string[];
    },
  ): string {
    const result = this.uploadJSON(runtime, report, {
      name: `risk-report-${Date.now()}`,
      keyvalues: {
        type: "risk_assessment",
        score: report.riskScore.toString(),
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload compliance report to IPFS
   */
  uploadComplianceReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      address: string;
      status: string;
      riskScore: number;
      screeningDetails: string;
    },
  ): string {
    const result = this.uploadJSON(runtime, report, {
      name: `compliance-report-${Date.now()}`,
      keyvalues: {
        type: "compliance_screening",
        status: report.status,
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload proof of reserve report to IPFS
   */
  uploadReserveReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      totalReserves: string;
      actualBalance: string;
      reserveRatio: string;
      attestation: string;
    },
  ): string {
    const result = this.uploadJSON(runtime, report, {
      name: `reserve-report-${Date.now()}`,
      keyvalues: {
        type: "proof_of_reserve",
        ratio: report.reserveRatio,
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload rebalancing report to IPFS
   */
  uploadRebalancingReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      riskScore: number;
      totalAssets: string;
      recommendations: string[];
      analysis: string;
    },
  ): string {
    const result = this.uploadJSON(runtime, report, {
      name: `rebalancing-report-${Date.now()}`,
      keyvalues: {
        type: "rebalancing_advisory",
        score: report.riskScore.toString(),
      },
    });

    return result.ipfsHash;
  }
}
