# Local Development Setup

This guide explains how to run Watchtower CRE workflows locally using environment variables.

## Prerequisites

1. **Bun Runtime**
2. **API Keys** - Obtain from providers (see below)
3. **Sepolia Testnet**

## Step 1: Configure Environment Variables

Copy the example file and add your API keys, Then edit `.env` and add your actual API keys:

```bash
# Required for all workflows
GEMINI_API_KEY=your_actual_gemini_key
PINATA_API_KEY=your_actual_pinata_key
PINATA_API_SECRET=your_actual_pinata_secret

# Required for Compliance Screening only
CHAINALYSIS_API_KEY=your_actual_chainalysis_key
```

### Where to Get API Keys

**Google Gemini API** (Free tier available):

- Visit: https://aistudio.google.com/app/apikey
- Click "Create API key"
- Copy the key

**Pinata IPFS** (Free tier: 1GB storage):

- Visit: https://app.pinata.cloud/keys
- Create new API key with admin permissions
- Copy both API Key and API Secret

**Chainalysis KYT** (Trial available):

- Contact: https://go.chainalysis.com/chainalysis-kyt.html
- Request trial access
- Obtain API token

## Step 2: Test Individual Workflows

### Portfolio Health Workflow

```bash
cd portfolio-health-workflow
cre workflow simulate ./
```

Expected output:

- ✅ Gemini AI risk analysis
- ✅ IPFS report upload
- ✅ RiskOracle update transaction

### Compliance Screening Workflow

```bash
cd compliance-screening-workflow
cre workflow simulate ./
```

Expected output:

- ✅ Chainalysis KYT screening
- ✅ IPFS compliance report
- ✅ ComplianceRegistry update

### Proof of Reserve Workflow

```bash
cd proof-of-reserve-workflow
cre workflow simulate ./
```

Expected output:

- ✅ On-chain balance verification
- ✅ IPFS attestation upload
- ✅ ProofOfReserveOracle update

### Rebalancing Advisor Workflow

```bash
cd rebalancing-advisor-workflow
cre workflow simulate ./
```

Expected output:

- ✅ Gemini AI strategy recommendations
- ✅ IPFS advisory report
- ✅ Advisory output

## Step 3: Monitor API Usage

Watch for:

- **Gemini API**: Rate limits (60 requests/min on free tier)
- **Pinata**: Storage quota (1GB free)
- **Chainalysis**: Request quota (varies by plan)

## Step 4: Verify IPFS Uploads

After running workflows, check Pinata dashboard:

- Visit: https://app.pinata.cloud/pinmanager
- View uploaded reports
- Verify CIDs match workflow output

## Common Issues

### "API key not found" Error

- Ensure `.env` file exists in `cre-workflow/` directory
- Check API keys don't have quotes or extra spaces
- Verify environment variables are loaded: `echo $GEMINI_API_KEY`

### "Rate limit exceeded" Error

- Wait 60 seconds for Gemini API
- Reduce simulation frequency
- Upgrade to paid API tier if needed

### "IPFS upload failed" Error

- Check Pinata API key permissions (need "pinFileToIPFS" access)
- Verify not exceeding storage quota
- Check internet connectivity
