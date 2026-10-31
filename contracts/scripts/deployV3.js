const hre = require("hardhat");

async function main() {
  console.log("=".repeat(50));
  console.log("Deploying MonadierTradingVaultV3 (SECURE)");
  console.log("=".repeat(50));

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Base Mainnet Configuration
  const config = {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    botAddress: "0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Uniswap V2 on Base
    treasuryAddress: "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c",
    wrappedNative: "0x4200000000000000000000000000000000000006" // WETH on Base
  };

  console.log("\nDeployment Config:");
  console.log("- USDC:", config.usdc);
  console.log("- Bot:", config.botAddress);
  console.log("- Router:", config.router);
  console.log("- Treasury:", config.treasuryAddress);
  console.log("- WETH:", config.wrappedNative);

  console.log("\n🔒 V3 Security Features:");
  console.log("- Users can emergency close positions without bot");
  console.log("- Owner can ONLY withdraw platform fees");
  console.log("- No owner access to user funds");
  console.log("- Emergency close fee: 0.5%");

  const VaultV3 = await hre.ethers.getContractFactory("MonadierTradingVaultV3");

  console.log("\nDeploying contract...");
  const vault = await VaultV3.deploy(
    config.usdc,
    config.botAddress,
    config.router,
    config.treasuryAddress,
    config.wrappedNative
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("\n" + "=".repeat(50));
  console.log("✅ MonadierTradingVaultV3 deployed to:", vaultAddress);
  console.log("=".repeat(50));

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: "base",
    chainId: "8453",
    vaultAddress: vaultAddress,
    version: "V3",
    deployedAt: new Date().toISOString(),
    platformFee: "1.0%",
    emergencyCloseFee: "0.5%",
    features: [
      "openPosition",
      "closePosition",
      "emergencyClosePosition (USER CAN CLOSE)",
      "withdrawFees (OWNER FEES ONLY)",
      "trailingStop",
      "getUserPositions"
    ],
    security: [
      "No owner access to user funds",
      "Users can always withdraw",
      "Users can emergency close without bot"
    ],
    config: config
  };

  // Ensure deployments folder exists
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }

  fs.writeFileSync(
    "./deployments/base-v3-deployed.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment info saved to deployments/base-v3-deployed.json");

  console.log("\n📋 NEXT STEPS:");
  console.log("1. Update .env: BASE_VAULT_V3_ADDRESS=" + vaultAddress);
  console.log("2. Update frontend: VAULT_V3_ADDRESSES[8453] = '" + vaultAddress + "'");
  console.log("3. Verify on BaseScan (optional):");
  console.log(`   npx hardhat verify --network base ${vaultAddress} "${config.usdc}" "${config.botAddress}" "${config.router}" "${config.treasuryAddress}" "${config.wrappedNative}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
