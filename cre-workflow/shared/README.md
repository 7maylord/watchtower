# Shared API Client Libraries

This directory contains production-grade API integrations for the Watchtower CRE workflows.

## Modules

### utils.ts

Core utilities used across all workflows:

- `ResilientHTTPClient` - HTTP client with automatic retry and exponential backoff
- `StructuredLogger` - Consistent logging with context
- `RateLimiter` - Token bucket rate limiting
- `SimpleCache` - In-memory TTL cache
- `withErrorHandling` - Error wrapper with context

### chainalysis.ts

**Chainalysis KYT API Integration**

Provides cryptocurrency address screening for:

- OFAC sanctions list checking
- Illicit activity detection (darknet, stolen funds, scams)
- Risk scoring (0-100)
- Batch screening support

Usage:

```typescript
const client = new ChainalysisClient(runtime, apiKey);
const result = await client.screenAddress(address);
// result: { isSanctioned, riskScore, exposures, ... }
```

### gemini.ts

**Google Gemini AI Integration**

AI-powered analysis for:

- Portfolio risk assessment
- Rebalancing recommendations
- Market condition analysis

Usage:

```typescript
const client = new GeminiClient(runtime, apiKey);
const analysis = await client.analyzePortfolioRisk({
  totalAssets: "$1,000,000",
  currentRiskScore: 45,
});
// analysis: { analysis, confidence, reasoning, recommendations }
```

### pinata.ts

**Pinata IPFS Integration**

Decentralized storage for:

- Risk analysis reports
- Compliance screening records
- Proof of reserve attestations
- Rebalancing advisories

Usage:

```typescript
const client = new PinataClient(runtime, apiKey, apiSecret);
const ipfsHash = await client.uploadRiskReport(report);
// Returns: CID for IPFS retrieval
```

## Error Handling

All clients use:

- Automatic retry with exponential backoff (3 attempts)
- Structured error logging with context
- Graceful degradation on API failures

## Rate Limiting

- Chainalysis: 100ms between requests
- Gemini: Respects API quotas automatically
- Pinata: No explicit limiting (generous limits)

## Security

API keys should be managed via CRE secrets:

- `CHAINALYSIS_API_KEY`
- `GEMINI_API_KEY`
- `PINATA_API_KEY`
- `PINATA_API_SECRET`
