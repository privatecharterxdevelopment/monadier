import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV11 to Arbitrum Mainnet
 *
 * V11 = V10 with reconcile() phantom profit bug fix
 * - Same wallets as V10
 * - reconcile() now returns original collateral only (no PnL estimation)
 *
 * Run: npx hardhat run scripts/deployV11.ts --network arbitrum
 */

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV11 Deployment");
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

  // Same wallets as V10
  const BOT_ADDRESS = "0xF7072A1067194648f309A215250004abe177531a";
  const TREASURY_ADDRESS = "0x64d79e57640A8d4A56Ad1d08c932B5CCF0B263a9";

  console.log("\n--- Constructor Parameters ---");
  console.log("Bot Address (same as V10):", BOT_ADDRESS);
  console.log("Treasury (same as V10):", TREASURY_ADDRESS);

  // Deploy V11
  console.log("\n--- Deploying MonadierTradingVaultV11 ---");

  const VaultV11 = await ethers.getContractFactory("MonadierTradingVaultV11");
  const vault = await VaultV11.deploy(
    BOT_ADDRESS,
    TREASURY_ADDRESS
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("V11 Vault deployed to:", vaultAddress);

  // Test basic functions
  console.log("\n--- Testing Contract ---");
  try {
    const executionFee = await vault.getExecutionFee();
    console.log("GMX Execution Fee:", ethers.formatEther(executionFee), "ETH");

    const health = await vault.getHealthStatus();
    console.log("Health Status: TVL=$" + ethers.formatUnits(health.totalValueLocked, 6));
  } catch (e) {
    console.log("Contract test failed (expected for fresh deploy)");
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
    console.log("Contract verified on Arbiscan");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("Contract already verified");
    } else {
      console.log("Verification failed:", e.message);
      console.log("Manual verify:");
      console.log(`npx hardhat verify --network arbitrum ${vaultAddress} ${BOT_ADDRESS} ${TREASURY_ADDRESS}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE - V11 (RECONCILE FIX)");
  console.log("=".repeat(60));
  console.log("\nContract Address:", vaultAddress);
  console.log("Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\nUpdate these files:");
  console.log("1. bot-service/.env: ARBITRUM_VAULT_ADDRESS=" + vaultAddress);
  console.log("2. frontend src/lib/vault.ts: Update to V11 address");

  return { vault: vaultAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
