const hre = require("hardhat");

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying MonadierTradingVaultV5 on ARBITRUM");
  console.log("Uniswap V3 with 0.05% fee tier");
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Arbitrum Mainnet Configuration
  const config = {
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",           // USDC on Arbitrum
    botAddress: "0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E",    // Same bot wallet
    swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",    // Uniswap V3 SwapRouter
    treasuryAddress: "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c", // Same treasury
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"  // WETH on Arbitrum
  };

  console.log("\nDeployment Config (Arbitrum):");
  console.log("- USDC:", config.usdc);
  console.log("- Bot:", config.botAddress);
  console.log("- SwapRouter (V3):", config.swapRouter);
  console.log("- Treasury:", config.treasuryAddress);
  console.log("- WETH:", config.wrappedNative);

  console.log("\n💎 V5 Features:");
  console.log("- Uniswap V3 with 0.05% pool fee (NOT 0.3%!)");
  console.log("- Base Fee: 0.1% (NOT 1%!)");
  console.log("- Success Fee: 10% of profit only");
  console.log("- Minimum Vault: $100 USD");
  console.log("- Cooldown: 5 minutes");
  console.log("- Trading Pairs: WETH, WBTC, ARB");

  console.log("\n📊 Fee Comparison:");
  console.log("- Old (V4): 1% + 1% = 2% + 0.6% Uniswap = 2.6%");
  console.log("- New (V5): 0.1% + 0.1% Uniswap = 0.2% + 10% profit");

  const VaultV5 = await hre.ethers.getContractFactory("MonadierTradingVaultV5");

  console.log("\nDeploying contract...");
  const vault = await VaultV5.deploy(
    config.usdc,
    config.botAddress,
    config.swapRouter,
    config.treasuryAddress,
    config.wrappedNative
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("\n" + "=".repeat(60));
  console.log("✅ MonadierTradingVaultV5 deployed to:", vaultAddress);
  console.log("=".repeat(60));

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: "arbitrum",
    chainId: "42161",
    vaultAddress: vaultAddress,
    version: "V5",
    deployedAt: new Date().toISOString(),
    fees: {
      baseFee: "0.1%",
      successFee: "10% of profit",
      uniswapPoolFee: "0.05%"
    },
    rules: {
      minVaultBalance: "$100 USD",
      cooldown: "5 minutes"
    },
    tradingPairs: ["WETH/USDC", "WBTC/USDC", "ARB/USDC"],
    features: [
      "Uniswap V3 integration (0.05% pools)",
      "Profit-based success fee",
      "Position cost tracking",
      "Emergency close for users",
      "5-minute cooldown"
    ],
    config: config
  };

  // Ensure deployments folder exists
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }

  fs.writeFileSync(
    "./deployments/arbitrum-v5-deployed.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment info saved to deployments/arbitrum-v5-deployed.json");

  console.log("\n📋 NEXT STEPS:");
  console.log("1. Update .env: ARBITRUM_VAULT_V5_ADDRESS=" + vaultAddress);
  console.log("2. Update bot-service config for Arbitrum");
  console.log("3. Update frontend VAULT_V5_ADDRESSES");
  console.log("4. Verify on Arbiscan:");
  console.log(`   npx hardhat verify --network arbitrum ${vaultAddress} "${config.usdc}" "${config.botAddress}" "${config.swapRouter}" "${config.treasuryAddress}" "${config.wrappedNative}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
