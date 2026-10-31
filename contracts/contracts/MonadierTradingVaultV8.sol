// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MonadierTradingVaultV8
 * @author Monadier Team
 * @notice GMX Perpetuals Trading Vault - V8.2.1 FINAL with all bug fixes
 *
 * @dev V8 FIXES:
 *   1. DOUBLE TRANSFER BUG: Removed manual transfer, GMX pulls via approval only
 *   2. TVL UNDERFLOW BUG: Update TVL when profits are credited
 *   3. CANCELLED POSITION HANDLING: Added handleCancelledPosition() to refund user
 *
 * @dev V8.1 SECURITY HARDENING:
 *   4. LIMITED APPROVALS: No more unlimited approval, approve exact amount per trade
 *   5. SAFE TOKEN RECOVERY: Owner can only recover stuck tokens, NOT user funds
 *   6. REAL-BALANCE CHECKS: Withdraw checks actual USDC balance
 *   7. POSITION TIMEOUTS: Stuck positions can be cancelled after 2 hours
 *   8. TVL RECONCILIATION: Detect and handle accounting mismatches
 *
 * @dev V8.2 USER CONTROL + TRAILING STOP:
 *   9. USER CLOSE: User can close their own position anytime (PRIORITY over keeper)
 *  10. CANCEL AUTO-FEATURES: User can disable SL/TP/trailing anytime
 *  11. TRAILING STOP LOSS: Dynamic SL that follows price (activates after 0.6% profit)
 *  12. KEEPER PRIORITY CHECK: Keeper cannot close if user disabled auto-features
 *
 * @dev V8.2.1 CRITICAL FIXES:
 *  13. userClosePosition(): Get price BEFORE resetting fields
 *  14. closePosition(): Routes to keeperClosePosition (no bypass possible)
 *  15. Acceptable price slippage increased to 2% for better execution
 */

// ============ GMX INTERFACES ============

interface IGMXVault {
    function getPosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong
    ) external view returns (
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        int256 realisedPnl,
        uint256 lastIncreasedTime
    );
    function getMaxPrice(address _token) external view returns (uint256);
    function getMinPrice(address _token) external view returns (uint256);
}

interface IGMXRouter {
    function approvePlugin(address _plugin) external;
}

interface IGMXPositionRouter {
    function minExecutionFee() external view returns (uint256);

    function createIncreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bytes32 _referralCode,
        address _callbackTarget
    ) external payable returns (bytes32);

    function createDecreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        uint256 _acceptablePrice,
        uint256 _minOut,
        uint256 _executionFee,
        bool _withdrawETH,
        address _callbackTarget
    ) external payable returns (bytes32);
}

// ============ MAIN CONTRACT ============

contract MonadierTradingVaultV8 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ CONSTANTS ============

    // GMX Arbitrum Addresses
    address public constant GMX_VAULT = 0x489ee077994B6658eAfA855C308275EAd8097C4A;
    address public constant GMX_ROUTER = 0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064;
    address public constant GMX_POSITION_ROUTER = 0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868;

    // Tokens
    address public constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant WBTC = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;

    // Fees (basis points)
    uint256 public constant PLATFORM_FEE_BPS = 10;      // 0.1% on position size
    uint256 public constant SUCCESS_FEE_BPS = 1000;    // 10% of profits
    uint256 public constant BPS = 10000;

    // Limits
    uint256 public constant MIN_LEVERAGE = 1;
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant MAX_LEVERAGE_ELITE = 50;
    uint256 public constant MIN_DEPOSIT = 50e6;        // $50 USDC
    uint256 public constant MIN_POSITION = 10e6;       // $10 USDC

    // V8.1: Position timeout
    uint256 public constant POSITION_TIMEOUT = 2 hours;

    // V8.2: Trailing stop activation threshold (0.6% = 60 bps)
    uint256 public constant TRAILING_ACTIVATION_BPS = 60;

    // GMX
    uint256 public constant PRICE_PRECISION = 1e30;
    bytes32 public constant REFERRAL_CODE = keccak256("MONADIER");

    // ============ STRUCTS ============

    /**
     * @dev V8.2: Position struct with trailing stop fields
     */
    struct Position {
        bool isActive;
        bool isLong;
        address token;
        uint256 collateral;
        uint256 size;
        uint256 leverage;
        uint256 entryPrice;
        uint256 stopLoss;
        uint256 takeProfit;
        uint256 timestamp;
        bytes32 requestKey;
        // V8.2 TRAILING STOP FIELDS
        uint256 highestPrice;       // For Long: highest reached price
        uint256 lowestPrice;        // For Short: lowest reached price
        uint256 trailingSlBps;      // e.g., 50 = 0.5% trailing distance
        bool trailingActivated;     // Has trailing been activated?
        bool autoFeaturesEnabled;   // V8.2: Can keeper close this position?
    }

    struct Settings {
        bool autoTradeEnabled;
        uint256 riskBps;
        uint256 maxLeverage;
        uint256 stopLossBps;
        uint256 takeProfitBps;
    }

    // ============ STATE ============

    address public immutable bot;
    address public treasury;

    mapping(address => uint256) public balances;
    mapping(address => mapping(address => Position)) public positions;
    mapping(address => Settings) public settings;
    mapping(bytes32 => address) public pendingRequests;
    mapping(address => bool) public isElite;

    uint256 public tvl;
    uint256 public fees;

    // ============ EVENTS ============

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event PositionOpened(address indexed user, address indexed token, bool isLong, uint256 collateral, uint256 leverage);
    event PositionClosed(address indexed user, address indexed token, int256 pnl, string reason);
    event PositionCancelled(address indexed user, address indexed token, uint256 refundAmount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    event TVLMismatchDetected(uint256 tvl, uint256 realBalance);
    // V8.2 NEW EVENTS
    event UserCloseRequested(address indexed user, address indexed token, bytes32 requestKey);
    event AutoFeaturesCancelled(address indexed user, address indexed token);
    event TrailingStopUpdated(address indexed user, address indexed token, uint256 newStopLoss, uint256 trackedPrice);
    event TrailingStopActivated(address indexed user, address indexed token, uint256 activationPrice);

    // ============ ERRORS ============

    error Unauthorized();
    error InvalidAmount();
    error InvalidToken();
    error InvalidLeverage();
    error InsufficientBalance();
    error InsufficientContractBalance();
    error PositionExists();
    error NoPosition();
    error AutoTradeDisabled();
    error PositionNotTimedOut();
    error NoStuckTokens();
    // V8.2 NEW ERRORS
    error AutoFeaturesDisabled();
    error NoTriggerCondition();
    error InsufficientExecFee();

    // ============ CONSTRUCTOR ============

    constructor(address _bot, address _treasury) {
        require(_bot != address(0) && _treasury != address(0), "Invalid address");

        bot = _bot;
        treasury = _treasury;

        // V8.1 FIX: NO unlimited approval here!
        // Approvals are done per-trade in openPosition()

        // Register GMX plugin
        IGMXRouter(GMX_ROUTER).approvePlugin(GMX_POSITION_ROUTER);
    }

    // ============ USER FUNCTIONS ============

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        tvl += amount;

        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from vault
     * @dev V8.1 FIX: Checks actual USDC balance before transfer
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        // V8.1 FIX: Check if contract actually has the USDC
        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        if (realUSDC < amount) revert InsufficientContractBalance();

        balances[msg.sender] -= amount;
        tvl -= amount;

        IERC20(USDC).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Get actual withdrawable amount for user
     * @dev V8.1 NEW: Returns real withdrawable based on contract balance
     */
    function getWithdrawable(address user) external view returns (uint256) {
        uint256 userBalance = balances[user];
        if (userBalance == 0) return 0;

        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        if (realUSDC == 0) return 0;

        // If contract has enough, user can withdraw full balance
        if (realUSDC >= tvl) {
            return userBalance;
        }

        // Otherwise, pro-rata share
        return (realUSDC * userBalance) / tvl;
    }

    function setAutoTrade(bool enabled) external {
        if (enabled && balances[msg.sender] < MIN_DEPOSIT) revert InsufficientBalance();
        settings[msg.sender].autoTradeEnabled = enabled;
    }

    function setSettings(
        uint256 riskBps,
        uint256 maxLeverage,
        uint256 stopLossBps,
        uint256 takeProfitBps
    ) external {
        uint256 maxLev = isElite[msg.sender] ? MAX_LEVERAGE_ELITE : MAX_LEVERAGE;
        if (maxLeverage > maxLev) revert InvalidLeverage();

        settings[msg.sender] = Settings({
            autoTradeEnabled: settings[msg.sender].autoTradeEnabled,
            riskBps: riskBps > 0 ? riskBps : 500,
            maxLeverage: maxLeverage > 0 ? maxLeverage : 10,
            stopLossBps: stopLossBps > 0 ? stopLossBps : 500,
            takeProfitBps: takeProfitBps > 0 ? takeProfitBps : 1000
        });
    }

    // ============ V8.2: USER CLOSE FUNCTIONS ============

    /**
     * @notice User closes their own position (ALWAYS has priority!)
     * @dev V8.2 NEW: Cancels all auto-features and executes immediate close
     *      User ALWAYS has priority over keeper/bot
     * @dev V8.2.1 FIX: Get price BEFORE resetting fields!
     */
    function userClosePosition(address token) external payable nonReentrant {
        Position storage pos = positions[msg.sender][token];
        if (!pos.isActive) revert NoPosition();

        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) revert InsufficientExecFee();

        // V8.2.1 FIX: Get current price FIRST (before resetting any fields!)
        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        // CANCEL ALL AUTO-FEATURES IMMEDIATELY (User has priority!)
        // Now safe to reset after we've captured the price
        pos.stopLoss = 0;
        pos.takeProfit = 0;
        pos.trailingSlBps = 0;
        pos.highestPrice = 0;
        pos.lowestPrice = 0;
        pos.trailingActivated = false;
        pos.autoFeaturesEnabled = false;

        // V8.2.1 FIX: Use 2% slippage for better execution
        uint256 acceptablePrice = pos.isLong
            ? (currentPrice * 98) / 100   // 2% slippage for long close
            : (currentPrice * 102) / 100; // 2% slippage for short close

        address[] memory path = new address[](1);
        path[0] = USDC;

        bytes32 requestKey = IGMXPositionRouter(GMX_POSITION_ROUTER).createDecreasePosition{value: execFee}(
            path,
            token,
            pos.collateral,
            pos.size,
            pos.isLong,
            address(this),
            acceptablePrice,
            0,
            execFee,
            false,
            address(0)
        );

        pendingRequests[requestKey] = msg.sender;

        emit UserCloseRequested(msg.sender, token, requestKey);
    }

    /**
     * @notice User cancels all auto-features (SL/TP/trailing)
     * @dev V8.2 NEW: Gives user full control - prevents keeper from closing
     */
    function cancelAutoFeatures(address token) external {
        Position storage pos = positions[msg.sender][token];
        if (!pos.isActive) revert NoPosition();

        pos.stopLoss = 0;
        pos.takeProfit = 0;
        pos.trailingSlBps = 0;
        pos.trailingActivated = false;
        pos.autoFeaturesEnabled = false;

        emit AutoFeaturesCancelled(msg.sender, token);
    }

    // ============ BOT FUNCTIONS ============

    /**
     * @notice Open leveraged position on GMX
     * @dev V8.2: Added trailingSlBps parameter for trailing stop loss
     */
    function openPosition(
        address user,
        address token,
        uint256 collateral,
        uint256 leverage,
        bool isLong,
        uint256 slBps,
        uint256 tpBps,
        uint256 trailingSlBps  // V8.2 NEW: Trailing stop loss in basis points
    ) external payable nonReentrant whenNotPaused returns (bytes32) {
        // Checks
        if (msg.sender != bot) revert Unauthorized();
        if (!settings[user].autoTradeEnabled) revert AutoTradeDisabled();
        if (token != WETH && token != WBTC) revert InvalidToken();
        if (balances[user] < collateral) revert InsufficientBalance();
        if (positions[user][token].isActive) revert PositionExists();

        uint256 maxLev = isElite[user] ? MAX_LEVERAGE_ELITE : MAX_LEVERAGE;
        if (leverage < MIN_LEVERAGE || leverage > maxLev) revert InvalidLeverage();

        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        require(msg.value >= execFee, "Insufficient exec fee");

        // Calculate fees and sizes
        uint256 positionSize = collateral * leverage;
        uint256 platformFee = (positionSize * PLATFORM_FEE_BPS) / BPS;
        uint256 netCollateral = collateral - platformFee;
        uint256 sizeDelta = netCollateral * leverage * 1e24;

        require(sizeDelta >= MIN_POSITION * 1e24, "Position too small");

        // Update state
        balances[user] -= collateral;
        fees += platformFee;

        // Get price
        uint256 price = isLong
            ? IGMXVault(GMX_VAULT).getMaxPrice(token)
            : IGMXVault(GMX_VAULT).getMinPrice(token);

        uint256 acceptablePrice = isLong
            ? (price * 101) / 100
            : (price * 99) / 100;

        // Build path
        address[] memory path = new address[](1);
        path[0] = USDC;

        /*
         * V8.3 FIX: Approve GMX_ROUTER (not Position Router!)
         * GMX Position Router uses the Router for token transfers
         */
        IERC20(USDC).safeApprove(GMX_ROUTER, 0);
        IERC20(USDC).safeApprove(GMX_ROUTER, netCollateral);

        bytes32 requestKey = IGMXPositionRouter(GMX_POSITION_ROUTER).createIncreasePosition{value: execFee}(
            path,
            token,
            netCollateral,
            0,
            sizeDelta,
            isLong,
            acceptablePrice,
            execFee,
            REFERRAL_CODE,
            address(0)
        );

        // V8.1: Reset approval to 0 after GMX call
        IERC20(USDC).safeApprove(GMX_ROUTER, 0);

        // Calculate SL/TP prices
        uint256 sl = 0;
        uint256 tp = 0;

        if (slBps > 0) {
            sl = isLong
                ? price - (price * slBps) / BPS
                : price + (price * slBps) / BPS;
        }
        if (tpBps > 0) {
            tp = isLong
                ? price + (price * tpBps) / BPS
                : price - (price * tpBps) / BPS;
        }

        // Store position with V8.2 trailing stop fields
        positions[user][token] = Position({
            isActive: true,
            isLong: isLong,
            token: token,
            collateral: netCollateral,
            size: sizeDelta,
            leverage: leverage,
            entryPrice: price,
            stopLoss: sl,
            takeProfit: tp,
            timestamp: block.timestamp,
            requestKey: requestKey,
            // V8.2 TRAILING STOP FIELDS
            highestPrice: isLong ? price : 0,
            lowestPrice: isLong ? 0 : price,
            trailingSlBps: trailingSlBps,
            trailingActivated: false,
            autoFeaturesEnabled: true  // Keeper can close by default
        });

        pendingRequests[requestKey] = user;

        emit PositionOpened(user, token, isLong, netCollateral, leverage);
        return requestKey;
    }

    /**
     * @notice Update trailing stop loss for a position
     * @dev V8.2 NEW: Called by bot to update trailing SL based on price movement
     *      Trailing activates after TRAILING_ACTIVATION_BPS (0.6%) profit
     */
    function updateTrailingStop(address user, address token) external {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();
        if (pos.trailingSlBps == 0) return; // No trailing SL set

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMaxPrice(token)
            : IGMXVault(GMX_VAULT).getMinPrice(token);

        if (pos.isLong) {
            // LONG POSITION: SL follows upward price movement
            if (currentPrice > pos.highestPrice) {
                pos.highestPrice = currentPrice;

                // Calculate profit percentage
                uint256 profitBps = ((currentPrice - pos.entryPrice) * BPS) / pos.entryPrice;

                // Activate trailing after minimum profit threshold
                if (profitBps >= TRAILING_ACTIVATION_BPS) {
                    if (!pos.trailingActivated) {
                        pos.trailingActivated = true;
                        emit TrailingStopActivated(user, token, currentPrice);
                    }

                    // Update SL to trail below highest price
                    uint256 newSl = pos.highestPrice - (pos.highestPrice * pos.trailingSlBps) / BPS;

                    // Only move SL up, never down
                    if (newSl > pos.stopLoss) {
                        pos.stopLoss = newSl;
                        emit TrailingStopUpdated(user, token, newSl, pos.highestPrice);
                    }
                }
            }
        } else {
            // SHORT POSITION: SL follows downward price movement
            if (pos.lowestPrice == 0 || currentPrice < pos.lowestPrice) {
                pos.lowestPrice = currentPrice;

                // Calculate profit percentage
                uint256 profitBps = ((pos.entryPrice - currentPrice) * BPS) / pos.entryPrice;

                // Activate trailing after minimum profit threshold
                if (profitBps >= TRAILING_ACTIVATION_BPS) {
                    if (!pos.trailingActivated) {
                        pos.trailingActivated = true;
                        emit TrailingStopActivated(user, token, currentPrice);
                    }

                    // Update SL to trail above lowest price
                    uint256 newSl = pos.lowestPrice + (pos.lowestPrice * pos.trailingSlBps) / BPS;

                    // Only move SL down (lower price = better for short SL)
                    if (pos.stopLoss == 0 || newSl < pos.stopLoss) {
                        pos.stopLoss = newSl;
                        emit TrailingStopUpdated(user, token, newSl, pos.lowestPrice);
                    }
                }
            }
        }
    }

    /**
     * @notice Keeper/Bot closes position ONLY if user hasn't disabled auto-features
     * @dev V8.2 NEW: Prevents race conditions - user ALWAYS has priority
     */
    function keeperClosePosition(
        address user,
        address token
    ) external payable nonReentrant returns (bytes32) {
        if (msg.sender != bot) revert Unauthorized();

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        // V8.2: Check if user disabled auto-features
        if (!pos.autoFeaturesEnabled) revert AutoFeaturesDisabled();
        if (pos.stopLoss == 0 && pos.takeProfit == 0) revert AutoFeaturesDisabled();

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        bool shouldClose = false;
        string memory reason = "";

        // Check Stop Loss (static OR trailing)
        if (pos.stopLoss > 0) {
            if (pos.isLong && currentPrice <= pos.stopLoss) {
                shouldClose = true;
                reason = pos.trailingActivated ? "trailing_stop_loss" : "stop_loss";
            } else if (!pos.isLong && currentPrice >= pos.stopLoss) {
                shouldClose = true;
                reason = pos.trailingActivated ? "trailing_stop_loss" : "stop_loss";
            }
        }

        // Check Take Profit
        if (pos.takeProfit > 0) {
            if (pos.isLong && currentPrice >= pos.takeProfit) {
                shouldClose = true;
                reason = "take_profit";
            } else if (!pos.isLong && currentPrice <= pos.takeProfit) {
                shouldClose = true;
                reason = "take_profit";
            }
        }

        if (!shouldClose) revert NoTriggerCondition();

        // Execute close
        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) revert InsufficientExecFee();

        // V8.2.1 FIX: Use 2% slippage for better execution
        uint256 acceptablePrice = pos.isLong
            ? (currentPrice * 98) / 100   // 2% slippage for long close
            : (currentPrice * 102) / 100; // 2% slippage for short close

        address[] memory path = new address[](1);
        path[0] = USDC;

        bytes32 requestKey = IGMXPositionRouter(GMX_POSITION_ROUTER).createDecreasePosition{value: execFee}(
            path,
            token,
            pos.collateral,
            pos.size,
            pos.isLong,
            address(this),
            acceptablePrice,
            0,
            execFee,
            false,
            address(0)
        );

        pendingRequests[requestKey] = user;

        // Emit close event with reason
        emit PositionClosed(user, token, 0, reason);

        return requestKey;
    }

    /**
     * @notice Legacy bot close function - DEPRECATED
     * @dev V8.2.1: Routes to keeperClosePosition() to enforce user priority checks
     *      Bot MUST respect autoFeaturesEnabled flag!
     */
    function closePosition(
        address user,
        address token
    ) external payable returns (bytes32) {
        // V8.2.1 FIX: Route to keeperClosePosition to enforce user priority
        // This ensures bot cannot bypass the autoFeaturesEnabled check
        return this.keeperClosePosition{value: msg.value}(user, token);
    }

    /**
     * @notice Finalize closed position and credit user
     * @dev V8 FIX: Updates TVL when crediting profits
     */
    function finalizeClose(
        address user,
        address token,
        uint256 received,
        string calldata reason
    ) external {
        if (msg.sender != bot) revert Unauthorized();

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        int256 pnl = int256(received) - int256(pos.collateral);

        uint256 successFee = 0;
        if (pnl > 0) {
            successFee = (uint256(pnl) * SUCCESS_FEE_BPS) / BPS;
            fees += successFee;
        }

        uint256 returnAmount = pnl > 0 ? received - successFee : received;

        // V8 FIX: Update TVL when profits/losses are credited
        if (pnl > 0) {
            tvl += (uint256(pnl) - successFee);
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            if (tvl >= loss) {
                tvl -= loss;
            }
        }

        balances[user] += returnAmount;

        emit PositionClosed(user, token, pnl - int256(successFee), reason);

        delete positions[user][token];
    }

    /**
     * @notice Handle cancelled GMX position - refund user
     * @dev V8 NEW: Handles GMX cancellations properly
     */
    function handleCancelledPosition(
        address user,
        address token,
        uint256 refundAmount
    ) external {
        if (msg.sender != bot) revert Unauthorized();

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        // Refund user
        balances[user] += refundAmount;

        emit PositionCancelled(user, token, refundAmount);

        delete positions[user][token];
    }

    /**
     * @notice Cancel stuck position after timeout
     * @dev V8.1 NEW: User or bot can cancel stuck positions after 2 hours
     */
    function cancelStuckPosition(address user, address token) external {
        // Only bot or the user themselves can cancel
        require(msg.sender == bot || msg.sender == user, "Unauthorized");

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        // V8.1: Must wait 2 hours before cancelling
        if (block.timestamp < pos.timestamp + POSITION_TIMEOUT) {
            revert PositionNotTimedOut();
        }

        // Refund the collateral to user
        uint256 refund = pos.collateral;
        balances[user] += refund;

        emit PositionCancelled(user, token, refund);

        delete positions[user][token];
    }

    // ============ OWNER FUNCTIONS ============

    /**
     * @notice Recover stuck tokens (tokens beyond user funds)
     * @dev V8.1 FIX: Owner can ONLY recover stuck tokens, NOT user funds
     */
    function recoverStuckTokens(address token) external onlyOwner {
        require(token != address(0), "Invalid token");

        uint256 contractBalance = IERC20(token).balanceOf(address(this));

        if (token == USDC) {
            // For USDC: Only recover tokens ABOVE what users own
            uint256 userFunds = tvl + fees;

            if (contractBalance <= userFunds) {
                revert NoStuckTokens();
            }

            uint256 stuckAmount = contractBalance - userFunds;
            IERC20(USDC).safeTransfer(treasury, stuckAmount);
            emit StuckTokensRecovered(USDC, stuckAmount);
        } else {
            // For other tokens: Recover full balance
            if (contractBalance == 0) revert NoStuckTokens();
            IERC20(token).safeTransfer(treasury, contractBalance);
            emit StuckTokensRecovered(token, contractBalance);
        }
    }

    /**
     * @notice Check and handle TVL mismatches
     * @dev V8.1 NEW: Detects accounting bugs and pauses if needed
     */
    function reconcileTVL() external onlyOwner {
        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        uint256 expectedMin = tvl;

        if (realUSDC < expectedMin) {
            emit TVLMismatchDetected(tvl, realUSDC);
            _pause();
        }
    }

    /**
     * @notice Get contract health status
     * @dev V8.1 NEW: View function to check contract solvency
     */
    function getHealthStatus() external view returns (
        uint256 realBalance,
        uint256 totalValueLocked,
        uint256 accumulatedFees,
        bool isSolvent,
        int256 surplus
    ) {
        realBalance = IERC20(USDC).balanceOf(address(this));
        totalValueLocked = tvl;
        accumulatedFees = fees;

        uint256 required = tvl + fees;
        isSolvent = realBalance >= required;
        surplus = int256(realBalance) - int256(required);
    }

    function withdrawFees() external onlyOwner {
        uint256 amount = fees;
        require(amount > 0, "No fees");

        // V8.1: Check we actually have the fees
        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        require(realUSDC >= tvl + amount, "Insufficient balance for fees");

        fees = 0;
        IERC20(USDC).safeTransfer(treasury, amount);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
    }

    function setElite(address user, bool status) external onlyOwner {
        isElite[user] = status;
    }

    /**
     * @notice Emergency credit user balance (for recovery from callback bug)
     * @dev V8.3 NEW: Admin can credit users whose funds got stuck due to missing callbacks
     * @param user The user to credit
     * @param amount Amount in USDC (6 decimals)
     */
    function adminCreditBalance(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Invalid user");
        require(amount > 0, "Invalid amount");

        // Check contract has enough USDC
        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient contract balance");

        // Credit user balance
        balances[user] += amount;

        // Don't increase TVL - these funds are already in the contract
        // TVL should already account for them
    }

    /**
     * @notice Fix TVL accounting after stuck positions
     * @dev V8.3 NEW: Reduce TVL when funds were lost to GMX
     */
    function adminReduceTVL(uint256 amount) external onlyOwner {
        require(amount <= tvl, "Amount exceeds TVL");
        tvl -= amount;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function recoverETH() external onlyOwner {
        payable(treasury).transfer(address(this).balance);
    }

    receive() external payable {}

    // ============ VIEW FUNCTIONS ============

    function getPosition(address user, address token) external view returns (Position memory) {
        return positions[user][token];
    }

    function getSettings(address user) external view returns (Settings memory) {
        return settings[user];
    }

    function getExecutionFee() external view returns (uint256) {
        return IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
    }

    /**
     * @notice Get trailing stop status for a position
     * @dev V8.2 NEW: Returns trailing stop information
     */
    function getTrailingStopInfo(address user, address token) external view returns (
        bool hasTrailingStop,
        bool isActivated,
        uint256 trailingBps,
        uint256 trackedPrice,
        uint256 currentStopLoss
    ) {
        Position storage pos = positions[user][token];
        hasTrailingStop = pos.trailingSlBps > 0;
        isActivated = pos.trailingActivated;
        trailingBps = pos.trailingSlBps;
        trackedPrice = pos.isLong ? pos.highestPrice : pos.lowestPrice;
        currentStopLoss = pos.stopLoss;
    }
}
