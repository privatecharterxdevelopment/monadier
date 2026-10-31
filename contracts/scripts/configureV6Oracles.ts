import { ethers } from "hardhat";

/**
 * Configure remaining oracles and approvals for V6 Vault
 *
 * Run: npx hardhat run scripts/configureV6Oracles.ts --network arbitrum
 */

// V6 Vault address (already deployed)
const V6_VAULT_ADDRESS = "0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A";

// Token addresses (properly checksummed)
const WETH = ethers.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");
const WBTC = ethers.getAddress("0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f");
const ARB = ethers.getAddress("0x912CE59144191C1204E64559FE8253a0e49E6548");

// Chainlink oracle addresses (properly checksummed)
const CHAINLINK_ETH_USD = ethers.getAddress("0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612");
const CHAINLINK_BTC_USD = ethers.getAddress("0x6ce185860a4963106506C203335A2910413708e9");
const CHAINLINK_ARB_USD = ethers.getAddress("0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6");

// Aave Pool
const AAVE_POOL = ethers.getAddress("0x794a61358D6845594F94dc1DB02A252b5b4814aD");

async function main() {
  console.log("=".repeat(60));
  console.log("V6 Vault Oracle & Approval Configuration");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nUsing wallet:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // Get vault contract
  const vault = await ethers.getContractAt("MonadierTradingVaultV6", V6_VAULT_ADDRESS);
  console.log("\nV6 Vault:", V6_VAULT_ADDRESS);

  // Check which oracles are already configured
  console.log("\n--- Checking Oracle Status ---");

  let wethConfigured = false;
  let wbtcConfigured = false;
  let arbConfigured = false;

  try {
    await vault.getOraclePrice(WETH);
    wethConfigured = true;
    console.log("✅ WETH/USD oracle: Already configured");
  } catch {
    console.log("❌ WETH/USD oracle: Not configured");
  }

  try {
    await vault.getOraclePrice(WBTC);
    wbtcConfigured = true;
    console.log("✅ WBTC/USD oracle: Already configured");
  } catch {
    console.log("❌ WBTC/USD oracle: Not configured");
  }

  try {
    await vault.getOraclePrice(ARB);
    arbConfigured = true;
    console.log("✅ ARB/USD oracle: Already configured");
  } catch {
    console.log("❌ ARB/USD oracle: Not configured");
  }

  // Configure missing oracles
  console.log("\n--- Configuring Missing Oracles ---");

  if (!wethConfigured) {
    console.log("Configuring WETH/USD oracle...");
    const tx = await vault.configureOracle(WETH, CHAINLINK_ETH_USD);
    await tx.wait();
    console.log("✅ WETH/USD oracle configured");
  }

  if (!wbtcConfigured) {
    console.log("Configuring WBTC/USD oracle...");
    console.log("  Token:", WBTC);
    console.log("  Oracle:", CHAINLINK_BTC_USD);
    const tx = await vault.configureOracle(WBTC, CHAINLINK_BTC_USD);
    await tx.wait();
    console.log("✅ WBTC/USD oracle configured");
  }

  if (!arbConfigured) {
    console.log("Configuring ARB/USD oracle...");
    console.log("  Token:", ARB);
    console.log("  Oracle:", CHAINLINK_ARB_USD);
    const tx = await vault.configureOracle(ARB, CHAINLINK_ARB_USD);
    await tx.wait();
    console.log("✅ ARB/USD oracle configured");
  }

  // Approve tokens for Aave
  console.log("\n--- Approving Tokens for Aave ---");

  console.log("Approving WETH...");
  const tx1 = await vault.approveToken(WETH, AAVE_POOL);
  await tx1.wait();
  console.log("✅ WETH approved");

  console.log("Approving WBTC...");
  const tx2 = await vault.approveToken(WBTC, AAVE_POOL);
  await tx2.wait();
  console.log("✅ WBTC approved");

  console.log("Approving ARB...");
  const tx3 = await vault.approveToken(ARB, AAVE_POOL);
  await tx3.wait();
  console.log("✅ ARB approved");

  // Test oracle prices
  console.log("\n--- Testing Oracle Prices ---");

  try {
    const ethPrice = await vault.getOraclePrice(WETH);
    console.log("ETH/USD:", ethers.formatUnits(ethPrice, 8), "USD");
  } catch (e: any) {
    console.log("⚠️ ETH oracle read failed:", e.message);
  }

  try {
    const btcPrice = await vault.getOraclePrice(WBTC);
    console.log("BTC/USD:", ethers.formatUnits(btcPrice, 8), "USD");
  } catch (e: any) {
    console.log("⚠️ BTC oracle read failed:", e.message);
  }

  try {
    const arbPrice = await vault.getOraclePrice(ARB);
    console.log("ARB/USD:", ethers.formatUnits(arbPrice, 8), "USD");
  } catch (e: any) {
    console.log("⚠️ ARB oracle read failed:", e.message);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("CONFIGURATION COMPLETE");
  console.log("=".repeat(60));
  console.log("\n📋 V6 Vault:", V6_VAULT_ADDRESS);
  console.log("📋 Network: Arbitrum Mainnet");
  console.log("📋 Explorer: https://arbiscan.io/address/" + V6_VAULT_ADDRESS);
  console.log("\n🔧 Next Steps:");
  console.log("1. Update .env: ARBITRUM_VAULT_V6_ADDRESS=" + V6_VAULT_ADDRESS);
  console.log("2. Restart bot-service");
  console.log("3. Test with small position");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Configuration failed:", error);
    process.exit(1);
  });
