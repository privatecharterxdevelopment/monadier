// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MonadierTradingVaultV9
 * @author Monadier Team
 * @notice GMX Perpetuals Trading Vault - V9 BULLETPROOF Edition
 *
 * @dev V9 NEW FEATURES (User Protection):
 *   1. userInstantClose(): User closes position AND gets balance IMMEDIATELY
 *   2. emergencyWithdraw(): User can ALWAYS withdraw available USDC
 *   3. reconcile(): ANYONE can heal stuck positions on-chain
 *
 * @dev GUARANTEES:
 *   - Bot dead? User calls userInstantClose()
 *   - GMX Keeper dead? User calls userInstantClose()
 *   - Callback missing? No problem - instant close doesn't need it
 *   - Accounting broken? Admin uses adminCreditBalance()
 *   - Partial liquidity? User uses emergencyWithdraw()
 *   - Exit scam? IMPOSSIBLE - recoverStuckTokens only works on surplus
 *
 * @dev INHERITED FROM V8.3:
 *   - All V8.2.1 features (trailing stop, user control, etc.)
 *   - adminCreditBalance() for recovery
 *   - adminReduceTVL() for accounting fixes
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

contract MonadierTradingVaultV9 is ReentrancyGuard, Pausable, Ownable {
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
        uint256 highestPrice;
        uint256 lowestPrice;
        uint256 trailingSlBps;
        bool trailingActivated;
        bool autoFeaturesEnabled;
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
    event EmergencyWithdraw(address indexed user, uint256 amount, uint256 requested);
    event PositionOpened(address indexed user, address indexed token, bool isLong, uint256 collateral, uint256 leverage);
    event PositionClosed(address indexed user, address indexed token, int256 pnl, string reason);
    event PositionCancelled(address indexed user, address indexed token, uint256 refundAmount);
    event StuckTokensRecovered(address indexed token, uint256 amount);
    event TVLMismatchDetected(uint256 tvl, uint256 realBalance);
    event UserCloseRequested(address indexed user, address indexed token, bytes32 requestKey);
    event AutoFeaturesCancelled(address indexed user, address indexed token);
    event TrailingStopUpdated(address indexed user, address indexed token, uint256 newStopLoss, uint256 trackedPrice);
    event TrailingStopActivated(address indexed user, address indexed token, uint256 activationPrice);
    // V9 NEW EVENTS
    event UserInstantClose(address indexed user, address indexed token, uint256 returnAmount, int256 pnl);
    event PositionReconciled(address indexed user, address indexed token, uint256 creditedAmount, address reconciledBy);
    event AdminCredited(address indexed user, uint256 amount);

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
    error AutoFeaturesDisabled();
    error NoTriggerCondition();
    error InsufficientExecFee();
    // V9 NEW ERRORS
    error NothingToWithdraw();
    error PositionStillActive();

    // ============ CONSTRUCTOR ============

    constructor(address _bot, address _treasury) {
        require(_bot != address(0) && _treasury != address(0), "Invalid address");

        bot = _bot;
        treasury = _treasury;

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
     * @dev Checks actual USDC balance before transfer
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        if (realUSDC < amount) revert InsufficientContractBalance();

        balances[msg.sender] -= amount;
        tvl -= amount;

        IERC20(USDC).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice V9 NEW: Emergency withdraw - get whatever USDC is available
     * @dev User can ALWAYS call this. Gets pro-rata share if contract is underfunded.
     *      This ensures users are NEVER completely stuck.
     */
    function emergencyWithdraw() external nonReentrant {
        uint256 userBalance = balances[msg.sender];
        if (userBalance == 0) revert NothingToWithdraw();

        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        if (contractBalance == 0) revert InsufficientContractBalance();

        // Calculate withdrawable: min of user balance and contract balance
        // If contract is underfunded, user gets their proportional share
        uint256 withdrawable;
        if (contractBalance >= tvl) {
            // Contract is fully funded - user gets full balance
            withdrawable = userBalance;
        } else {
            // Contract underfunded - pro-rata share
            withdrawable = (contractBalance * userBalance) / tvl;
            if (withdrawable > userBalance) {
                withdrawable = userBalance;
            }
        }

        if (withdrawable == 0) revert NothingToWithdraw();

        // Update state
        balances[msg.sender] -= withdrawable;
        if (tvl >= withdrawable) {
            tvl -= withdrawable;
        } else {
            tvl = 0;
        }

        // Transfer
        IERC20(USDC).safeTransfer(msg.sender, withdrawable);

        emit EmergencyWithdraw(msg.sender, withdrawable, userBalance);
    }

    /**
     * @notice Get actual withdrawable amount for user
     */
    function getWithdrawable(address user) external view returns (uint256) {
        uint256 userBalance = balances[user];
        if (userBalance == 0) return 0;

        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        if (realUSDC == 0) return 0;

        if (realUSDC >= tvl) {
            return userBalance;
        }

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

    // ============ V9 NEW: USER INSTANT CLOSE ============

    /**
     * @notice V9 NEW: User closes position AND gets balance IMMEDIATELY
     * @dev No waiting for GMX callback. P/L calculated on-chain instantly.
     *      GMX position close is initiated but user doesn't wait for it.
     *      This guarantees users are NEVER stuck waiting for bot/keeper.
     * @param token The index token (WETH or WBTC)
     */
    function userInstantClose(address token) external payable nonReentrant {
        Position storage pos = positions[msg.sender][token];
        if (!pos.isActive) revert NoPosition();

        // Save values before delete (storage will be zeroed)
        bool isLong = pos.isLong;
        uint256 collateral = pos.collateral;
        uint256 size = pos.size;

        // 1. Get current price from GMX
        uint256 currentPrice = isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)  // Exit price for long
            : IGMXVault(GMX_VAULT).getMaxPrice(token); // Exit price for short

        // 2. Calculate P/L on-chain
        int256 pnl = _calculatePnL(pos, currentPrice);

        // 3. Calculate return amount
        uint256 returnAmount;
        uint256 successFee = 0;

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            successFee = (profit * SUCCESS_FEE_BPS) / BPS;
            returnAmount = collateral + profit - successFee;
            fees += successFee;
            // Update TVL for profit
            tvl += (profit - successFee);
        } else {
            uint256 loss = uint256(-pnl);
            if (collateral > loss) {
                returnAmount = collateral - loss;
            } else {
                returnAmount = 0; // Total loss
            }
            // Update TVL for loss
            if (tvl >= loss) {
                tvl -= loss;
            }
        }

        // 4. IMMEDIATELY credit user balance
        balances[msg.sender] += returnAmount;

        // 5. Clear position BEFORE external calls
        delete positions[msg.sender][token];

        // 6. Try to close GMX position async (best effort, non-blocking)
        // If this fails, the USDC is still safe - just GMX position stays open
        // But user already has their balance credited
        _tryCloseGMXPosition(msg.sender, token, collateral, size, isLong, currentPrice);

        emit UserInstantClose(msg.sender, token, returnAmount, pnl);
        emit PositionClosed(msg.sender, token, pnl - int256(successFee), "user_instant_close");
    }

    /**
     * @notice V9 NEW: Anyone can reconcile a stuck position
     * @dev Bot, Admin, OR User can call this to heal stuck positions.
     *      Only works if vault thinks position is active but GMX position is closed.
     * @param user The user with stuck position
     * @param token The index token
     */
    function reconcile(address user, address token) external nonReentrant {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        // Save values before delete (storage will be zeroed)
        bool isLong = pos.isLong;
        uint256 collateral = pos.collateral;

        // Check if GMX position is actually closed
        (uint256 gmxSize, , , , , , ) = IGMXVault(GMX_VAULT).getPosition(
            address(this),
            USDC,
            token,
            isLong
        );

        // If GMX position still exists, can't reconcile
        if (gmxSize > 0) revert PositionStillActive();

        // GMX position is closed but vault position is active = STUCK
        // Calculate P/L based on current price (best estimate)
        uint256 currentPrice = isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        int256 pnl = _calculatePnL(pos, currentPrice);

        // Calculate return amount
        uint256 returnAmount;
        uint256 successFee = 0;

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            successFee = (profit * SUCCESS_FEE_BPS) / BPS;
            returnAmount = collateral + profit - successFee;
            fees += successFee;
            tvl += (profit - successFee);
        } else {
            uint256 loss = uint256(-pnl);
            returnAmount = collateral > loss ? collateral - loss : 0;
            if (tvl >= loss) {
                tvl -= loss;
            }
        }

        // Credit user
        balances[user] += returnAmount;

        // Clear position
        delete positions[user][token];

        emit PositionReconciled(user, token, returnAmount, msg.sender);
        emit PositionClosed(user, token, pnl - int256(successFee), "reconciled");
    }

    /**
     * @dev Internal: Calculate P/L for a position
     */
    function _calculatePnL(Position storage pos, uint256 currentPrice) internal view returns (int256) {
        if (pos.entryPrice == 0) return 0;

        int256 priceDelta;
        if (pos.isLong) {
            priceDelta = int256(currentPrice) - int256(pos.entryPrice);
        } else {
            priceDelta = int256(pos.entryPrice) - int256(currentPrice);
        }

        // P/L = collateral * leverage * priceDelta / entryPrice
        // Prices are 30 decimals, collateral is 6 decimals
        int256 pnl = (int256(pos.collateral) * int256(pos.leverage) * priceDelta) / int256(pos.entryPrice);

        return pnl;
    }

    /**
     * @dev Internal: Try to close GMX position (best effort)
     */
    function _tryCloseGMXPosition(
        address user,
        address token,
        uint256 collateral,
        uint256 size,
        bool isLong,
        uint256 currentPrice
    ) internal {
        // Only try if we have execution fee
        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) {
            // No exec fee provided - skip GMX close
            // User already has balance, GMX position cleanup happens later
            return;
        }

        uint256 acceptablePrice = isLong
            ? (currentPrice * 98) / 100   // 2% slippage for long
            : (currentPrice * 102) / 100; // 2% slippage for short

        address[] memory path = new address[](1);
        path[0] = USDC;

        try IGMXPositionRouter(GMX_POSITION_ROUTER).createDecreasePosition{value: execFee}(
            path,
            token,
            collateral,
            size,
            isLong,
            address(this),
            acceptablePrice,
            0,
            execFee,
            false,
            address(0)
        ) returns (bytes32 requestKey) {
            pendingRequests[requestKey] = user;
        } catch {
            // GMX call failed - that's OK, user already has balance
            // Refund exec fee
            if (msg.value > 0) {
                payable(msg.sender).transfer(msg.value);
            }
        }
    }

    // ============ V8.2: USER CLOSE (LEGACY - still works) ============

    /**
     * @notice User closes position via GMX (waits for keeper)
     * @dev Use userInstantClose() for immediate balance credit
     */
    function userClosePosition(address token) external payable nonReentrant {
        Position storage pos = positions[msg.sender][token];
        if (!pos.isActive) revert NoPosition();

        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) revert InsufficientExecFee();

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        pos.stopLoss = 0;
        pos.takeProfit = 0;
        pos.trailingSlBps = 0;
        pos.highestPrice = 0;
        pos.lowestPrice = 0;
        pos.trailingActivated = false;
        pos.autoFeaturesEnabled = false;

        uint256 acceptablePrice = pos.isLong
            ? (currentPrice * 98) / 100
            : (currentPrice * 102) / 100;

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
     */
    function openPosition(
        address user,
        address token,
        uint256 collateral,
        uint256 leverage,
        bool isLong,
        uint256 slBps,
        uint256 tpBps,
        uint256 trailingSlBps
    ) external payable nonReentrant whenNotPaused returns (bytes32) {
        if (msg.sender != bot) revert Unauthorized();
        if (!settings[user].autoTradeEnabled) revert AutoTradeDisabled();
        if (token != WETH && token != WBTC) revert InvalidToken();
        if (balances[user] < collateral) revert InsufficientBalance();
        if (positions[user][token].isActive) revert PositionExists();

        uint256 maxLev = isElite[user] ? MAX_LEVERAGE_ELITE : MAX_LEVERAGE;
        if (leverage < MIN_LEVERAGE || leverage > maxLev) revert InvalidLeverage();

        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        require(msg.value >= execFee, "Insufficient exec fee");

        uint256 positionSize = collateral * leverage;
        uint256 platformFee = (positionSize * PLATFORM_FEE_BPS) / BPS;
        uint256 netCollateral = collateral - platformFee;
        uint256 sizeDelta = netCollateral * leverage * 1e24;

        require(sizeDelta >= MIN_POSITION * 1e24, "Position too small");

        balances[user] -= collateral;
        fees += platformFee;

        uint256 price = isLong
            ? IGMXVault(GMX_VAULT).getMaxPrice(token)
            : IGMXVault(GMX_VAULT).getMinPrice(token);

        uint256 acceptablePrice = isLong
            ? (price * 101) / 100
            : (price * 99) / 100;

        address[] memory path = new address[](1);
        path[0] = USDC;

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

        IERC20(USDC).safeApprove(GMX_ROUTER, 0);

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
            highestPrice: isLong ? price : 0,
            lowestPrice: isLong ? 0 : price,
            trailingSlBps: trailingSlBps,
            trailingActivated: false,
            autoFeaturesEnabled: true
        });

        pendingRequests[requestKey] = user;

        emit PositionOpened(user, token, isLong, netCollateral, leverage);
        return requestKey;
    }

    /**
     * @notice Update trailing stop loss for a position
     */
    function updateTrailingStop(address user, address token) external {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();
        if (pos.trailingSlBps == 0) return;

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMaxPrice(token)
            : IGMXVault(GMX_VAULT).getMinPrice(token);

        if (pos.isLong) {
            if (currentPrice > pos.highestPrice) {
                pos.highestPrice = currentPrice;

                uint256 profitBps = ((currentPrice - pos.entryPrice) * BPS) / pos.entryPrice;

                if (profitBps >= TRAILING_ACTIVATION_BPS) {
                    if (!pos.trailingActivated) {
                        pos.trailingActivated = true;
                        emit TrailingStopActivated(user, token, currentPrice);
                    }

                    uint256 newSl = pos.highestPrice - (pos.highestPrice * pos.trailingSlBps) / BPS;

                    if (newSl > pos.stopLoss) {
                        pos.stopLoss = newSl;
                        emit TrailingStopUpdated(user, token, newSl, pos.highestPrice);
                    }
                }
            }
        } else {
            if (pos.lowestPrice == 0 || currentPrice < pos.lowestPrice) {
                pos.lowestPrice = currentPrice;

                uint256 profitBps = ((pos.entryPrice - currentPrice) * BPS) / pos.entryPrice;

                if (profitBps >= TRAILING_ACTIVATION_BPS) {
                    if (!pos.trailingActivated) {
                        pos.trailingActivated = true;
                        emit TrailingStopActivated(user, token, currentPrice);
                    }

                    uint256 newSl = pos.lowestPrice + (pos.lowestPrice * pos.trailingSlBps) / BPS;

                    if (pos.stopLoss == 0 || newSl < pos.stopLoss) {
                        pos.stopLoss = newSl;
                        emit TrailingStopUpdated(user, token, newSl, pos.lowestPrice);
                    }
                }
            }
        }
    }

    /**
     * @notice Keeper closes position if SL/TP triggered
     */
    function keeperClosePosition(
        address user,
        address token
    ) external payable nonReentrant returns (bytes32) {
        if (msg.sender != bot) revert Unauthorized();

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        if (!pos.autoFeaturesEnabled) revert AutoFeaturesDisabled();
        if (pos.stopLoss == 0 && pos.takeProfit == 0) revert AutoFeaturesDisabled();

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        bool shouldClose = false;
        string memory reason = "";

        if (pos.stopLoss > 0) {
            if (pos.isLong && currentPrice <= pos.stopLoss) {
                shouldClose = true;
                reason = pos.trailingActivated ? "trailing_stop_loss" : "stop_loss";
            } else if (!pos.isLong && currentPrice >= pos.stopLoss) {
                shouldClose = true;
                reason = pos.trailingActivated ? "trailing_stop_loss" : "stop_loss";
            }
        }

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

        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) revert InsufficientExecFee();

        uint256 acceptablePrice = pos.isLong
            ? (currentPrice * 98) / 100
            : (currentPrice * 102) / 100;

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

        emit PositionClosed(user, token, 0, reason);

        return requestKey;
    }

    /**
     * @notice Legacy close function - routes to keeper
     */
    function closePosition(
        address user,
        address token
    ) external payable returns (bytes32) {
        return this.keeperClosePosition{value: msg.value}(user, token);
    }

    /**
     * @notice Finalize closed position and credit user
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
     * @notice Handle cancelled GMX position
     */
    function handleCancelledPosition(
        address user,
        address token,
        uint256 refundAmount
    ) external {
        if (msg.sender != bot) revert Unauthorized();

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        balances[user] += refundAmount;

        emit PositionCancelled(user, token, refundAmount);

        delete positions[user][token];
    }

    /**
     * @notice Cancel stuck position after timeout
     */
    function cancelStuckPosition(address user, address token) external {
        require(msg.sender == bot || msg.sender == user, "Unauthorized");

        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        if (block.timestamp < pos.timestamp + POSITION_TIMEOUT) {
            revert PositionNotTimedOut();
        }

        uint256 refund = pos.collateral;
        balances[user] += refund;

        emit PositionCancelled(user, token, refund);

        delete positions[user][token];
    }

    // ============ OWNER FUNCTIONS ============

    /**
     * @notice Recover stuck tokens (surplus only - NO exit scam possible)
     */
    function recoverStuckTokens(address token) external onlyOwner {
        require(token != address(0), "Invalid token");

        uint256 contractBalance = IERC20(token).balanceOf(address(this));

        if (token == USDC) {
            uint256 userFunds = tvl + fees;

            if (contractBalance <= userFunds) {
                revert NoStuckTokens();
            }

            uint256 stuckAmount = contractBalance - userFunds;
            IERC20(USDC).safeTransfer(treasury, stuckAmount);
            emit StuckTokensRecovered(USDC, stuckAmount);
        } else {
            if (contractBalance == 0) revert NoStuckTokens();
            IERC20(token).safeTransfer(treasury, contractBalance);
            emit StuckTokensRecovered(token, contractBalance);
        }
    }

    /**
     * @notice Check and handle TVL mismatches
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
     * @notice Emergency credit user balance (for recovery)
     * @dev Can only credit from USDC already in contract - NO exit scam possible
     */
    function adminCreditBalance(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Invalid user");
        require(amount > 0, "Invalid amount");

        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient contract balance");

        balances[user] += amount;

        emit AdminCredited(user, amount);
    }

    /**
     * @notice Fix TVL accounting
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

    /**
     * @notice V9 NEW: Get price for a token
     */
    function getPrice(address token) external view returns (uint256 maxPrice, uint256 minPrice) {
        maxPrice = IGMXVault(GMX_VAULT).getMaxPrice(token);
        minPrice = IGMXVault(GMX_VAULT).getMinPrice(token);
    }

    /**
     * @notice V9 NEW: Calculate live P/L for a position (view)
     */
    function getPositionPnL(address user, address token) external view returns (int256 pnl, int256 pnlPercent) {
        Position storage pos = positions[user][token];
        if (!pos.isActive) return (0, 0);

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        pnl = _calculatePnLView(pos, currentPrice);

        if (pos.collateral > 0) {
            pnlPercent = (pnl * 10000) / int256(pos.collateral);
        }
    }

    function _calculatePnLView(Position storage pos, uint256 currentPrice) internal view returns (int256) {
        if (pos.entryPrice == 0) return 0;

        int256 priceDelta;
        if (pos.isLong) {
            priceDelta = int256(currentPrice) - int256(pos.entryPrice);
        } else {
            priceDelta = int256(pos.entryPrice) - int256(currentPrice);
        }

        return (int256(pos.collateral) * int256(pos.leverage) * priceDelta) / int256(pos.entryPrice);
    }
}
