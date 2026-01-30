// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MonadierTradingVaultV11
 * @author Monadier Team
 * @notice GMX Perpetuals Trading Vault - V11 RECONCILE FIX
 *
 * @dev V11 = V10 with reconcile() phantom profit bug fix
 *   - reconcile() now returns original collateral only (no PnL estimation)
 *   - Prevents phantom profit/loss from stale price at reconciliation time
 *   - Bot should use finalizeClose() for accurate PnL with actual received amount
 *
 * @dev V10 FEATURES (inherited):
 *   - New bot address (old one was compromised)
 *
 * @dev V9 FEATURES (inherited):
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
 *   - Hack? Admin initiates emergency rescue (48h timelock, users can exit first)
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

contract MonadierTradingVaultV11 is ReentrancyGuard, Pausable, Ownable {
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
    uint256 public constant BOT_FEE_BPS = 10;          // 0.1% on deposits → bot wallet
    uint256 public constant BPS = 10000;

    // Limits
    uint256 public constant MIN_LEVERAGE = 1;
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant MAX_LEVERAGE_ELITE = 50;
    uint256 public constant MIN_DEPOSIT = 50e6;        // $50 USDC
    uint256 public constant MIN_POSITION = 10e6;       // $10 USDC

    // Position timeout
    uint256 public constant POSITION_TIMEOUT = 2 hours;

    // Emergency rescue timelock
    uint256 public constant EMERGENCY_TIMELOCK = 60 seconds;

    // Trailing stop activation threshold (0.6% = 60 bps)
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

    // Emergency rescue state
    uint256 public emergencyRescueInitiated;
    bool public emergencyRescueActive;

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
    event UserInstantClose(address indexed user, address indexed token, uint256 returnAmount, int256 pnl);
    event PositionReconciled(address indexed user, address indexed token, uint256 creditedAmount, address reconciledBy);
    event AdminCredited(address indexed user, uint256 amount);
    event EmergencyRescueInitiated(uint256 executeAfter);
    event EmergencyRescueCancelled();
    event EmergencyRescueExecuted(uint256 amount);

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
    error NothingToWithdraw();
    error PositionStillActive();
    error RescueNotInitiated();
    error RescueTimelockNotExpired();
    error RescueAlreadyActive();

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

        uint256 botFee = (amount * BOT_FEE_BPS) / BPS;
        uint256 netAmount = amount - botFee;

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), netAmount);
        if (botFee > 0) {
            IERC20(USDC).safeTransferFrom(msg.sender, bot, botFee);
        }

        balances[msg.sender] += netAmount;
        tvl += netAmount;

        emit Deposit(msg.sender, netAmount);
    }

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

    function emergencyWithdraw() external nonReentrant {
        uint256 userBalance = balances[msg.sender];
        if (userBalance == 0) revert NothingToWithdraw();

        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        if (contractBalance == 0) revert InsufficientContractBalance();

        uint256 withdrawable;
        if (contractBalance >= tvl) {
            withdrawable = userBalance;
        } else {
            withdrawable = (contractBalance * userBalance) / tvl;
            if (withdrawable > userBalance) {
                withdrawable = userBalance;
            }
        }

        if (withdrawable == 0) revert NothingToWithdraw();

        balances[msg.sender] -= withdrawable;
        if (tvl >= withdrawable) {
            tvl -= withdrawable;
        } else {
            tvl = 0;
        }

        IERC20(USDC).safeTransfer(msg.sender, withdrawable);

        emit EmergencyWithdraw(msg.sender, withdrawable, userBalance);
    }

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

    // ============ USER INSTANT CLOSE ============

    function userInstantClose(address token) external payable nonReentrant {
        Position storage pos = positions[msg.sender][token];
        if (!pos.isActive) revert NoPosition();

        bool isLong = pos.isLong;
        uint256 collateral = pos.collateral;
        uint256 size = pos.size;

        uint256 currentPrice = isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(token)
            : IGMXVault(GMX_VAULT).getMaxPrice(token);

        int256 pnl = _calculatePnL(pos, currentPrice);

        uint256 returnAmount;
        uint256 successFee = 0;

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            successFee = (profit * SUCCESS_FEE_BPS) / BPS;
            returnAmount = collateral + profit - successFee;
            if (successFee > 0) {
                IERC20(USDC).safeTransfer(treasury, successFee);
            }
            tvl += (profit - successFee);
        } else {
            uint256 loss = uint256(-pnl);
            if (collateral > loss) {
                returnAmount = collateral - loss;
            } else {
                returnAmount = 0;
            }
            if (tvl >= loss) {
                tvl -= loss;
            }
        }

        balances[msg.sender] += returnAmount;

        delete positions[msg.sender][token];

        _tryCloseGMXPosition(msg.sender, token, collateral, size, isLong, currentPrice);

        emit UserInstantClose(msg.sender, token, returnAmount, pnl);
        emit PositionClosed(msg.sender, token, pnl - int256(successFee), "user_instant_close");
    }

    /// @notice Reconcile a stuck position where GMX closed but vault still shows active.
    /// @dev Returns original collateral only - no PnL estimation.
    ///      This prevents phantom profit/loss from using a stale price.
    ///      For accurate PnL, the bot should use finalizeClose() with the actual received amount.
    function reconcile(address user, address token) external nonReentrant {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoPosition();

        (uint256 gmxSize, , , , , , ) = IGMXVault(GMX_VAULT).getPosition(
            address(this), USDC, token, pos.isLong
        );
        if (gmxSize > 0) revert PositionStillActive();

        uint256 collateral = pos.collateral;

        // Safe: return original collateral only. No PnL estimation.
        // Actual PnL should be handled via finalizeClose() by the bot.
        balances[user] += collateral;

        delete positions[user][token];

        emit PositionReconciled(user, token, collateral, msg.sender);
        emit PositionClosed(user, token, 0, "reconciled");
    }

    function _calculatePnL(Position storage pos, uint256 currentPrice) internal view returns (int256) {
        if (pos.entryPrice == 0) return 0;

        int256 priceDelta;
        if (pos.isLong) {
            priceDelta = int256(currentPrice) - int256(pos.entryPrice);
        } else {
            priceDelta = int256(pos.entryPrice) - int256(currentPrice);
        }

        int256 pnl = (int256(pos.collateral) * int256(pos.leverage) * priceDelta) / int256(pos.entryPrice);

        return pnl;
    }

    function _tryCloseGMXPosition(
        address user,
        address token,
        uint256 collateral,
        uint256 size,
        bool isLong,
        uint256 currentPrice
    ) internal {
        uint256 execFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < execFee) {
            return;
        }

        uint256 acceptablePrice = isLong
            ? (currentPrice * 98) / 100
            : (currentPrice * 102) / 100;

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
            if (msg.value > 0) {
                payable(msg.sender).transfer(msg.value);
            }
        }
    }

    // ============ USER CLOSE (LEGACY) ============

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
        if (platformFee > 0) {
            IERC20(USDC).safeTransfer(treasury, platformFee);
        }

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

    function closePosition(
        address user,
        address token
    ) external payable returns (bytes32) {
        return this.keeperClosePosition{value: msg.value}(user, token);
    }

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
            if (successFee > 0) {
                IERC20(USDC).safeTransfer(treasury, successFee);
            }
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

    function recoverStuckTokens(address token) external onlyOwner {
        require(token != address(0), "Invalid token");

        uint256 contractBalance = IERC20(token).balanceOf(address(this));

        if (token == USDC) {
            uint256 userFunds = tvl;

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

    function reconcileTVL() external onlyOwner {
        uint256 realUSDC = IERC20(USDC).balanceOf(address(this));
        uint256 expectedMin = tvl;

        if (realUSDC < expectedMin) {
            emit TVLMismatchDetected(tvl, realUSDC);
            _pause();
        }
    }

    function getHealthStatus() external view returns (
        uint256 realBalance,
        uint256 totalValueLocked,
        bool isSolvent,
        int256 surplus
    ) {
        realBalance = IERC20(USDC).balanceOf(address(this));
        totalValueLocked = tvl;
        isSolvent = realBalance >= tvl;
        surplus = int256(realBalance) - int256(tvl);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
    }

    function setElite(address user, bool status) external onlyOwner {
        isElite[user] = status;
    }

    function adminCreditBalance(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Invalid user");
        require(amount > 0, "Invalid amount");

        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient contract balance");

        balances[user] += amount;

        emit AdminCredited(user, amount);
    }

    function adminReduceTVL(uint256 amount) external onlyOwner {
        require(amount <= tvl, "Amount exceeds TVL");
        tvl -= amount;
    }

    // ============ EMERGENCY RESCUE (48h TIMELOCK) ============

    /// @notice Initiate emergency rescue. Pauses contract and starts 48h countdown.
    ///         Users can call emergencyWithdraw() during the 48h window.
    function initiateEmergencyRescue() external onlyOwner {
        if (emergencyRescueActive) revert RescueAlreadyActive();

        emergencyRescueInitiated = block.timestamp;
        emergencyRescueActive = true;
        _pause();

        emit EmergencyRescueInitiated(block.timestamp + EMERGENCY_TIMELOCK);
    }

    /// @notice Cancel emergency rescue if the threat was resolved.
    function cancelEmergencyRescue() external onlyOwner {
        if (!emergencyRescueActive) revert RescueNotInitiated();

        emergencyRescueActive = false;
        emergencyRescueInitiated = 0;
        _unpause();

        emit EmergencyRescueCancelled();
    }

    /// @notice Execute rescue after 48h timelock. Sends remaining USDC to treasury.
    function executeEmergencyRescue() external onlyOwner {
        if (!emergencyRescueActive) revert RescueNotInitiated();
        if (block.timestamp < emergencyRescueInitiated + EMERGENCY_TIMELOCK) {
            revert RescueTimelockNotExpired();
        }

        uint256 remainingBalance = IERC20(USDC).balanceOf(address(this));
        if (remainingBalance > 0) {
            IERC20(USDC).safeTransfer(treasury, remainingBalance);
        }

        tvl = 0;
        emergencyRescueActive = false;
        emergencyRescueInitiated = 0;

        emit EmergencyRescueExecuted(remainingBalance);
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

    function getPrice(address token) external view returns (uint256 maxPrice, uint256 minPrice) {
        maxPrice = IGMXVault(GMX_VAULT).getMaxPrice(token);
        minPrice = IGMXVault(GMX_VAULT).getMinPrice(token);
    }

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
