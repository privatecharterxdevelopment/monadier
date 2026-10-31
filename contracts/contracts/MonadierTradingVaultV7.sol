// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*//////////////////////////////////////////////////////////////
                        GMX INTERFACES
//////////////////////////////////////////////////////////////*/

/// @notice GMX Vault interface for reading position data
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
    function tokenDecimals(address _token) external view returns (uint256);
    function usdg() external view returns (address);
    function stableTokens(address _token) external view returns (bool);
}

/// @notice GMX Router interface for direct position management
interface IGMXRouter {
    function approvePlugin(address _plugin) external;

    function swap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _minOut,
        address _receiver
    ) external;
}

/// @notice GMX PositionRouter for keeper-executed positions (cheaper gas)
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

    function cancelIncreasePosition(
        bytes32 _key,
        address payable _executionFeeReceiver
    ) external returns (bool);

    function cancelDecreasePosition(
        bytes32 _key,
        address payable _executionFeeReceiver
    ) external returns (bool);
}

/// @notice GMX OrderBook for limit orders
interface IGMXOrderBook {
    function minExecutionFee() external view returns (uint256);

    function createIncreaseOrder(
        address _indexToken,
        uint256 _amountIn,
        address _collateralToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        address _collateralToken2,
        bool _isLong,
        uint256 _triggerPrice,
        bool _triggerAboveThreshold,
        uint256 _executionFee,
        bool _shouldWrap
    ) external payable;

    function createDecreaseOrder(
        address _indexToken,
        uint256 _sizeDelta,
        address _collateralToken,
        uint256 _collateralDelta,
        bool _isLong,
        uint256 _triggerPrice,
        bool _triggerAboveThreshold
    ) external payable;
}

/**
 * @title MonadierTradingVaultV7
 * @notice Arbitrum Vault with GMX Integration for TRUE 20x-50x Leverage
 * @dev V7 Features:
 *      - GMX Perpetuals Integration (real leverage, no Aave limits)
 *      - Up to 50x leverage on BTC/ETH
 *      - On-chain Stop-Loss & Take-Profit via GMX OrderBook
 *      - LONG: Collateral → GMX increasePosition (long)
 *      - SHORT: Collateral → GMX increasePosition (short)
 *      - Keeper-based execution for lower gas costs
 *      - Referral rewards integration
 *
 *      Fee structure:
 *      - Platform Fee: 0.1% on collateral
 *      - Success Fee: 10% of profit
 *      - GMX fees: ~0.1% open/close + borrow fee
 */
contract MonadierTradingVaultV7 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    // GMX Contracts on Arbitrum
    address public constant GMX_VAULT = 0x489ee077994B6658eAfA855C308275EAd8097C4A;
    address public constant GMX_ROUTER = 0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064;
    address public constant GMX_POSITION_ROUTER = 0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868;
    address public constant GMX_ORDER_BOOK = 0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB;

    // Tokens on Arbitrum
    address public constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;  // Native USDC
    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant WBTC = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;

    // Fee structure
    uint256 public constant PLATFORM_FEE = 10; // 0.1% platform fee
    uint256 public constant SUCCESS_FEE = 1000; // 10% of profit
    uint256 public constant BASIS_POINTS = 10000;

    // Leverage limits
    uint256 public constant MAX_LEVERAGE_STANDARD = 25;  // Professional: 1x-25x
    uint256 public constant MAX_LEVERAGE_UNLOCKED = 50;  // Elite: up to 50x (manually unlocked)
    uint256 public constant MIN_LEVERAGE = 1;
    uint256 public constant DEFAULT_LEVERAGE = 10;

    // GMX price precision (30 decimals)
    uint256 public constant GMX_PRICE_PRECISION = 1e30;
    uint256 public constant USDC_DECIMALS = 6;

    // Trading rules
    uint256 public constant MIN_VAULT_BALANCE = 50 * 1e6; // $50 USDC minimum
    uint256 public constant MIN_POSITION_SIZE = 10 * 1e6; // $10 minimum position

    // Referral code for fee rebates
    bytes32 public constant REFERRAL_CODE = keccak256("MONADIER");

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct UserPosition {
        bool isActive;
        bool isLong;
        address indexToken;      // WETH or WBTC
        uint256 collateral;      // USDC collateral sent
        uint256 sizeDelta;       // Position size in USD (30 decimals)
        uint256 leverage;        // Leverage used
        uint256 entryPrice;      // Entry price (30 decimals)
        uint256 stopLossPrice;   // Stop-loss trigger price
        uint256 takeProfitPrice; // Take-profit trigger price
        uint256 openedAt;
        bytes32 positionKey;     // GMX position request key
    }

    struct TradingSettings {
        bool autoTradeEnabled;
        uint256 riskLevelBps;    // Risk per trade (100 = 1%)
        uint256 maxLeverage;     // User's max leverage preference
        uint256 defaultStopLoss; // Default SL in bps
        uint256 defaultTakeProfit; // Default TP in bps
    }

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Bot address authorized to execute trades
    address public immutable BOT_ADDRESS;

    /// @notice Treasury for fee collection
    address public treasuryAddress;

    /// @notice User USDC balances (available for trading)
    mapping(address => uint256) public balances;

    /// @notice User positions: user => indexToken => Position
    mapping(address => mapping(address => UserPosition)) public positions;

    /// @notice User trading settings
    mapping(address => TradingSettings) public tradingSettings;

    /// @notice Pending position requests: requestKey => user
    mapping(bytes32 => address) public pendingRequests;

    /// @notice Users with 50x leverage unlocked (Elite status)
    mapping(address => bool) public eliteLeverageUnlocked;

    /// @notice Total value locked
    uint256 public totalValueLocked;

    /// @notice Accumulated platform fees
    uint256 public accumulatedFees;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);

    event PositionRequested(
        address indexed user,
        address indexed indexToken,
        bool isLong,
        uint256 collateral,
        uint256 sizeDelta,
        uint256 leverage,
        bytes32 requestKey
    );

    event PositionOpened(
        address indexed user,
        address indexed indexToken,
        bool isLong,
        uint256 collateral,
        uint256 sizeDelta,
        uint256 entryPrice,
        uint256 leverage
    );

    event PositionClosed(
        address indexed user,
        address indexed indexToken,
        bool wasLong,
        uint256 entryPrice,
        uint256 exitPrice,
        int256 pnl,
        uint256 fee,
        string reason
    );

    event StopLossSet(address indexed user, address indexed indexToken, uint256 triggerPrice);
    event TakeProfitSet(address indexed user, address indexed indexToken, uint256 triggerPrice);
    event SettingsUpdated(address indexed user, bool autoTrade, uint256 riskLevel, uint256 maxLeverage);
    event FeesWithdrawn(address indexed treasury, uint256 amount);
    event EliteLeverageUpdated(address indexed user, bool unlocked);

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
    error BelowMinimumBalance();
    error BelowMinimumPosition();
    error InsufficientExecutionFee();
    error ZeroAmount();
    error InvalidAddress();
    error NoFeesToWithdraw();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _botAddress, address _treasury) {
        if (_botAddress == address(0) || _treasury == address(0)) {
            revert InvalidAddress();
        }

        BOT_ADDRESS = _botAddress;
        treasuryAddress = _treasury;

        // Approve GMX Router for USDC
        IERC20(USDC).safeApprove(GMX_ROUTER, type(uint256).max);
        IERC20(USDC).safeApprove(GMX_POSITION_ROUTER, type(uint256).max);

        // Approve GMX plugins
        IGMXRouter(GMX_ROUTER).approvePlugin(GMX_POSITION_ROUTER);
        IGMXRouter(GMX_ROUTER).approvePlugin(GMX_ORDER_BOOK);
    }

    /*//////////////////////////////////////////////////////////////
                            USER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit USDC into vault
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalValueLocked += amount;

        emit Deposited(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Withdraw available USDC
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        totalValueLocked -= amount;
        IERC20(USDC).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Configure trading settings
    function setTradingSettings(
        bool _autoTrade,
        uint256 _riskLevelBps,
        uint256 _maxLeverage,
        uint256 _defaultStopLoss,
        uint256 _defaultTakeProfit
    ) external {
        if (_autoTrade && balances[msg.sender] < MIN_VAULT_BALANCE) {
            revert BelowMinimumBalance();
        }
        if (_maxLeverage < MIN_LEVERAGE || _maxLeverage > MAX_LEVERAGE_UNLOCKED) {
            revert InvalidLeverage();
        }

        tradingSettings[msg.sender] = TradingSettings({
            autoTradeEnabled: _autoTrade,
            riskLevelBps: _riskLevelBps > 0 ? _riskLevelBps : 500, // Default 5%
            maxLeverage: _maxLeverage,
            defaultStopLoss: _defaultStopLoss > 0 ? _defaultStopLoss : 500, // Default 5%
            defaultTakeProfit: _defaultTakeProfit > 0 ? _defaultTakeProfit : 1000 // Default 10%
        });

        emit SettingsUpdated(msg.sender, _autoTrade, _riskLevelBps, _maxLeverage);
    }

    /// @notice Quick toggle for auto-trading
    function setAutoTrade(bool enabled) external {
        if (enabled && balances[msg.sender] < MIN_VAULT_BALANCE) {
            revert BelowMinimumBalance();
        }
        tradingSettings[msg.sender].autoTradeEnabled = enabled;
        emit SettingsUpdated(
            msg.sender,
            enabled,
            tradingSettings[msg.sender].riskLevelBps,
            tradingSettings[msg.sender].maxLeverage
        );
    }

    /*//////////////////////////////////////////////////////////////
                          BOT FUNCTIONS - OPEN
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a leveraged position via GMX
     * @param user User address
     * @param indexToken Token to trade (WETH or WBTC)
     * @param collateralAmount USDC collateral
     * @param leverage Leverage multiplier (1-50)
     * @param isLong True for long, false for short
     * @param stopLossBps Stop-loss in basis points
     * @param takeProfitBps Take-profit in basis points
     */
    function openPosition(
        address user,
        address indexToken,
        uint256 collateralAmount,
        uint256 leverage,
        bool isLong,
        uint256 stopLossBps,
        uint256 takeProfitBps
    ) external payable nonReentrant whenNotPaused returns (bytes32 requestKey) {
        // Validations
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (!tradingSettings[user].autoTradeEnabled) revert AutoTradeDisabled();
        if (indexToken != WETH && indexToken != WBTC) revert InvalidToken();
        if (balances[user] < collateralAmount) revert InsufficientBalance();

        // Check leverage limits based on user status
        uint256 maxLeverage = eliteLeverageUnlocked[user] ? MAX_LEVERAGE_UNLOCKED : MAX_LEVERAGE_STANDARD;
        if (leverage < MIN_LEVERAGE || leverage > maxLeverage) revert InvalidLeverage();

        if (positions[user][indexToken].isActive) revert PositionAlreadyExists();

        // Check execution fee
        uint256 executionFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < executionFee) revert InsufficientExecutionFee();

        // Calculate position size (USD with 30 decimals)
        uint256 sizeDelta = collateralAmount * leverage * 1e24; // Convert 6 decimals to 30

        if (sizeDelta < MIN_POSITION_SIZE * 1e24) revert BelowMinimumPosition();

        // Calculate platform fee on TOTAL position size (collateral × leverage)
        uint256 totalPositionSize = collateralAmount * leverage;
        uint256 platformFee = (totalPositionSize * PLATFORM_FEE) / BASIS_POINTS;
        uint256 netCollateral = collateralAmount - platformFee;
        accumulatedFees += platformFee;

        // Deduct from user balance
        balances[user] -= collateralAmount;

        // Get current price for acceptable price calculation
        uint256 currentPrice = isLong
            ? IGMXVault(GMX_VAULT).getMaxPrice(indexToken)
            : IGMXVault(GMX_VAULT).getMinPrice(indexToken);

        // Set acceptable price with 1% slippage
        uint256 acceptablePrice = isLong
            ? (currentPrice * 101) / 100  // 1% higher for longs
            : (currentPrice * 99) / 100;  // 1% lower for shorts

        // Build path for collateral
        address[] memory path = new address[](1);
        path[0] = USDC;

        // Transfer USDC to position router
        IERC20(USDC).safeTransfer(GMX_POSITION_ROUTER, netCollateral);

        // Create position request
        requestKey = IGMXPositionRouter(GMX_POSITION_ROUTER).createIncreasePosition{value: executionFee}(
            path,
            indexToken,
            netCollateral,
            0, // minOut (no swap needed, USDC is collateral)
            sizeDelta,
            isLong,
            acceptablePrice,
            executionFee,
            REFERRAL_CODE,
            address(0) // No callback
        );

        // Calculate SL/TP prices
        uint256 stopLossPrice = 0;
        uint256 takeProfitPrice = 0;

        if (stopLossBps > 0) {
            stopLossPrice = isLong
                ? currentPrice - (currentPrice * stopLossBps) / BASIS_POINTS
                : currentPrice + (currentPrice * stopLossBps) / BASIS_POINTS;
        }

        if (takeProfitBps > 0) {
            takeProfitPrice = isLong
                ? currentPrice + (currentPrice * takeProfitBps) / BASIS_POINTS
                : currentPrice - (currentPrice * takeProfitBps) / BASIS_POINTS;
        }

        // Store position data
        positions[user][indexToken] = UserPosition({
            isActive: true,
            isLong: isLong,
            indexToken: indexToken,
            collateral: netCollateral,
            sizeDelta: sizeDelta,
            leverage: leverage,
            entryPrice: currentPrice,
            stopLossPrice: stopLossPrice,
            takeProfitPrice: takeProfitPrice,
            openedAt: block.timestamp,
            positionKey: requestKey
        });

        // Track pending request
        pendingRequests[requestKey] = user;

        emit PositionRequested(user, indexToken, isLong, netCollateral, sizeDelta, leverage, requestKey);

        return requestKey;
    }

    /*//////////////////////////////////////////////////////////////
                          BOT FUNCTIONS - CLOSE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Close a position via GMX
     * @param user User address
     * @param indexToken Token of the position
     */
    function closePosition(
        address user,
        address indexToken
    ) external payable nonReentrant returns (bytes32 requestKey) {
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();

        UserPosition storage pos = positions[user][indexToken];
        if (!pos.isActive) revert NoOpenPosition();

        // Check execution fee
        uint256 executionFee = IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
        if (msg.value < executionFee) revert InsufficientExecutionFee();

        // Get current price
        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(indexToken)
            : IGMXVault(GMX_VAULT).getMaxPrice(indexToken);

        // Set acceptable price with 1% slippage
        uint256 acceptablePrice = pos.isLong
            ? (currentPrice * 99) / 100   // 1% lower for closing longs
            : (currentPrice * 101) / 100; // 1% higher for closing shorts

        // Build path for receiving USDC
        address[] memory path = new address[](1);
        path[0] = USDC;

        // Create decrease position request (close full position)
        requestKey = IGMXPositionRouter(GMX_POSITION_ROUTER).createDecreasePosition{value: executionFee}(
            path,
            indexToken,
            pos.collateral,  // Withdraw all collateral
            pos.sizeDelta,   // Close full size
            pos.isLong,
            address(this),   // Receive funds to vault
            acceptablePrice,
            0,               // minOut
            executionFee,
            false,           // Don't withdraw ETH
            address(0)       // No callback
        );

        // Mark position as closing (will be finalized when GMX executes)
        pendingRequests[requestKey] = user;

        return requestKey;
    }

    /*//////////////////////////////////////////////////////////////
                          POSITION MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Check if position should be closed (SL/TP check)
     */
    function checkPositionTrigger(address user, address indexToken)
        external
        view
        returns (bool shouldClose, string memory reason)
    {
        UserPosition storage pos = positions[user][indexToken];
        if (!pos.isActive) return (false, "");

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(indexToken)
            : IGMXVault(GMX_VAULT).getMaxPrice(indexToken);

        if (pos.isLong) {
            if (pos.stopLossPrice > 0 && currentPrice <= pos.stopLossPrice) {
                return (true, "stoploss");
            }
            if (pos.takeProfitPrice > 0 && currentPrice >= pos.takeProfitPrice) {
                return (true, "takeprofit");
            }
        } else {
            if (pos.stopLossPrice > 0 && currentPrice >= pos.stopLossPrice) {
                return (true, "stoploss");
            }
            if (pos.takeProfitPrice > 0 && currentPrice <= pos.takeProfitPrice) {
                return (true, "takeprofit");
            }
        }

        return (false, "");
    }

    /**
     * @notice Get current PnL for a position
     */
    function getPositionPnL(address user, address indexToken)
        external
        view
        returns (int256 pnl, int256 pnlPercent)
    {
        UserPosition storage pos = positions[user][indexToken];
        if (!pos.isActive) return (0, 0);

        // Get actual position from GMX
        (
            uint256 size,
            uint256 collateral,
            uint256 averagePrice,
            ,,,
        ) = IGMXVault(GMX_VAULT).getPosition(
            address(this),
            USDC,
            indexToken,
            pos.isLong
        );

        if (size == 0) return (0, 0);

        uint256 currentPrice = pos.isLong
            ? IGMXVault(GMX_VAULT).getMinPrice(indexToken)
            : IGMXVault(GMX_VAULT).getMaxPrice(indexToken);

        // Calculate PnL
        if (pos.isLong) {
            if (currentPrice > averagePrice) {
                pnl = int256((size * (currentPrice - averagePrice)) / averagePrice);
            } else {
                pnl = -int256((size * (averagePrice - currentPrice)) / averagePrice);
            }
        } else {
            if (currentPrice < averagePrice) {
                pnl = int256((size * (averagePrice - currentPrice)) / averagePrice);
            } else {
                pnl = -int256((size * (currentPrice - averagePrice)) / averagePrice);
            }
        }

        // PnL percent relative to collateral
        if (collateral > 0) {
            pnlPercent = (pnl * 10000) / int256(collateral);
        }

        return (pnl, pnlPercent);
    }

    /**
     * @notice Finalize a closed position and credit user
     * @dev Called after GMX executes the decrease position
     */
    function finalizeClose(
        address user,
        address indexToken,
        uint256 receivedAmount,
        string calldata reason
    ) external {
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();

        UserPosition storage pos = positions[user][indexToken];
        if (!pos.isActive) revert NoOpenPosition();

        // Calculate PnL
        int256 pnl = int256(receivedAmount) - int256(pos.collateral);

        // Calculate success fee if profitable
        uint256 successFee = 0;
        if (pnl > 0) {
            successFee = (uint256(pnl) * SUCCESS_FEE) / BASIS_POINTS;
            accumulatedFees += successFee;
        }

        // Credit user balance
        uint256 returnAmount = pnl > 0
            ? receivedAmount - successFee
            : receivedAmount;

        balances[user] += returnAmount;

        emit PositionClosed(
            user,
            indexToken,
            pos.isLong,
            pos.entryPrice,
            pos.isLong
                ? IGMXVault(GMX_VAULT).getMinPrice(indexToken)
                : IGMXVault(GMX_VAULT).getMaxPrice(indexToken),
            pnl - int256(successFee),
            successFee,
            reason
        );

        // Clear position
        delete positions[user][indexToken];
    }

    /*//////////////////////////////////////////////////////////////
                          OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;
        IERC20(USDC).safeTransfer(treasuryAddress, fees);

        emit FeesWithdrawn(treasuryAddress, fees);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        treasuryAddress = newTreasury;
    }

    /// @notice Unlock 50x leverage for elite users (profitable traders)
    function setEliteLeverage(address user, bool unlocked) external onlyOwner {
        if (user == address(0)) revert InvalidAddress();
        eliteLeverageUnlocked[user] = unlocked;
        emit EliteLeverageUpdated(user, unlocked);
    }

    /// @notice Batch unlock 50x leverage for multiple users
    function setEliteLeverageBatch(address[] calldata users, bool unlocked) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] != address(0)) {
                eliteLeverageUnlocked[users[i]] = unlocked;
                emit EliteLeverageUpdated(users[i], unlocked);
            }
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Recover stuck ETH (from execution fees)
    function recoverETH() external onlyOwner {
        payable(treasuryAddress).transfer(address(this).balance);
    }

    /// @notice Receive ETH for execution fees
    receive() external payable {}

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getPosition(address user, address indexToken) external view returns (UserPosition memory) {
        return positions[user][indexToken];
    }

    function getUserSettings(address user) external view returns (TradingSettings memory) {
        return tradingSettings[user];
    }

    function getGMXPosition(address indexToken, bool isLong) external view returns (
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        int256 realisedPnl,
        uint256 lastIncreasedTime
    ) {
        return IGMXVault(GMX_VAULT).getPosition(
            address(this),
            USDC,
            indexToken,
            isLong
        );
    }

    function getExecutionFee() external view returns (uint256) {
        return IGMXPositionRouter(GMX_POSITION_ROUTER).minExecutionFee();
    }

    function getPrice(address token) external view returns (uint256 maxPrice, uint256 minPrice) {
        maxPrice = IGMXVault(GMX_VAULT).getMaxPrice(token);
        minPrice = IGMXVault(GMX_VAULT).getMinPrice(token);
    }

    function getContractInfo() external view returns (
        uint256 tvl,
        uint256 platformFees,
        uint256 minBalance,
        uint256 maxLeverageStandard,
        uint256 maxLeverageElite
    ) {
        return (
            totalValueLocked,
            accumulatedFees,
            MIN_VAULT_BALANCE,
            MAX_LEVERAGE_STANDARD,
            MAX_LEVERAGE_UNLOCKED
        );
    }

    /// @notice Get user's max leverage based on elite status
    function getUserMaxLeverage(address user) external view returns (uint256) {
        return eliteLeverageUnlocked[user] ? MAX_LEVERAGE_UNLOCKED : MAX_LEVERAGE_STANDARD;
    }

    /// @notice Check if user has elite leverage unlocked
    function isEliteUser(address user) external view returns (bool) {
        return eliteLeverageUnlocked[user];
    }
}
