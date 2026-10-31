import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV7 to Arbitrum Mainnet
 *
 * Features:
 * - GMX Perpetuals Integration
 * - TRUE 50x Max Leverage
 * - No Aave limitations
 * - Keeper-based execution
 *
 * Run: npx hardhat run scripts/deployV7GMX.ts --network arbitrum
 */

// ============ ARBITRUM MAINNET ADDRESSES ============

const ARBITRUM_ADDRESSES = {
  // Tokens
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",      // Native USDC
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",      // Wrapped ETH
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",      // Wrapped BTC

  // GMX Contracts
  GMX_VAULT: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  GMX_ROUTER: "0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064",
  GMX_POSITION_ROUTER: "0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868",
  GMX_ORDER_BOOK: "0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB",
};

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV7 (GMX) Deployment");
  console.log("Network: Arbitrum Mainnet");
  console.log("=".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.002")) {
    throw new Error("Insufficient ETH for deployment. Need at least 0.002 ETH");
  }

  // Get addresses - BOT MUST be the bot service wallet!
  const BOT_ADDRESS = "0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E"; // Bot service wallet (FIXED!)
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c";

  console.log("\n--- Constructor Parameters ---");
  console.log("Bot Address:", BOT_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("\n--- GMX Contracts ---");
  console.log("GMX Vault:", ARBITRUM_ADDRESSES.GMX_VAULT);
  console.log("GMX Router:", ARBITRUM_ADDRESSES.GMX_ROUTER);
  console.log("GMX Position Router:", ARBITRUM_ADDRESSES.GMX_POSITION_ROUTER);

  // Deploy V7
  console.log("\n--- Deploying MonadierTradingVaultV7 ---");

  const VaultV7 = await ethers.getContractFactory("MonadierTradingVaultV7");
  const vault = await VaultV7.deploy(
    BOT_ADDRESS,
    TREASURY_ADDRESS
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("✅ V7 Vault deployed to:", vaultAddress);

  // Verify contract info
  console.log("\n--- Contract Info ---");
  const info = await vault.getContractInfo();
  console.log("TVL:", ethers.formatUnits(info[0], 6), "USDC");
  console.log("Platform Fees:", ethers.formatUnits(info[1], 6), "USDC");
  console.log("Min Balance:", ethers.formatUnits(info[2], 6), "USDC");
  console.log("Max Leverage (Standard):", info[3].toString(), "x");
  console.log("Max Leverage (Elite):", info[4].toString(), "x");

  // Test GMX connection
  console.log("\n--- Testing GMX Connection ---");
  try {
    const [maxPrice, minPrice] = await vault.getPrice(ARBITRUM_ADDRESSES.WETH);
    console.log("ETH Max Price:", ethers.formatUnits(maxPrice, 30), "USD");
    console.log("ETH Min Price:", ethers.formatUnits(minPrice, 30), "USD");
  } catch (e) {
    console.log("⚠️ GMX price test failed (may be network issue)");
  }

  try {
    const executionFee = await vault.getExecutionFee();
    console.log("GMX Execution Fee:", ethers.formatEther(executionFee), "ETH");
  } catch (e) {
    console.log("⚠️ Execution fee test failed");
  }

  // Verify on Arbiscan
  console.log("\n--- Verifying on Arbiscan ---");
  try {
    await run("verify:verify", {
      address: vaultAddress,
      constructorArguments: [
        BOT_ADDRESS,
        TREASURY_ADDRESS,
      ],
    });
    console.log("✅ Contract verified on Arbiscan");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ Contract already verified");
    } else {
      console.log("⚠️ Verification failed:", e.message);
      console.log("You can verify manually with:");
      console.log(`npx hardhat verify --network arbitrum ${vaultAddress} ${BOT_ADDRESS} ${TREASURY_ADDRESS}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - GMX V7");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Address:", vaultAddress);
  console.log("📋 Network: Arbitrum Mainnet (Chain ID: 42161)");
  console.log("📋 Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\n🔧 Next Steps:");
  console.log("1. Update bot-service config with V7 vault address:");
  console.log(`   ARBITRUM_VAULT_V7_ADDRESS=${vaultAddress}`);
  console.log("2. Update frontend vault.ts with V7 address");
  console.log("3. Fund bot wallet with ETH for GMX execution fees");
  console.log("4. Test with small deposit (~$50 USDC)");
  console.log("\n⚠️ IMPORTANT:");
  console.log("- Bot wallet needs ~0.01 ETH for GMX execution fees");
  console.log("- Users need to deposit USDC before trading");
  console.log("- Max leverage is 50x via GMX - use with EXTREME caution!");
  console.log("- GMX positions execute via keepers (slight delay)");

  // Save deployment info
  const deploymentInfo = {
    network: "arbitrum",
    chainId: 42161,
    vault: vaultAddress,
    version: "V7-GMX",
    deployer: deployer.address,
    botAddress: BOT_ADDRESS,
    treasury: TREASURY_ADDRESS,
    timestamp: new Date().toISOString(),
    features: {
      maxLeverage: 50,
      protocol: "GMX",
      execution: "Keeper-based",
      tokens: ["WETH", "WBTC"]
    },
    gmxAddresses: {
      vault: ARBITRUM_ADDRESSES.GMX_VAULT,
      router: ARBITRUM_ADDRESSES.GMX_ROUTER,
      positionRouter: ARBITRUM_ADDRESSES.GMX_POSITION_ROUTER,
      orderBook: ARBITRUM_ADDRESSES.GMX_ORDER_BOOK,
    }
  };

  console.log("\n📄 Deployment Info (save this!):");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
