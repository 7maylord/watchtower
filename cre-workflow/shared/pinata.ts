import { type Runtime } from "@chainlink/cre-sdk";
import { ResilientHTTPClient, StructuredLogger } from "./utils";

/**
 * Pinata IPFS Client for decentralized report storage
 *
 * Stores detailed risk reports, compliance records, and audit trails on IPFS
 * using Pinata's pinning service for persistence.
 */

export interface IPFSUploadResult {
  ipfsHash: string;
  pinataUrl: string;
  timestamp: number;
}

export class PinataClient {
  private httpClient: ResilientHTTPClient;
  private logger: StructuredLogger;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(runtime: Runtime<any>, apiKey: string, apiSecret: string) {
    this.httpClient = new ResilientHTTPClient();
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = "https://api.pinata.cloud";
  }

  /**
   * Upload JSON data to IPFS via Pinata
   */
  async uploadJSON(
    data: any,
    metadata?: { name?: string; keyvalues?: Record<string, string> },
  ): Promise<IPFSUploadResult> {
    this.logger.info("Pinata: Uploading to IPFS", { name: metadata?.name });

    try {
      const response = await this.httpClient.post<any>(
        `${this.baseUrl}/pinning/pinJSONToIPFS`,
        {
          pinataContent: data,
          pinataMetadata: metadata || {},
          pinataOptions: {
            cidVersion: 1,
          },
        },
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
   * Upload risk analysis report to IPFS
   */
  async uploadRiskReport(report: {
    timestamp: number;
    riskScore: number;
    portfolioSize: string;
    analysis: string;
    recommendations: string[];
    dataSource: string;
  }): Promise<string> {
    this.logger.info("Pinata: Uploading risk report");

    const result = await this.uploadJSON(report, {
      name: `risk-report-${report.timestamp}`,
      keyvalues: {
        type: "risk_analysis",
        score: report.riskScore.toString(),
        timestamp: report.timestamp.toString(),
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload compliance screening report to IPFS
   */
  async uploadComplianceReport(report: {
    timestamp: number;
    address: string;
    kycVerified: boolean;
    sanctioned: boolean;
    riskScore: number;
    details: any;
  }): Promise<string> {
    this.logger.info("Pinata: Uploading compliance report", {
      address: report.address,
    });

    const result = await this.uploadJSON(report, {
      name: `compliance-report-${report.address}-${report.timestamp}`,
      keyvalues: {
        type: "compliance_screening",
        address: report.address,
        timestamp: report.timestamp.toString(),
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload proof of reserve report to IPFS
   */
  async uploadReserveReport(report: {
    timestamp: number;
    totalReserves: string;
    onChainReserves: string;
    custodianReserves: string;
    reserveRatio: string;
    attestations: any[];
  }): Promise<string> {
    this.logger.info("Pinata: Uploading PoR report");

    const result = await this.uploadJSON(report, {
      name: `por-report-${report.timestamp}`,
      keyvalues: {
        type: "proof_of_reserve",
        reserves: report.totalReserves,
        timestamp: report.timestamp.toString(),
      },
    });

    return result.ipfsHash;
  }

  /**
   * Upload rebalancing advisory report to IPFS
   */
  async uploadRebalancingReport(report: {
    timestamp: number;
    recommendation: string;
    reasoning: string;
    expectedImpact: string;
    confidence: number;
    analysis: string;
  }): Promise<string> {
    this.logger.info("Pinata: Uploading rebalancing report");

    const result = await this.uploadJSON(report, {
      name: `rebalancing-report-${report.timestamp}`,
      keyvalues: {
        type: "rebalancing_advisory",
        recommendation: report.recommendation,
        timestamp: report.timestamp.toString(),
      },
    });

    return result.ipfsHash;
  }

  /**
   * Retrieve content from IPFS
   */
  async retrieveJSON<T>(ipfsHash: string): Promise<T> {
    this.logger.info("Pinata: Retrieving from IPFS", { ipfsHash });

    try {
      const response = await this.httpClient.get<T>(
        `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
        {},
      );

      this.logger.success("Pinata: Retrieved successfully");
      return response;
    } catch (error) {
      this.logger.error("Pinata: Retrieval failed", error as Error);
      throw error;
    }
  }

  /**
   * Check if content is pinned
   */
  async isPinned(ipfsHash: string): Promise<boolean> {
    try {
      const response = await this.httpClient.get<any>(
        `${this.baseUrl}/pinning/pinJobs?status=pinned&ipfs_pin_hash=${ipfsHash}`,
        {
          pinata_api_key: this.apiKey,
          pinata_secret_api_key: this.apiSecret,
        },
      );

      return response.rows && response.rows.length > 0;
    } catch (error) {
      this.logger.error("Pinata: Pin check failed", error as Error);
      return false;
    }
  }
}
