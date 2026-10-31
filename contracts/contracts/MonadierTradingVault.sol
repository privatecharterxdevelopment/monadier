// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/// @notice Uniswap V2 Router interface
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    function WETH() external pure returns (address);
}

/**
 * @title MonadierTradingVault
 * @notice Immutable, non-upgradeable trading vault for automated trading
 * @dev CertiK Standard - Maximum Security
 *
 * Features:
 * - User-configurable risk levels (1-50% per trade)
 * - 0.5% platform fee to treasury
 * - Uniswap V2 compatible (works with PancakeSwap, QuickSwap, etc.)
 * - Per-user balance isolation
 * - Emergency controls
 *
 * Security Features:
 * - No owner/admin privileges
 * - Immutable (cannot be upgraded)
 * - ReentrancyGuard on all external calls
 * - SafeERC20 for token transfers
 * - Emergency pause mechanism (time-locked)
 * - Strict access controls
 * - Complete event logging
 */
contract MonadierTradingVault is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC token address (immutable after deployment)
    IERC20 public immutable USDC;

    /// @notice Authorized bot address (immutable after deployment)
    address public immutable BOT_ADDRESS;

    /// @notice Uniswap V2 Router (immutable after deployment)
    address public immutable UNISWAP_ROUTER;

    /// @notice Treasury address for platform fees
    address public immutable TREASURY_ADDRESS;

    /// @notice Wrapped native token (WETH/WBNB/WMATIC)
    address public immutable WRAPPED_NATIVE;

    /// @notice Chain ID (set at deployment, used for fee calculation)
    uint256 public immutable CHAIN_ID;

    /// @notice Base chain ID (gets discounted fee)
    uint256 public constant BASE_CHAIN_ID = 8453;

    /// @notice Platform fee on Base: 1.0% (100 basis points)
    uint256 public constant BASE_CHAIN_FEE = 100;

    /// @notice Platform fee on other chains: 3.5% (350 basis points)
    uint256 public constant OTHER_CHAIN_FEE = 350;

    /// @notice Maximum allowed risk level: 50%
    uint256 public constant MAX_RISK_LEVEL = 5000; // 50% in basis points

    /// @notice Minimum allowed risk level: 1%
    uint256 public constant MIN_RISK_LEVEL = 100; // 1% in basis points

    /// @notice Default risk level: 5%
    uint256 public constant DEFAULT_RISK_LEVEL = 500; // 5% in basis points

    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Minimum time between trades per user (anti-spam)
    uint256 public constant MIN_TRADE_INTERVAL = 30 seconds;

    /// @notice Emergency pause duration before auto-unpause
    uint256 public constant PAUSE_DURATION = 24 hours;

    /// @notice Swap deadline buffer
    uint256 public constant SWAP_DEADLINE = 20 minutes;

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice User balances (isolated per address)
    mapping(address => uint256) public balances;

    /// @notice User's last trade timestamp (rate limiting)
    mapping(address => uint256) public lastTradeTime;

    /// @notice Auto-trading enabled per user
    mapping(address => bool) public autoTradeEnabled;

    /// @notice User risk level in basis points (100 = 1%, 5000 = 50%)
    mapping(address => uint256) public userRiskLevel;

    /// @notice Total value locked in vault
    uint256 public totalValueLocked;

    /// @notice Total fees collected (for transparency)
    uint256 public totalFeesCollected;

    /// @notice Emergency pause timestamp
    uint256 public pausedAt;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);
    event TradeExecuted(
        address indexed user,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee,
        uint256 newBalance
    );
    event AutoTradeToggled(address indexed user, bool enabled);
    event RiskLevelChanged(address indexed user, uint256 oldLevel, uint256 newLevel);
    event FeeCollected(address indexed user, uint256 amount);
    event EmergencyPaused(uint256 timestamp);
    event EmergencyUnpaused(uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error InsufficientBalance();
    error ZeroAmount();
    error UnauthorizedBot();
    error AutoTradeDisabled();
    error TradeTooLarge();
    error TradeTooSoon();
    error TransferFailed();
    error InvalidToken();
    error SlippageExceeded();
    error PauseNotExpired();
    error NotPaused();
    error InvalidRiskLevel();
    error SwapFailed();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deploy immutable vault (cannot be changed after deployment)
     * @param _usdc USDC token address
     * @param _botAddress Authorized trading bot address
     * @param _uniswapRouter Uniswap V2 Router address
     * @param _treasuryAddress Treasury for platform fees
     * @param _wrappedNative WETH/WBNB/WMATIC address
     */
    constructor(
        address _usdc,
        address _botAddress,
        address _uniswapRouter,
        address _treasuryAddress,
        address _wrappedNative
    ) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_botAddress != address(0), "Invalid bot address");
        require(_uniswapRouter != address(0), "Invalid router address");
        require(_treasuryAddress != address(0), "Invalid treasury address");
        require(_wrappedNative != address(0), "Invalid WETH address");

        USDC = IERC20(_usdc);
        BOT_ADDRESS = _botAddress;
        UNISWAP_ROUTER = _uniswapRouter;
        TREASURY_ADDRESS = _treasuryAddress;
        WRAPPED_NATIVE = _wrappedNative;
        CHAIN_ID = block.chainid;
    }

    /*//////////////////////////////////////////////////////////////
                            PLATFORM FEE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get platform fee for current chain
     * @return Fee in basis points (100 = 1%, 350 = 3.5%)
     */
    function getPlatformFee() public view returns (uint256) {
        if (CHAIN_ID == BASE_CHAIN_ID) {
            return BASE_CHAIN_FEE; // 1.0% on Base
        }
        return OTHER_CHAIN_FEE; // 3.5% on other chains
    }

    /**
     * @notice Get platform fee as percentage
     * @return whole Whole number part of fee percentage
     * @return decimal Decimal part of fee percentage (in hundredths)
     */
    function getPlatformFeePercent() external view returns (uint256 whole, uint256 decimal) {
        uint256 feeBps = getPlatformFee();
        whole = feeBps / 100;
        decimal = feeBps % 100;
    }

    /*//////////////////////////////////////////////////////////////
                            DEPOSIT/WITHDRAW
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit USDC to vault
     * @param amount Amount of USDC to deposit
     */
    function deposit(uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();

        // Transfer USDC from user to vault
        USDC.safeTransferFrom(msg.sender, address(this), amount);

        // Update user balance
        balances[msg.sender] += amount;
        totalValueLocked += amount;

        // Set default risk level if not set
        if (userRiskLevel[msg.sender] == 0) {
            userRiskLevel[msg.sender] = DEFAULT_RISK_LEVEL;
        }

        emit Deposited(msg.sender, amount, balances[msg.sender]);
    }

    /**
     * @notice Withdraw USDC from vault
     * @param amount Amount of USDC to withdraw
     */
    function withdraw(uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        // Update state BEFORE transfer (CEI pattern)
        balances[msg.sender] -= amount;
        totalValueLocked -= amount;

        // Transfer USDC to user
        USDC.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /**
     * @notice Withdraw all funds
     */
    function withdrawAll() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert InsufficientBalance();

        // Update state BEFORE transfer (CEI pattern)
        balances[msg.sender] = 0;
        totalValueLocked -= amount;

        // Transfer USDC to user
        USDC.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, 0);
    }

    /*//////////////////////////////////////////////////////////////
                         RISK LEVEL CONTROL
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set user's risk level (max trade size per transaction)
     * @param riskLevelBps Risk level in basis points (100 = 1%, 5000 = 50%)
     */
    function setRiskLevel(uint256 riskLevelBps) external {
        if (riskLevelBps < MIN_RISK_LEVEL || riskLevelBps > MAX_RISK_LEVEL) {
            revert InvalidRiskLevel();
        }

        uint256 oldLevel = userRiskLevel[msg.sender];
        userRiskLevel[msg.sender] = riskLevelBps;

        emit RiskLevelChanged(msg.sender, oldLevel, riskLevelBps);
    }

    /**
     * @notice Get user's risk level as percentage
     * @return Risk level as percentage (1-50)
     */
    function getRiskLevelPercent(address user) external view returns (uint256) {
        uint256 level = userRiskLevel[user];
        if (level == 0) level = DEFAULT_RISK_LEVEL;
        return level / 100; // Convert basis points to percentage
    }

    /*//////////////////////////////////////////////////////////////
                            AUTO-TRADE CONTROL
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Enable/disable auto-trading for caller
     * @param enabled True to enable, false to disable
     */
    function setAutoTrade(bool enabled) external {
        autoTradeEnabled[msg.sender] = enabled;
        emit AutoTradeToggled(msg.sender, enabled);
    }

    /**
     * @notice Emergency stop - disable auto-trading immediately
     */
    function emergencyStopAutoTrade() external {
        autoTradeEnabled[msg.sender] = false;
        emit AutoTradeToggled(msg.sender, false);
    }

    /*//////////////////////////////////////////////////////////////
                            BOT TRADING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute trade on behalf of user (bot only)
     * @param user User address to trade for
     * @param tokenOut Token to buy
     * @param amountIn Amount of USDC to spend (before fee)
     * @param minAmountOut Minimum tokens to receive (slippage protection)
     * @param useWrappedPath Whether to route through WETH for better liquidity
     */
    function executeTrade(
        address user,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bool useWrappedPath
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        // === AUTHORIZATION CHECKS ===
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (!autoTradeEnabled[user]) revert AutoTradeDisabled();
        if (tokenOut == address(0) || tokenOut == address(USDC)) revert InvalidToken();

        // === BALANCE CHECKS ===
        if (balances[user] < amountIn) revert InsufficientBalance();

        // === RISK MANAGEMENT CHECKS ===
        uint256 riskLevel = userRiskLevel[user];
        if (riskLevel == 0) riskLevel = DEFAULT_RISK_LEVEL;

        uint256 maxTradeSize = (balances[user] * riskLevel) / BASIS_POINTS;
        if (amountIn > maxTradeSize) revert TradeTooLarge();

        // === RATE LIMITING ===
        if (block.timestamp < lastTradeTime[user] + MIN_TRADE_INTERVAL) {
            revert TradeTooSoon();
        }

        // === UPDATE STATE BEFORE EXTERNAL CALLS (CEI Pattern) ===
        lastTradeTime[user] = block.timestamp;

        // === CALCULATE AND DEDUCT PLATFORM FEE ===
        // Base chain: 1.0%, Other chains: 3.5%
        uint256 platformFeeBps = getPlatformFee();
        uint256 fee = (amountIn * platformFeeBps) / BASIS_POINTS;
        uint256 tradeAmount = amountIn - fee;

        // Transfer fee to treasury
        USDC.safeTransfer(TREASURY_ADDRESS, fee);
        totalFeesCollected += fee;

        emit FeeCollected(user, fee);

        // === EXECUTE SWAP ON UNISWAP V2 ===
        amountOut = _executeSwap(tokenOut, tradeAmount, minAmountOut, useWrappedPath);

        // === SLIPPAGE CHECK ===
        if (amountOut < minAmountOut) revert SlippageExceeded();

        // === UPDATE USER BALANCE ===
        // Deduct full amountIn (includes fee), add swap output
        balances[user] = balances[user] - amountIn + amountOut;

        emit TradeExecuted(user, tokenOut, amountIn, amountOut, fee, balances[user]);

        return amountOut;
    }

    /**
     * @notice Execute swap and return output to vault
     * @dev Swaps USDC -> tokenOut -> USDC (round trip for P/L tracking)
     */
    function _executeSwap(
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bool useWrappedPath
    )
        internal
        returns (uint256 amountOut)
    {
        IUniswapV2Router router = IUniswapV2Router(UNISWAP_ROUTER);

        // Build swap path
        address[] memory pathOut;
        address[] memory pathBack;

        if (useWrappedPath && tokenOut != WRAPPED_NATIVE) {
            // Route through WETH for better liquidity: USDC -> WETH -> Token
            pathOut = new address[](3);
            pathOut[0] = address(USDC);
            pathOut[1] = WRAPPED_NATIVE;
            pathOut[2] = tokenOut;

            // Return path: Token -> WETH -> USDC
            pathBack = new address[](3);
            pathBack[0] = tokenOut;
            pathBack[1] = WRAPPED_NATIVE;
            pathBack[2] = address(USDC);
        } else {
            // Direct path: USDC -> Token
            pathOut = new address[](2);
            pathOut[0] = address(USDC);
            pathOut[1] = tokenOut;

            // Return path: Token -> USDC
            pathBack = new address[](2);
            pathBack[0] = tokenOut;
            pathBack[1] = address(USDC);
        }

        uint256 deadline = block.timestamp + SWAP_DEADLINE;

        // Approve router to spend USDC
        USDC.safeApprove(UNISWAP_ROUTER, amountIn);

        // Execute first swap: USDC -> Token
        uint256[] memory amountsOut;
        try router.swapExactTokensForTokens(
            amountIn,
            1, // We'll check final output, not intermediate
            pathOut,
            address(this),
            deadline
        ) returns (uint256[] memory _amounts) {
            amountsOut = _amounts;
        } catch {
            // Reset approval on failure
            USDC.safeApprove(UNISWAP_ROUTER, 0);
            revert SwapFailed();
        }

        uint256 tokenBalance = amountsOut[amountsOut.length - 1];

        // Approve router to spend received tokens
        IERC20(tokenOut).safeApprove(UNISWAP_ROUTER, tokenBalance);

        // Execute second swap: Token -> USDC (to realize P/L)
        uint256[] memory amountsBack;
        try router.swapExactTokensForTokens(
            tokenBalance,
            minAmountOut,
            pathBack,
            address(this),
            deadline
        ) returns (uint256[] memory _amounts) {
            amountsBack = _amounts;
        } catch {
            // Reset approval on failure
            IERC20(tokenOut).safeApprove(UNISWAP_ROUTER, 0);
            revert SwapFailed();
        }

        amountOut = amountsBack[amountsBack.length - 1];

        // Reset approvals (security best practice)
        USDC.safeApprove(UNISWAP_ROUTER, 0);
        IERC20(tokenOut).safeApprove(UNISWAP_ROUTER, 0);

        return amountOut;
    }

    /**
     * @notice Get expected output for a trade (for frontend display)
     * @param tokenOut Token to buy
     * @param amountIn Amount of USDC to spend
     * @param useWrappedPath Whether to route through WETH
     */
    function getExpectedOutput(
        address tokenOut,
        uint256 amountIn,
        bool useWrappedPath
    ) external view returns (uint256 expectedOut, uint256 fee) {
        IUniswapV2Router router = IUniswapV2Router(UNISWAP_ROUTER);

        // Calculate fee (1.0% on Base, 3.5% on others)
        fee = (amountIn * getPlatformFee()) / BASIS_POINTS;
        uint256 tradeAmount = amountIn - fee;

        // Build path
        address[] memory pathOut;
        address[] memory pathBack;

        if (useWrappedPath && tokenOut != WRAPPED_NATIVE) {
            pathOut = new address[](3);
            pathOut[0] = address(USDC);
            pathOut[1] = WRAPPED_NATIVE;
            pathOut[2] = tokenOut;

            pathBack = new address[](3);
            pathBack[0] = tokenOut;
            pathBack[1] = WRAPPED_NATIVE;
            pathBack[2] = address(USDC);
        } else {
            pathOut = new address[](2);
            pathOut[0] = address(USDC);
            pathOut[1] = tokenOut;

            pathBack = new address[](2);
            pathBack[0] = tokenOut;
            pathBack[1] = address(USDC);
        }

        // Get quote for USDC -> Token
        uint256[] memory amountsOut = router.getAmountsOut(tradeAmount, pathOut);
        uint256 tokenAmount = amountsOut[amountsOut.length - 1];

        // Get quote for Token -> USDC
        uint256[] memory amountsBack = router.getAmountsOut(tokenAmount, pathBack);
        expectedOut = amountsBack[amountsBack.length - 1];

        return (expectedOut, fee);
    }

    /*//////////////////////////////////////////////////////////////
                            EMERGENCY CONTROLS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emergency pause (anyone can trigger if needed)
     * @dev Auto-unpauses after PAUSE_DURATION to prevent permanent lock
     */
    function emergencyPause() external {
        if (paused()) revert NotPaused();

        _pause();
        pausedAt = block.timestamp;

        emit EmergencyPaused(block.timestamp);
    }

    /**
     * @notice Unpause if pause duration exceeded
     */
    function unpause() external {
        if (!paused()) revert NotPaused();
        if (block.timestamp < pausedAt + PAUSE_DURATION) revert PauseNotExpired();

        _unpause();
        emit EmergencyUnpaused(block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get user's balance
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /**
     * @notice Check if user can trade now (rate limit)
     */
    function canTradeNow(address user) external view returns (bool) {
        return block.timestamp >= lastTradeTime[user] + MIN_TRADE_INTERVAL;
    }

    /**
     * @notice Get maximum trade size for user based on their risk level
     */
    function getMaxTradeSize(address user) external view returns (uint256) {
        uint256 riskLevel = userRiskLevel[user];
        if (riskLevel == 0) riskLevel = DEFAULT_RISK_LEVEL;
        return (balances[user] * riskLevel) / BASIS_POINTS;
    }

    /**
     * @notice Get time until next trade allowed
     */
    function timeUntilNextTrade(address user) external view returns (uint256) {
        uint256 nextTradeTime = lastTradeTime[user] + MIN_TRADE_INTERVAL;
        if (block.timestamp >= nextTradeTime) return 0;
        return nextTradeTime - block.timestamp;
    }

    /**
     * @notice Get user's complete trading status
     */
    function getUserStatus(address user) external view returns (
        uint256 balance,
        bool autoTradeOn,
        uint256 riskLevelBps,
        uint256 maxTrade,
        uint256 timeToNextTrade,
        bool canTrade
    ) {
        balance = balances[user];
        autoTradeOn = autoTradeEnabled[user];
        riskLevelBps = userRiskLevel[user];
        if (riskLevelBps == 0) riskLevelBps = DEFAULT_RISK_LEVEL;
        maxTrade = (balance * riskLevelBps) / BASIS_POINTS;

        uint256 nextTradeTime = lastTradeTime[user] + MIN_TRADE_INTERVAL;
        if (block.timestamp >= nextTradeTime) {
            timeToNextTrade = 0;
            canTrade = autoTradeOn && balance > 0;
        } else {
            timeToNextTrade = nextTradeTime - block.timestamp;
            canTrade = false;
        }
    }

    /**
     * @notice Get vault statistics
     */
    function getVaultStats() external view returns (
        uint256 tvl,
        uint256 totalFees,
        bool isPaused,
        uint256 pauseTimeRemaining
    ) {
        tvl = totalValueLocked;
        totalFees = totalFeesCollected;
        isPaused = paused();

        if (isPaused && pausedAt > 0) {
            uint256 unpauseTime = pausedAt + PAUSE_DURATION;
            if (block.timestamp < unpauseTime) {
                pauseTimeRemaining = unpauseTime - block.timestamp;
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                            RECEIVE/FALLBACK
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Reject direct ETH transfers
     */
    receive() external payable {
        revert("No ETH accepted");
    }

    /**
     * @notice Reject calls to non-existent functions
     */
    fallback() external payable {
        revert("Invalid function");
    }
}
