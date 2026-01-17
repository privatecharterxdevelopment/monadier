import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV10 to Arbitrum Mainnet
 *
 * V10 = V9 with NEW SECURE BOT WALLET
 * - Same bulletproof features as V9
 * - New bot address (old one was compromised)
 *
 * Run: npx hardhat run scripts/deployV10.ts --network arbitrum
 */

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV10 Deployment");
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

  // NEW SECURE addresses (V10) - Created by user in MetaMask
  const BOT_ADDRESS = "0xF7072A1067194648f309A215250004abe177531a";
  const TREASURY_ADDRESS = "0x64d79e57640A8d4A56Ad1d08c932B5CCF0B263a9";

  console.log("\n--- Constructor Parameters ---");
  console.log("Bot Address (NEW SECURE):", BOT_ADDRESS);
  console.log("Treasury:", TREASURY_ADDRESS);

  // Deploy V10
  console.log("\n--- Deploying MonadierTradingVaultV10 ---");

  const VaultV10 = await ethers.getContractFactory("MonadierTradingVaultV10");
  const vault = await VaultV10.deploy(
    BOT_ADDRESS,
    TREASURY_ADDRESS
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("✅ V10 Vault deployed to:", vaultAddress);

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
  console.log("DEPLOYMENT COMPLETE - V10 (SECURE BOT)");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Address:", vaultAddress);
  console.log("📋 Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\n🔧 Update these files:");
  console.log("1. bot-service/.env: ARBITRUM_VAULT_ADDRESS=" + vaultAddress);
  console.log("2. bot-service/.env: BOT_PRIVATE_KEY from /tmp/new_bot_key.txt");
  console.log("3. frontend src/lib/vault.ts: Update V10 address");
  console.log("\n⚠️  IMPORTANT: Fund new bot wallet with ETH for gas!");
  console.log("    Bot: " + BOT_ADDRESS);
  console.log("    Send ~0.005 ETH on Arbitrum");

  return { vault: vaultAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
