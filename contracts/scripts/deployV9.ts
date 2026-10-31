import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV9 to Arbitrum Mainnet
 *
 * V9 BULLETPROOF Features:
 * - All V8.2.1 features (trailing stop, user control, etc.)
 * - userInstantClose(): User closes AND gets balance IMMEDIATELY
 * - emergencyWithdraw(): Pro-rata withdrawal if contract underfunded
 * - reconcile(): Anyone can heal stuck positions on-chain
 * - Bug fix: Save values before delete in userInstantClose
 *
 * Run: npx hardhat run scripts/deployV9.ts --network arbitrum
 */

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV9 (BULLETPROOF) Deployment");
  console.log("Network: Arbitrum Mainnet");
  console.log("=".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.0005")) {
    throw new Error("Insufficient ETH for deployment. Need at least 0.0005 ETH");
  }

  // Bot and Treasury addresses (same as V8)
  const BOT_ADDRESS = "0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E";
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c";

  console.log("\n--- Constructor Parameters ---");
  console.log("Bot Address:", BOT_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);

  // Deploy V9
  console.log("\n--- Deploying MonadierTradingVaultV9 ---");

  const VaultV9 = await ethers.getContractFactory("MonadierTradingVaultV9");
  const vault = await VaultV9.deploy(
    BOT_ADDRESS,
    TREASURY_ADDRESS
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("✅ V9 Vault deployed to:", vaultAddress);

  // Test basic functions
  console.log("\n--- Testing Contract ---");
  try {
    const executionFee = await vault.getExecutionFee();
    console.log("GMX Execution Fee:", ethers.formatEther(executionFee), "ETH");

    const health = await vault.getHealthStatus();
    console.log("Health Status: TVL=$" + ethers.formatUnits(health.totalValueLocked, 6));
  } catch (e) {
    console.log("⚠️ Contract test failed (expected for fresh deploy)");
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
      console.log("Manual verify:");
      console.log(`npx hardhat verify --network arbitrum ${vaultAddress} ${BOT_ADDRESS} ${TREASURY_ADDRESS}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - V9 BULLETPROOF");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Address:", vaultAddress);
  console.log("📋 Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\n🔧 Update these files:");
  console.log("1. bot-service/.env: ARBITRUM_VAULT_ADDRESS=" + vaultAddress);
  console.log("2. frontend src/lib/vault.ts: Update V9 address");
  console.log("\n✅ V9 NEW Features:");
  console.log("- userInstantClose(): Immediate balance credit without waiting");
  console.log("- emergencyWithdraw(): Pro-rata withdrawal if underfunded");
  console.log("- reconcile(): Anyone can heal stuck positions");
  console.log("- getPositionPnL(): Live P/L view function");
  console.log("- getPrice(): Token price helper");
  console.log("\n✅ Inherited from V8.2.1:");
  console.log("- User can close position anytime (userClosePosition)");
  console.log("- Trailing stop loss");
  console.log("- Limited approvals per trade");
  console.log("- Real balance checks");

  return { vault: vaultAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
