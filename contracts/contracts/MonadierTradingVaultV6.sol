// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*//////////////////////////////////////////////////////////////
                        EXTERNAL INTERFACES
//////////////////////////////////////////////////////////////*/

/// @notice Uniswap V3 SwapRouter interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Chainlink AggregatorV3 interface for price feeds
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

/// @notice Aave V3 Pool interface
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    );
    function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external;
}

/**
 * @title MonadierTradingVaultV6
 * @notice Arbitrum Vault with ISOLATED MARGIN + Chainlink Oracles + 20x Leverage
 * @dev V6 Features:
 *      - ISOLATED MARGIN: Each position has its own collateral (safer)
 *      - 20x MAX LEVERAGE via Aave V3
 *      - CHAINLINK ORACLES for accurate pricing & automatic stop-loss
 *      - LONG: Supply USDC → Borrow USDC → Buy token
 *      - SHORT: Supply USDC → Borrow token → Sell token
 *      - On-chain Stop-Loss & Take-Profit triggers
 *      - NO rate limit on close (immediate execution)
 *      - Per-token cooldown starts AFTER close
 *
 *      Fee structure:
 *      - Base Fee: 0.1% on TOTAL position size (including leverage)
 *      - Success Fee: 10% of profit
 *      - Uniswap V3 with 0.05% fee tier
 */
contract MonadierTradingVaultV6 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    // Core contracts
    IERC20 public immutable USDC;
    address public immutable BOT_ADDRESS;
    address public immutable SWAP_ROUTER;
    address public immutable AAVE_POOL;
    address public immutable WRAPPED_NATIVE; // WETH on Arbitrum

    // Fee structure
    uint256 public constant BASE_FEE = 10; // 0.1% base fee
    uint256 public constant SUCCESS_FEE = 1000; // 10% of profit
    uint256 public constant BASIS_POINTS = 10000;

    // Uniswap V3 pool fee tier (0.05%)
    uint24 public constant POOL_FEE = 500;

    // Leverage & Risk Management - ISOLATED MARGIN
    uint256 public constant MAX_LEVERAGE = 20; // 20x max leverage
    uint256 public constant MIN_LEVERAGE = 1;

    // Isolated margin thresholds (per position)
    uint256 public constant LIQUIDATION_THRESHOLD = 8000; // 80% - position liquidated
    uint256 public constant WARNING_THRESHOLD = 7000; // 70% - warning

    // Aave interest rate mode (2 = variable)
    uint256 public constant VARIABLE_RATE = 2;

    // Trading rules
    uint256 public constant MIN_VAULT_BALANCE = 100 * 1e6; // $100 USDC
    uint256 public constant MAX_RISK_LEVEL = 10000; // 100%
    uint256 public constant MIN_RISK_LEVEL = 100; // 1%
    uint256 public constant DEFAULT_RISK_LEVEL = 500; // 5%
    uint256 public constant MIN_TRADE_INTERVAL = 5 minutes;
    uint256 public constant SWAP_DEADLINE = 20 minutes;

    // Oracle staleness check (1 hour max)
    uint256 public constant ORACLE_STALENESS = 3600;

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct Position {
        bool isLong;              // true = long, false = short
        bool isActive;            // Position is open
        uint256 tokenAmount;      // Amount of token held (long) or owed (short)
        uint256 entryPrice;       // Entry price from Chainlink (8 decimals)
        uint256 collateral;       // USDC collateral for THIS position (isolated)
        uint256 borrowedAmount;   // Amount borrowed (USDC for long, token for short)
        uint256 leverage;         // Leverage multiplier (1-20)
        uint256 stopLossPrice;    // Auto-close if price hits this (8 decimals)
        uint256 takeProfitPrice;  // Auto-close if price hits this (8 decimals)
        uint256 openedAt;         // Timestamp when opened
        uint256 liquidationPrice; // Price at which position gets liquidated
    }

    struct OracleConfig {
        address priceFeed;    // Chainlink price feed address
        uint8 decimals;       // Oracle decimals (usually 8)
        bool isActive;        // Oracle is configured
    }

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice User USDC balances (available, not locked in positions)
    mapping(address => uint256) public balances;

    /// @notice User positions: user => token => Position (ISOLATED per position)
    mapping(address => mapping(address => Position)) public positions;

    /// @notice Chainlink oracle configs: token => OracleConfig
    mapping(address => OracleConfig) public oracles;

    /// @notice Per-token cooldown after closing: user => token => timestamp
    mapping(address => mapping(address => uint256)) public lastCloseTime;

    /// @notice Auto-trading enabled per user
    mapping(address => bool) public autoTradeEnabled;

    /// @notice User risk level in basis points
    mapping(address => uint256) public userRiskLevel;

    /// @notice Total value locked (user deposits only)
    uint256 public totalValueLocked;

    /// @notice Accumulated platform fees
    uint256 public accumulatedFees;

    /// @notice Treasury address for fee withdrawals
    address public treasuryAddress;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);

    event OracleConfigured(address indexed token, address priceFeed, uint8 decimals);

    event LongOpened(
        address indexed user,
        address indexed token,
        uint256 collateral,
        uint256 leverage,
        uint256 positionSize,
        uint256 tokenAmount,
        uint256 entryPrice,
        uint256 liquidationPrice,
        uint256 stopLoss,
        uint256 takeProfit,
        uint256 fee
    );

    event ShortOpened(
        address indexed user,
        address indexed token,
        uint256 collateral,
        uint256 leverage,
        uint256 positionSize,
        uint256 tokenBorrowed,
        uint256 entryPrice,
        uint256 liquidationPrice,
        uint256 stopLoss,
        uint256 takeProfit,
        uint256 fee
    );

    event PositionClosed(
        address indexed user,
        address indexed token,
        bool wasLong,
        uint256 entryPrice,
        uint256 exitPrice,
        int256 pnl,
        uint256 baseFee,
        uint256 successFee,
        string reason // "user", "bot", "stoploss", "takeprofit", "liquidation"
    );

    event StopLossTriggered(address indexed user, address indexed token, uint256 triggerPrice);
    event TakeProfitTriggered(address indexed user, address indexed token, uint256 triggerPrice);
    event PositionLiquidated(address indexed user, address indexed token, uint256 liquidationPrice);

    event CooldownStarted(address indexed user, address indexed token, uint256 cooldownEnds);
    event AutoTradeToggled(address indexed user, bool enabled);
    event RiskLevelChanged(address indexed user, uint256 oldLevel, uint256 newLevel);
    event FeesWithdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error UnauthorizedBot();
    error AutoTradeDisabled();
    error InvalidToken();
    error InsufficientBalance();
    error NoOpenPosition();
    error PositionAlreadyExists();
    error InvalidLeverage();
    error InvalidStopLoss();
    error InvalidTakeProfit();
    error OracleNotConfigured();
    error OracleStale();
    error OracleInvalidPrice();
    error TokenOnCooldown(address token, uint256 remainingSeconds);
    error SlippageExceeded();
    error ZeroAmount();
    error InvalidRiskLevel();
    error NoFeesToWithdraw();
    error InvalidAddress();
    error BelowMinimumBalance();
    error PositionNotLiquidatable();
    error StopLossNotTriggered();
    error TakeProfitNotTriggered();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _usdc,
        address _botAddress,
        address _swapRouter,
        address _aavePool,
        address _treasury,
        address _wrappedNative
    ) {
        if (_usdc == address(0) || _botAddress == address(0) ||
            _swapRouter == address(0) || _aavePool == address(0) ||
            _treasury == address(0) || _wrappedNative == address(0)) {
            revert InvalidAddress();
        }

        USDC = IERC20(_usdc);
        BOT_ADDRESS = _botAddress;
        SWAP_ROUTER = _swapRouter;
        AAVE_POOL = _aavePool;
        treasuryAddress = _treasury;
        WRAPPED_NATIVE = _wrappedNative;

        // Approve Uniswap router for USDC
        IERC20(_usdc).safeApprove(_swapRouter, type(uint256).max);

        // Approve Aave pool for USDC
        IERC20(_usdc).safeApprove(_aavePool, type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                         ORACLE CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Configure Chainlink oracle for a token
     * @param token Token address (e.g., WETH)
     * @param priceFeed Chainlink price feed address
     */
    function configureOracle(address token, address priceFeed) external onlyOwner {
        if (token == address(0) || priceFeed == address(0)) revert InvalidAddress();

        uint8 decimals = AggregatorV3Interface(priceFeed).decimals();

        oracles[token] = OracleConfig({
            priceFeed: priceFeed,
            decimals: decimals,
            isActive: true
        });

        emit OracleConfigured(token, priceFeed, decimals);
    }

    /**
     * @notice Get current price from Chainlink oracle
     * @param token Token to get price for
     * @return price Price in USD with 8 decimals
     */
    function getOraclePrice(address token) public view returns (uint256 price) {
        OracleConfig storage config = oracles[token];
        if (!config.isActive) revert OracleNotConfigured();

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(config.priceFeed).latestRoundData();

        // Validate oracle data
        if (answer <= 0) revert OracleInvalidPrice();
        if (updatedAt == 0) revert OracleStale();
        if (block.timestamp - updatedAt > ORACLE_STALENESS) revert OracleStale();
        if (answeredInRound < roundId) revert OracleStale();

        return uint256(answer);
    }

    /*//////////////////////////////////////////////////////////////
                            USER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit USDC into vault
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalValueLocked += amount;

        emit Deposited(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Withdraw available USDC (not locked in positions)
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        totalValueLocked -= amount;
        USDC.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Withdraw all available USDC
    function withdrawAll() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert ZeroAmount();

        balances[msg.sender] = 0;
        totalValueLocked -= amount;
        USDC.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, 0);
    }

    /// @notice Enable/disable auto-trading
    function setAutoTrade(bool enabled) external {
        if (enabled && balances[msg.sender] < MIN_VAULT_BALANCE) {
            revert BelowMinimumBalance();
        }
        autoTradeEnabled[msg.sender] = enabled;
        emit AutoTradeToggled(msg.sender, enabled);
    }

    /// @notice Set risk level (1-100%)
    function setRiskLevel(uint256 levelBps) external {
        if (levelBps < MIN_RISK_LEVEL || levelBps > MAX_RISK_LEVEL) {
            revert InvalidRiskLevel();
        }
        uint256 oldLevel = userRiskLevel[msg.sender];
        userRiskLevel[msg.sender] = levelBps;
        emit RiskLevelChanged(msg.sender, oldLevel, levelBps);
    }

    /// @notice Emergency stop auto-trading
    function emergencyStopAutoTrade() external {
        autoTradeEnabled[msg.sender] = false;
        emit AutoTradeToggled(msg.sender, false);
    }

    /*//////////////////////////////////////////////////////////////
                          BOT FUNCTIONS - LONG
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a leveraged LONG position with ISOLATED margin
     * @param user User address
     * @param token Token to go long on
     * @param collateralAmount USDC collateral (isolated for this position)
     * @param leverage Leverage multiplier (1-20)
     * @param stopLossPercent Stop-loss as % below entry (e.g., 500 = 5%)
     * @param takeProfitPercent Take-profit as % above entry (e.g., 1000 = 10%)
     * @param minTokenOut Minimum tokens to receive (slippage protection)
     */
    function openLong(
        address user,
        address token,
        uint256 collateralAmount,
        uint256 leverage,
        uint256 stopLossPercent,
        uint256 takeProfitPercent,
        uint256 minTokenOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenOut)
    {
        // Validations
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (!autoTradeEnabled[user]) revert AutoTradeDisabled();
        if (token == address(0) || token == address(USDC)) revert InvalidToken();
        if (balances[user] < collateralAmount) revert InsufficientBalance();
        if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) revert InvalidLeverage();
        if (positions[user][token].isActive) revert PositionAlreadyExists();
        if (!oracles[token].isActive) revert OracleNotConfigured();

        // Check cooldown
        uint256 cooldownEnds = lastCloseTime[user][token] + MIN_TRADE_INTERVAL;
        if (block.timestamp < cooldownEnds) {
            revert TokenOnCooldown(token, cooldownEnds - block.timestamp);
        }

        // Get current price from Chainlink
        uint256 entryPrice = getOraclePrice(token);

        // Calculate position size and fees
        uint256 positionSize = collateralAmount * leverage;
        uint256 borrowAmount = positionSize - collateralAmount;
        uint256 fee = (positionSize * BASE_FEE) / BASIS_POINTS;
        uint256 actualTradeAmount = positionSize - fee;

        // Deduct collateral from user balance (ISOLATED - locked for this position)
        balances[user] -= collateralAmount;
        accumulatedFees += fee;

        // Supply collateral to Aave
        IAavePool(AAVE_POOL).supply(address(USDC), collateralAmount, address(this), 0);

        // Borrow additional USDC if leveraged
        if (borrowAmount > 0) {
            IAavePool(AAVE_POOL).borrow(address(USDC), borrowAmount, VARIABLE_RATE, 0, address(this));
        }

        // Swap USDC for token
        tokenOut = _swapV3(address(USDC), token, actualTradeAmount, minTokenOut);

        // Calculate liquidation price for LONG
        // Liquidation when: (currentPrice - entryPrice) / entryPrice * leverage = -80%
        // liquidationPrice = entryPrice * (1 - 0.8 / leverage)
        uint256 liquidationPrice = entryPrice - (entryPrice * LIQUIDATION_THRESHOLD) / (BASIS_POINTS * leverage);

        // Calculate SL/TP prices
        uint256 stopLossPrice = stopLossPercent > 0
            ? entryPrice - (entryPrice * stopLossPercent) / BASIS_POINTS
            : 0;
        uint256 takeProfitPrice = takeProfitPercent > 0
            ? entryPrice + (entryPrice * takeProfitPercent) / BASIS_POINTS
            : 0;

        // Validate SL is above liquidation
        if (stopLossPrice > 0 && stopLossPrice <= liquidationPrice) revert InvalidStopLoss();

        // Store position (ISOLATED)
        positions[user][token] = Position({
            isLong: true,
            isActive: true,
            tokenAmount: tokenOut,
            entryPrice: entryPrice,
            collateral: collateralAmount,
            borrowedAmount: borrowAmount,
            leverage: leverage,
            stopLossPrice: stopLossPrice,
            takeProfitPrice: takeProfitPrice,
            openedAt: block.timestamp,
            liquidationPrice: liquidationPrice
        });

        emit LongOpened(
            user, token, collateralAmount, leverage, positionSize,
            tokenOut, entryPrice, liquidationPrice, stopLossPrice, takeProfitPrice, fee
        );
        return tokenOut;
    }

    /**
     * @notice Close a LONG position
     * @param user User address
     * @param token Token to close
     * @param minUsdcOut Minimum USDC to receive
     */
    function closeLong(
        address user,
        address token,
        uint256 minUsdcOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 returnAmount)
    {
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        return _closeLong(user, token, minUsdcOut, "bot");
    }

    /*//////////////////////////////////////////////////////////////
                          BOT FUNCTIONS - SHORT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a leveraged SHORT position with ISOLATED margin
     * @param user User address
     * @param token Token to short
     * @param collateralAmount USDC collateral (isolated)
     * @param leverage Leverage multiplier (1-20)
     * @param stopLossPercent Stop-loss as % above entry
     * @param takeProfitPercent Take-profit as % below entry
     * @param minUsdcOut Minimum USDC from selling tokens
     */
    function openShort(
        address user,
        address token,
        uint256 collateralAmount,
        uint256 leverage,
        uint256 stopLossPercent,
        uint256 takeProfitPercent,
        uint256 minUsdcOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcReceived)
    {
        // Validations
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (!autoTradeEnabled[user]) revert AutoTradeDisabled();
        if (token == address(0) || token == address(USDC)) revert InvalidToken();
        if (balances[user] < collateralAmount) revert InsufficientBalance();
        if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) revert InvalidLeverage();
        if (positions[user][token].isActive) revert PositionAlreadyExists();
        if (!oracles[token].isActive) revert OracleNotConfigured();

        // Check cooldown
        uint256 cooldownEnds = lastCloseTime[user][token] + MIN_TRADE_INTERVAL;
        if (block.timestamp < cooldownEnds) {
            revert TokenOnCooldown(token, cooldownEnds - block.timestamp);
        }

        // Get current price from Chainlink
        uint256 entryPrice = getOraclePrice(token);

        // Calculate position size
        uint256 positionSize = collateralAmount * leverage;
        uint256 fee = (positionSize * BASE_FEE) / BASIS_POINTS;

        // Deduct collateral from user balance (ISOLATED)
        balances[user] -= collateralAmount;
        accumulatedFees += fee;

        // Supply collateral to Aave
        IAavePool(AAVE_POOL).supply(address(USDC), collateralAmount, address(this), 0);

        // Approve token for Aave repayment
        IERC20(token).safeApprove(AAVE_POOL, type(uint256).max);
        IERC20(token).safeApprove(SWAP_ROUTER, type(uint256).max);

        // Calculate tokens to borrow based on position size and current price
        // positionSize is in USDC (6 decimals), entryPrice is 8 decimals
        uint256 tokensToBorrow = (positionSize * 1e8) / entryPrice;

        // Borrow tokens from Aave
        IAavePool(AAVE_POOL).borrow(token, tokensToBorrow, VARIABLE_RATE, 0, address(this));

        // Sell borrowed tokens for USDC
        usdcReceived = _swapV3(token, address(USDC), tokensToBorrow, minUsdcOut);

        // Calculate liquidation price for SHORT
        // Liquidation when: (entryPrice - currentPrice) / entryPrice * leverage = -80%
        // liquidationPrice = entryPrice * (1 + 0.8 / leverage)
        uint256 liquidationPrice = entryPrice + (entryPrice * LIQUIDATION_THRESHOLD) / (BASIS_POINTS * leverage);

        // Calculate SL/TP prices (inverted for shorts)
        uint256 stopLossPrice = stopLossPercent > 0
            ? entryPrice + (entryPrice * stopLossPercent) / BASIS_POINTS
            : 0;
        uint256 takeProfitPrice = takeProfitPercent > 0
            ? entryPrice - (entryPrice * takeProfitPercent) / BASIS_POINTS
            : 0;

        // Validate SL is below liquidation
        if (stopLossPrice > 0 && stopLossPrice >= liquidationPrice) revert InvalidStopLoss();

        // Store position (ISOLATED)
        positions[user][token] = Position({
            isLong: false,
            isActive: true,
            tokenAmount: tokensToBorrow,
            entryPrice: entryPrice,
            collateral: collateralAmount,
            borrowedAmount: tokensToBorrow,
            leverage: leverage,
            stopLossPrice: stopLossPrice,
            takeProfitPrice: takeProfitPrice,
            openedAt: block.timestamp,
            liquidationPrice: liquidationPrice
        });

        emit ShortOpened(
            user, token, collateralAmount, leverage, positionSize,
            tokensToBorrow, entryPrice, liquidationPrice, stopLossPrice, takeProfitPrice, fee
        );
        return usdcReceived;
    }

    /**
     * @notice Close a SHORT position
     * @param user User address
     * @param token Token to close
     * @param maxUsdcIn Maximum USDC to spend buying back tokens
     */
    function closeShort(
        address user,
        address token,
        uint256 maxUsdcIn
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 returnAmount)
    {
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        return _closeShort(user, token, maxUsdcIn, "bot");
    }

    /*//////////////////////////////////////////////////////////////
                      AUTOMATED SL/TP/LIQUIDATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Check if position should be stopped out, take profit, or liquidated
     * @param user User address
     * @param token Token address
     * @return shouldClose True if position should be closed
     * @return reason "stoploss", "takeprofit", "liquidation", or ""
     */
    function checkPositionStatus(address user, address token)
        external
        view
        returns (bool shouldClose, string memory reason)
    {
        Position storage pos = positions[user][token];
        if (!pos.isActive) return (false, "");

        uint256 currentPrice = getOraclePrice(token);

        if (pos.isLong) {
            // LONG: liquidation if price drops below liquidation price
            if (currentPrice <= pos.liquidationPrice) return (true, "liquidation");
            // LONG: stop-loss if price drops below SL
            if (pos.stopLossPrice > 0 && currentPrice <= pos.stopLossPrice) return (true, "stoploss");
            // LONG: take-profit if price rises above TP
            if (pos.takeProfitPrice > 0 && currentPrice >= pos.takeProfitPrice) return (true, "takeprofit");
        } else {
            // SHORT: liquidation if price rises above liquidation price
            if (currentPrice >= pos.liquidationPrice) return (true, "liquidation");
            // SHORT: stop-loss if price rises above SL
            if (pos.stopLossPrice > 0 && currentPrice >= pos.stopLossPrice) return (true, "stoploss");
            // SHORT: take-profit if price drops below TP
            if (pos.takeProfitPrice > 0 && currentPrice <= pos.takeProfitPrice) return (true, "takeprofit");
        }

        return (false, "");
    }

    /**
     * @notice Execute stop-loss (can be called by anyone)
     */
    function executeStopLoss(address user, address token) external nonReentrant {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoOpenPosition();

        uint256 currentPrice = getOraclePrice(token);

        bool triggered = pos.isLong
            ? (pos.stopLossPrice > 0 && currentPrice <= pos.stopLossPrice)
            : (pos.stopLossPrice > 0 && currentPrice >= pos.stopLossPrice);

        if (!triggered) revert StopLossNotTriggered();

        emit StopLossTriggered(user, token, currentPrice);

        if (pos.isLong) {
            _closeLong(user, token, 0, "stoploss");
        } else {
            _closeShort(user, token, type(uint256).max, "stoploss");
        }
    }

    /**
     * @notice Execute take-profit (can be called by anyone)
     */
    function executeTakeProfit(address user, address token) external nonReentrant {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoOpenPosition();

        uint256 currentPrice = getOraclePrice(token);

        bool triggered = pos.isLong
            ? (pos.takeProfitPrice > 0 && currentPrice >= pos.takeProfitPrice)
            : (pos.takeProfitPrice > 0 && currentPrice <= pos.takeProfitPrice);

        if (!triggered) revert TakeProfitNotTriggered();

        emit TakeProfitTriggered(user, token, currentPrice);

        if (pos.isLong) {
            _closeLong(user, token, 0, "takeprofit");
        } else {
            _closeShort(user, token, type(uint256).max, "takeprofit");
        }
    }

    /**
     * @notice Liquidate an underwater position (can be called by anyone)
     */
    function liquidatePosition(address user, address token) external nonReentrant {
        Position storage pos = positions[user][token];
        if (!pos.isActive) revert NoOpenPosition();

        uint256 currentPrice = getOraclePrice(token);

        bool liquidatable = pos.isLong
            ? currentPrice <= pos.liquidationPrice
            : currentPrice >= pos.liquidationPrice;

        if (!liquidatable) revert PositionNotLiquidatable();

        emit PositionLiquidated(user, token, currentPrice);

        if (pos.isLong) {
            _closeLong(user, token, 0, "liquidation");
        } else {
            _closeShort(user, token, type(uint256).max, "liquidation");
        }
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL CLOSE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _closeLong(
        address user,
        address token,
        uint256 minUsdcOut,
        string memory reason
    ) internal returns (uint256 returnAmount) {
        Position storage pos = positions[user][token];
        if (!pos.isActive || !pos.isLong) revert NoOpenPosition();

        uint256 exitPrice = getOraclePrice(token);

        // Swap tokens back to USDC
        uint256 usdcReceived = _swapV3(token, address(USDC), pos.tokenAmount, minUsdcOut);

        // Repay borrowed amount if any
        if (pos.borrowedAmount > 0) {
            IAavePool(AAVE_POOL).repay(address(USDC), pos.borrowedAmount, VARIABLE_RATE, address(this));
        }

        // Withdraw collateral from Aave
        IAavePool(AAVE_POOL).withdraw(address(USDC), pos.collateral, address(this));

        // Calculate PnL
        uint256 totalCost = pos.collateral + pos.borrowedAmount;
        int256 grossPnl = int256(usdcReceived) - int256(totalCost);

        // Calculate fees
        uint256 baseFee = (usdcReceived * BASE_FEE) / BASIS_POINTS;
        uint256 successFee = 0;
        if (grossPnl > 0) {
            successFee = (uint256(grossPnl) * SUCCESS_FEE) / BASIS_POINTS;
        }
        uint256 totalFees = baseFee + successFee;
        accumulatedFees += totalFees;

        // Net PnL after fees
        int256 netPnl = grossPnl - int256(totalFees);

        // Credit user balance (collateral + net PnL)
        if (netPnl >= 0) {
            returnAmount = pos.collateral + uint256(netPnl);
        } else {
            uint256 loss = uint256(-netPnl);
            returnAmount = pos.collateral > loss ? pos.collateral - loss : 0;
        }
        balances[user] += returnAmount;

        // Clear position
        delete positions[user][token];

        // Start cooldown
        lastCloseTime[user][token] = block.timestamp;
        emit CooldownStarted(user, token, block.timestamp + MIN_TRADE_INTERVAL);

        emit PositionClosed(user, token, true, pos.entryPrice, exitPrice, netPnl, baseFee, successFee, reason);
        return returnAmount;
    }

    function _closeShort(
        address user,
        address token,
        uint256 maxUsdcIn,
        string memory reason
    ) internal returns (uint256 returnAmount) {
        Position storage pos = positions[user][token];
        if (!pos.isActive || pos.isLong) revert NoOpenPosition();

        uint256 exitPrice = getOraclePrice(token);

        // Calculate USDC needed to buy back tokens
        uint256 usdcNeeded = (pos.tokenAmount * exitPrice) / 1e8;
        if (usdcNeeded > maxUsdcIn) revert SlippageExceeded();

        // Swap USDC for tokens to repay
        _swapV3(address(USDC), token, usdcNeeded, pos.tokenAmount);

        // Repay borrowed tokens to Aave
        IAavePool(AAVE_POOL).repay(token, pos.tokenAmount, VARIABLE_RATE, address(this));

        // Withdraw collateral from Aave
        IAavePool(AAVE_POOL).withdraw(address(USDC), pos.collateral, address(this));

        // Calculate PnL for short: profit if exitPrice < entryPrice
        int256 priceDiff = int256(pos.entryPrice) - int256(exitPrice);
        int256 grossPnl = (priceDiff * int256(pos.tokenAmount)) / 1e8;

        // Calculate fees
        uint256 baseFee = (usdcNeeded * BASE_FEE) / BASIS_POINTS;
        uint256 successFee = 0;
        if (grossPnl > 0) {
            successFee = (uint256(grossPnl) * SUCCESS_FEE) / BASIS_POINTS;
        }
        uint256 totalFees = baseFee + successFee;
        accumulatedFees += totalFees;

        // Net PnL
        int256 netPnl = grossPnl - int256(totalFees);

        // Credit user balance
        if (netPnl >= 0) {
            returnAmount = pos.collateral + uint256(netPnl);
        } else {
            uint256 loss = uint256(-netPnl);
            returnAmount = pos.collateral > loss ? pos.collateral - loss : 0;
        }
        balances[user] += returnAmount;

        // Clear position
        delete positions[user][token];

        // Start cooldown
        lastCloseTime[user][token] = block.timestamp;
        emit CooldownStarted(user, token, block.timestamp + MIN_TRADE_INTERVAL);

        emit PositionClosed(user, token, false, pos.entryPrice, exitPrice, netPnl, baseFee, successFee, reason);
        return returnAmount;
    }

    /*//////////////////////////////////////////////////////////////
                          OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;
        USDC.safeTransfer(treasuryAddress, fees);

        emit FeesWithdrawn(treasuryAddress, fees);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasuryAddress;
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Approve tokens for Aave/Uniswap
    function approveToken(address token, address spender) external onlyOwner {
        IERC20(token).safeApprove(spender, type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _swapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        if (tokenIn != address(USDC)) {
            IERC20(tokenIn).safeApprove(SWAP_ROUTER, amountIn);
        }

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: POOL_FEE,
            recipient: address(this),
            deadline: block.timestamp + SWAP_DEADLINE,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISwapRouter(SWAP_ROUTER).exactInputSingle(params);
        if (amountOut < minAmountOut) revert SlippageExceeded();
        return amountOut;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getPosition(address user, address token) external view returns (Position memory) {
        return positions[user][token];
    }

    function hasOpenPosition(address user, address token) external view returns (bool) {
        return positions[user][token].isActive;
    }

    function canOpenPosition(address user, address token) external view returns (bool) {
        if (positions[user][token].isActive) return false;
        uint256 cooldownEnds = lastCloseTime[user][token] + MIN_TRADE_INTERVAL;
        return block.timestamp >= cooldownEnds;
    }

    function getCooldownRemaining(address user, address token) external view returns (uint256) {
        uint256 cooldownEnds = lastCloseTime[user][token] + MIN_TRADE_INTERVAL;
        if (block.timestamp >= cooldownEnds) return 0;
        return cooldownEnds - block.timestamp;
    }

    /**
     * @notice Calculate current PnL for a position
     */
    function getPositionPnL(address user, address token) external view returns (int256 pnl, int256 pnlPercent) {
        Position storage pos = positions[user][token];
        if (!pos.isActive) return (0, 0);

        uint256 currentPrice = getOraclePrice(token);

        if (pos.isLong) {
            int256 priceDiff = int256(currentPrice) - int256(pos.entryPrice);
            pnl = (priceDiff * int256(pos.tokenAmount)) / 1e8;
        } else {
            int256 priceDiff = int256(pos.entryPrice) - int256(currentPrice);
            pnl = (priceDiff * int256(pos.tokenAmount)) / 1e8;
        }

        // PnL percent relative to collateral (includes leverage effect)
        pnlPercent = (pnl * 10000) / int256(pos.collateral);

        return (pnl, pnlPercent);
    }

    function getMaxLeverage() external pure returns (uint256) { return MAX_LEVERAGE; }
    function getBaseFee() external pure returns (uint256) { return BASE_FEE; }
    function getSuccessFee() external pure returns (uint256) { return SUCCESS_FEE; }
    function getPoolFee() external pure returns (uint24) { return POOL_FEE; }
    function getMinVaultBalance() external pure returns (uint256) { return MIN_VAULT_BALANCE; }

    function getUserRiskLevel(address user) external view returns (uint256) {
        uint256 level = userRiskLevel[user];
        return level == 0 ? DEFAULT_RISK_LEVEL : level;
    }

    function getContractInfo() external view returns (
        uint256 tvl,
        uint256 platformFees,
        uint256 baseFee,
        uint256 successFee,
        uint24 poolFee,
        uint256 minBalance,
        uint256 maxLeverage
    ) {
        return (
            totalValueLocked,
            accumulatedFees,
            BASE_FEE,
            SUCCESS_FEE,
            POOL_FEE,
            MIN_VAULT_BALANCE,
            MAX_LEVERAGE
        );
    }
}
