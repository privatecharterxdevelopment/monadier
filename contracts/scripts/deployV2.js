const hre = require("hardhat");

async function main() {
  console.log("Deploying MonadierTradingVaultV2...");

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

  const VaultV2 = await hre.ethers.getContractFactory("MonadierTradingVaultV2");

  console.log("\nDeploying contract...");
  const vault = await VaultV2.deploy(
    config.usdc,
    config.botAddress,
    config.router,
    config.treasuryAddress,
    config.wrappedNative
  );

  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("\n✅ MonadierTradingVaultV2 deployed to:", vaultAddress);

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network: "base",
    chainId: "8453",
    vaultAddress: vaultAddress,
    version: "V2",
    deployedAt: new Date().toISOString(),
    platformFee: "1.0%",
    features: ["openPosition", "closePosition", "trailingStop"],
    config: config
  };

  fs.writeFileSync(
    "./deployments/base-v2-deployed.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment info saved to deployments/base-v2-deployed.json");

  // Verify on BaseScan (optional)
  console.log("\nTo verify on BaseScan:");
  console.log(`npx hardhat verify --network base ${vaultAddress} "${config.usdc}" "${config.botAddress}" "${config.router}" "${config.treasuryAddress}" "${config.wrappedNative}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
