import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV8 to Arbitrum Mainnet
 *
 * V8.2.1 FINAL Features:
 * - All V7 bug fixes (double transfer, TVL underflow, cancelled positions)
 * - Security hardening (limited approvals, safe recovery, real-balance checks)
 * - User control (userClosePosition, cancelAutoFeatures)
 * - Trailing stop loss
 * - Keeper priority check
 *
 * Run: npx hardhat run scripts/deployV8.ts --network arbitrum
 */

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV8 (V8.2.1 FINAL) Deployment");
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

  // Bot and Treasury addresses
  const BOT_ADDRESS = "0xC9a6D02a04e3B2E8d3941615EfcBA67593F46b8E";
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c";

  console.log("\n--- Constructor Parameters ---");
  console.log("Bot Address:", BOT_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);

  // Deploy V8
  console.log("\n--- Deploying MonadierTradingVaultV8 ---");

  const VaultV8 = await ethers.getContractFactory("MonadierTradingVaultV8");
  const vault = await VaultV8.deploy(
    BOT_ADDRESS,
    TREASURY_ADDRESS
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("✅ V8 Vault deployed to:", vaultAddress);

  // Test basic functions
  console.log("\n--- Testing Contract ---");
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
      console.log("Manual verify:");
      console.log(`npx hardhat verify --network arbitrum ${vaultAddress} ${BOT_ADDRESS} ${TREASURY_ADDRESS}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - V8.2.1 FINAL");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Address:", vaultAddress);
  console.log("📋 Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\n🔧 Update these files:");
  console.log("1. bot-service: ARBITRUM_VAULT_V8_ADDRESS=" + vaultAddress);
  console.log("2. frontend vault.ts: V8_ADDRESS");
  console.log("\n✅ V8.2.1 Features:");
  console.log("- User can close position anytime (userClosePosition)");
  console.log("- Trailing stop loss");
  console.log("- Limited approvals per trade");
  console.log("- Real balance checks");
  console.log("- Keeper priority check");

  return { vault: vaultAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
