#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const contracts = [
  { name: "FundVault", exportName: "FundVaultAbi" },
  { name: "RiskOracle", exportName: "RiskOracleAbi" },
  { name: "ComplianceRegistry", exportName: "ComplianceRegistryAbi" },
  { name: "ProofOfReserveOracle", exportName: "ProofOfReserveOracleAbi" },
];

contracts.forEach((contract) => {
  // Foundry outputs to out/<ContractName>.sol/<ContractName>.json
  const jsonPath = path.join(
    __dirname,
    "..",
    "smart-contracts",
    "out",
    `${contract.name}.sol`,
    `${contract.name}.json`,
  );

  const contractJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const abi = contractJson.abi;

  const tsContent = `export const ${contract.exportName} = ${JSON.stringify(abi, null, 2)} as const\n`;

  fs.writeFileSync(`./contracts/abi/${contract.name}.ts`, tsContent);
  console.log(`✅ Created ${contract.name}.ts`);
});

console.log("\n✅ All Watchtower ABIs created successfully!");
