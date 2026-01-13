import { ethers, run } from "hardhat";

/**
 * Deploy MonadierTradingVaultV6 to Arbitrum Mainnet
 *
 * Features:
 * - Isolated Margin (per-position collateral)
 * - 20x Max Leverage via Aave V3
 * - Chainlink Oracle integration
 * - On-chain Stop-Loss & Take-Profit
 *
 * Run: npx hardhat run scripts/deployV6.ts --network arbitrum
 */

// ============ ARBITRUM MAINNET ADDRESSES ============

const ARBITRUM_ADDRESSES = {
  // Tokens
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",      // Native USDC on Arbitrum
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",      // Wrapped ETH
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",      // Wrapped BTC
  ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548",       // ARB token

  // DEX
  UNISWAP_V3_ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",

  // Aave V3
  AAVE_POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",

  // Chainlink Price Feeds (8 decimals)
  CHAINLINK_ETH_USD: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  CHAINLINK_BTC_USD: "0x6ce185860a4963106506C203335A2910413708e9",
  CHAINLINK_ARB_USD: "0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6",
};

async function main() {
  console.log("=".repeat(60));
  console.log("MonadierTradingVaultV6 Deployment");
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

  // Get addresses from environment or use defaults
  const BOT_ADDRESS = process.env.BOT_WALLET_ADDRESS || deployer.address;
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0xF7351a5C63e0403F6F7FC77d31B5e17A229C469c";

  console.log("\n--- Constructor Parameters ---");
  console.log("USDC:", ARBITRUM_ADDRESSES.USDC);
  console.log("Bot Address:", BOT_ADDRESS);
  console.log("Swap Router:", ARBITRUM_ADDRESSES.UNISWAP_V3_ROUTER);
  console.log("Aave Pool:", ARBITRUM_ADDRESSES.AAVE_POOL);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("WETH:", ARBITRUM_ADDRESSES.WETH);

  // Deploy V6
  console.log("\n--- Deploying MonadierTradingVaultV6 ---");

  const VaultV6 = await ethers.getContractFactory("MonadierTradingVaultV6");
  const vault = await VaultV6.deploy(
    ARBITRUM_ADDRESSES.USDC,
    BOT_ADDRESS,
    ARBITRUM_ADDRESSES.UNISWAP_V3_ROUTER,
    ARBITRUM_ADDRESSES.AAVE_POOL,
    TREASURY_ADDRESS,
    ARBITRUM_ADDRESSES.WETH
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("✅ V6 Vault deployed to:", vaultAddress);

  // Configure Chainlink Oracles
  console.log("\n--- Configuring Chainlink Oracles ---");

  // WETH Oracle
  console.log("Configuring WETH/USD oracle...");
  const tx1 = await vault.configureOracle(
    ARBITRUM_ADDRESSES.WETH,
    ARBITRUM_ADDRESSES.CHAINLINK_ETH_USD
  );
  await tx1.wait();
  console.log("✅ WETH/USD oracle configured");

  // WBTC Oracle
  console.log("Configuring WBTC/USD oracle...");
  const tx2 = await vault.configureOracle(
    ARBITRUM_ADDRESSES.WBTC,
    ARBITRUM_ADDRESSES.CHAINLINK_BTC_USD
  );
  await tx2.wait();
  console.log("✅ WBTC/USD oracle configured");

  // ARB Oracle
  console.log("Configuring ARB/USD oracle...");
  const tx3 = await vault.configureOracle(
    ARBITRUM_ADDRESSES.ARB,
    ARBITRUM_ADDRESSES.CHAINLINK_ARB_USD
  );
  await tx3.wait();
  console.log("✅ ARB/USD oracle configured");

  // Approve tokens for Aave
  console.log("\n--- Approving Tokens for Aave ---");

  const tx4 = await vault.approveToken(ARBITRUM_ADDRESSES.WETH, ARBITRUM_ADDRESSES.AAVE_POOL);
  await tx4.wait();
  console.log("✅ WETH approved for Aave");

  const tx5 = await vault.approveToken(ARBITRUM_ADDRESSES.WBTC, ARBITRUM_ADDRESSES.AAVE_POOL);
  await tx5.wait();
  console.log("✅ WBTC approved for Aave");

  const tx6 = await vault.approveToken(ARBITRUM_ADDRESSES.ARB, ARBITRUM_ADDRESSES.AAVE_POOL);
  await tx6.wait();
  console.log("✅ ARB approved for Aave");

  // Verify contract info
  console.log("\n--- Contract Info ---");
  const info = await vault.getContractInfo();
  console.log("TVL:", ethers.formatUnits(info.tvl, 6), "USDC");
  console.log("Max Leverage:", info.maxLeverage.toString(), "x");
  console.log("Base Fee:", (Number(info.baseFee) / 100).toString(), "%");
  console.log("Success Fee:", (Number(info.successFee) / 100).toString(), "%");

  // Test oracle prices
  console.log("\n--- Testing Oracle Prices ---");
  try {
    const ethPrice = await vault.getOraclePrice(ARBITRUM_ADDRESSES.WETH);
    console.log("ETH/USD:", ethers.formatUnits(ethPrice, 8), "USD");
  } catch (e) {
    console.log("⚠️ ETH oracle test failed (may be network issue)");
  }

  try {
    const btcPrice = await vault.getOraclePrice(ARBITRUM_ADDRESSES.WBTC);
    console.log("BTC/USD:", ethers.formatUnits(btcPrice, 8), "USD");
  } catch (e) {
    console.log("⚠️ BTC oracle test failed (may be network issue)");
  }

  try {
    const arbPrice = await vault.getOraclePrice(ARBITRUM_ADDRESSES.ARB);
    console.log("ARB/USD:", ethers.formatUnits(arbPrice, 8), "USD");
  } catch (e) {
    console.log("⚠️ ARB oracle test failed (may be network issue)");
  }

  // Verify on Arbiscan
  console.log("\n--- Verifying on Arbiscan ---");
  try {
    await run("verify:verify", {
      address: vaultAddress,
      constructorArguments: [
        ARBITRUM_ADDRESSES.USDC,
        BOT_ADDRESS,
        ARBITRUM_ADDRESSES.UNISWAP_V3_ROUTER,
        ARBITRUM_ADDRESSES.AAVE_POOL,
        TREASURY_ADDRESS,
        ARBITRUM_ADDRESSES.WETH,
      ],
    });
    console.log("✅ Contract verified on Arbiscan");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ Contract already verified");
    } else {
      console.log("⚠️ Verification failed:", e.message);
      console.log("You can verify manually with:");
      console.log(`npx hardhat verify --network arbitrum ${vaultAddress} ${ARBITRUM_ADDRESSES.USDC} ${BOT_ADDRESS} ${ARBITRUM_ADDRESSES.UNISWAP_V3_ROUTER} ${ARBITRUM_ADDRESSES.AAVE_POOL} ${TREASURY_ADDRESS} ${ARBITRUM_ADDRESSES.WETH}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Address:", vaultAddress);
  console.log("📋 Network: Arbitrum Mainnet (Chain ID: 42161)");
  console.log("📋 Explorer: https://arbiscan.io/address/" + vaultAddress);
  console.log("\n🔧 Next Steps:");
  console.log("1. Update bot-service with new vault address");
  console.log("2. Update frontend with new ABI");
  console.log("3. Test with small deposit");
  console.log("\n⚠️ IMPORTANT:");
  console.log("- Bot wallet needs ETH for gas");
  console.log("- Users need to deposit USDC before trading");
  console.log("- Max leverage is 20x - use with caution!");

  // Save deployment info
  const deploymentInfo = {
    network: "arbitrum",
    chainId: 42161,
    vault: vaultAddress,
    deployer: deployer.address,
    botAddress: BOT_ADDRESS,
    treasury: TREASURY_ADDRESS,
    timestamp: new Date().toISOString(),
    addresses: ARBITRUM_ADDRESSES,
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
