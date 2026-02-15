import { type Runtime } from '@chainlink/cre-sdk'
import { type Address } from 'viem'
import { StructuredLogger, makeHttpPost, makeHttpGet } from './utils'

/**
 * Chainalysis KYT API Client
 * Uses CRE HTTPClient for sanctions screening
 */

export interface ChainalysisScreeningResult {
  address: Address
  isSanctioned: boolean
  riskScore: number
  exposures: Array<{
    category: string
    value: number
  }>
  detailedReport: string
  confidence: number
}

export class ChainalysisClient {
  private logger: StructuredLogger
  private apiKey: string
  private baseUrl: string

  constructor(runtime: Runtime<any>, apiKey: string) {
    this.logger = new StructuredLogger(runtime)
    this.apiKey = apiKey
    this.baseUrl = 'https://api.chainalysis.com/api/kyt/v2'
  }

  /**
   * Screen a cryptocurrency address for sanctions and risk
   */
  screenAddress(runtime: Runtime<any>, address: Address): ChainalysisScreeningResult {
    this.logger.info('Chainalysis: Screening address', { address })

    try {
      // Register the address
      this.registerAddress(runtime, address)

      // Get risk assessment
      const assessment = this.getAddressRisk(runtime, address)

      this.logger.success('Chainalysis: Screening complete', {
        address,
        riskScore: assessment.riskScore,
        isSanctioned: assessment.isSanctioned,
      })

      return assessment
    } catch (error) {
      this.logger.error('Chainalysis: Screening failed', error as Error, { address })
      throw error
    }
  }

  /**
   * Register address with Chainalysis
   */
  private registerAddress(runtime: Runtime<any>, address: Address): void {
    makeHttpPost(
      runtime,
      `${this.baseUrl}/users`,
      {
        address,
        asset: 'USDC',
        network: 'ethereum',
      },
      {
        Token: this.apiKey,
      }
    )
  }

  /**
   * Get risk assessment for an address
   */
  private getAddress Risk(runtime: Runtime<any>, address: Address): ChainalysisScreeningResult {
    const response = makeHttpGet<any>(
      runtime,
      `${this.baseUrl}/users/${address}/risk`,
      {
        Token: this.apiKey,
      }
    )

    const isSanctioned = this.checkSanctionsExposure(response.exposures || [])
    const riskScore = this.calculateRiskScore(response.exposures || [])

    return {
      address,
      isSanctioned,
      riskScore,
      exposures: response.exposures || [],
      detailedReport: JSON.stringify(response, null, 2),
      confidence: response.confidence || 85,
    }
  }

  /**
   * Check if address has sanctions exposure
   */
  private checkSanctionsExposure(exposures: any[]): boolean {
    return exposures.some(
      (exp) =>
        exp.category.toLowerCase().includes('sanction') ||
        exp.category.toLowerCase().includes('ofac') ||
        exp.value > 0.01
    )
  }

  /**
   * Calculate overall risk score from exposures
   */
  private calculateRiskScore(exposures: any[]): number {
    if (exposures.length === 0) return 0

    const weights: Record<string, number> = {
      sanctions: 100,
      'stolen funds': 90,
      darknet: 80,
      scam: 70,
      ransomware: 95,
      'child abuse': 100,
      terrorism: 100,
    }

    let totalRisk = 0
    let totalWeight = 0

    for (const exposure of exposures) {
      const category = exposure.category.toLowerCase()
      const weight = weights[category] || 50
      totalRisk += exposure.value * weight
      totalWeight += exposure.value
    }

    return totalWeight > 0 ? Math.min(100, totalRisk / totalWeight) : 0
  }
}
