const hre = require("hardhat");
const fs = require("fs");

// Chain-specific addresses
const CHAIN_CONFIG = {
  // Base (8453) - 1% fee
  base: {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Uniswap V2 on Base
    weth: "0x4200000000000000000000000000000000000006"
  },
  // Ethereum (1) - 3.5% fee
  ethereum: {
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  },
  // Polygon (137) - 3.5% fee
  polygon: {
    usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap
    weth: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"
  },
  // Arbitrum (42161) - 3.5% fee
  arbitrum: {
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Uniswap V2 on Arbitrum
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
  },
  // BSC (56) - 3.5% fee
  bsc: {
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap
    weth: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8"
  }
};

async function main() {
  const network = hre.network.name;
  const config = CHAIN_CONFIG[network];

  if (!config) {
    throw new Error(`Unknown network: ${network}. Use: base, ethereum, polygon, arbitrum, bsc`);
  }

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Get config from environment
  const botAddress = process.env.BOT_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;

  if (!botAddress || !treasuryAddress) {
    throw new Error("Missing BOT_ADDRESS or TREASURY_ADDRESS in .env");
  }

  console.log("\n=== Deployment Configuration ===");
  console.log("Network:", network);
  console.log("USDC:", config.usdc);
  console.log("Bot Address:", botAddress);
  console.log("Router:", config.router);
  console.log("Treasury:", treasuryAddress);
  console.log("Wrapped Native:", config.weth);
  console.log("================================\n");

  // Deploy contract
  console.log("Deploying MonadierTradingVault...");

  const Vault = await hre.ethers.getContractFactory("MonadierTradingVault");
  const vault = await Vault.deploy(
    config.usdc,
    botAddress,
    config.router,
    treasuryAddress,
    config.weth
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("\n=== Deployment Successful ===");
  console.log("Vault Address:", vaultAddress);
  console.log("=============================\n");

  // Verify platform fee
  const fee = await vault.getPlatformFee();
  console.log("Platform Fee:", fee.toString(), "bps (", Number(fee) / 100, "%)");

  // Save deployment info
  const deploymentInfo = {
    network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    vaultAddress,
    deployedAt: new Date().toISOString(),
    config: {
      usdc: config.usdc,
      botAddress,
      router: config.router,
      treasuryAddress,
      wrappedNative: config.weth
    }
  };

  const filename = `deployments/${network}-${Date.now()}.json`;
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", filename);

  // Verify on explorer (if API key provided)
  if (process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting 30s before verification...");
    await new Promise(r => setTimeout(r, 30000));

    try {
      await hre.run("verify:verify", {
        address: vaultAddress,
        constructorArguments: [
          config.usdc,
          botAddress,
          config.router,
          treasuryAddress,
          config.weth
        ]
      });
      console.log("Contract verified on block explorer!");
    } catch (err) {
      console.log("Verification failed:", err.message);
    }
  }

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Update /src/lib/vault.ts with:");
  console.log(`   ${(await hre.ethers.provider.getNetwork()).chainId}: '${vaultAddress}' as \`0x\${string}\`,`);
  console.log("\n2. Update /bot-service/.env with:");
  console.log(`   ${network.toUpperCase()}_VAULT_ADDRESS=${vaultAddress}`);
  console.log("==================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
