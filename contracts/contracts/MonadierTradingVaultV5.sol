// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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

/// @notice WETH interface for wrapping/unwrapping
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
}

/**
 * @title MonadierTradingVaultV5
 * @notice Arbitrum Vault with Uniswap V3 (0.05% pools) and new fee structure
 * @dev Fee structure:
 *      - Base Fee: 0.1% per trade (open + close)
 *      - Success Fee: 10% of profit (only on winning trades)
 *      - NO 1% fee anymore!
 *      - Uniswap V3 with 0.05% fee tier for lower trading costs
 */
contract MonadierTradingVaultV5 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable USDC;
    address public immutable BOT_ADDRESS;
    address public immutable SWAP_ROUTER;
    address public immutable WRAPPED_NATIVE; // WETH on Arbitrum

    // Fee structure
    uint256 public constant BASE_FEE = 10; // 0.1% base fee
    uint256 public constant SUCCESS_FEE = 1000; // 10% of profit
    uint256 public constant BASIS_POINTS = 10000;

    // Uniswap V3 pool fee tier (0.05%)
    uint24 public constant POOL_FEE = 500; // 500 = 0.05%

    // Trading rules
    uint256 public constant MIN_VAULT_BALANCE = 100 * 1e6; // $100 USDC (6 decimals)
    uint256 public constant MAX_RISK_LEVEL = 10000; // 100%
    uint256 public constant MIN_RISK_LEVEL = 100; // 1%
    uint256 public constant DEFAULT_RISK_LEVEL = 500; // 5%
    uint256 public constant MIN_TRADE_INTERVAL = 5 minutes; // 5 min cooldown
    uint256 public constant SWAP_DEADLINE = 20 minutes;

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice User USDC balances
    mapping(address => uint256) public balances;

    /// @notice User token balances: user => token => amount
    mapping(address => mapping(address => uint256)) public tokenBalances;

    /// @notice User's entry cost for profit calculation: user => token => usdcSpent
    mapping(address => mapping(address => uint256)) public positionCost;

    /// @notice User's last trade timestamp
    mapping(address => uint256) public lastTradeTime;

    /// @notice Auto-trading enabled per user
    mapping(address => bool) public autoTradeEnabled;

    /// @notice User risk level in basis points
    mapping(address => uint256) public userRiskLevel;

    /// @notice Total value locked (user deposits only)
    uint256 public totalValueLocked;

    /// @notice Accumulated platform fees (NOT user funds!)
    uint256 public accumulatedFees;

    /// @notice Treasury address for fee withdrawals
    address public treasuryAddress;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);
    event PositionOpened(
        address indexed user,
        address indexed token,
        uint256 usdcIn,
        uint256 tokenOut,
        uint256 baseFee
    );
    event PositionClosed(
        address indexed user,
        address indexed token,
        uint256 tokenIn,
        uint256 usdcOut,
        uint256 baseFee,
        uint256 successFee,
        int256 profitLoss,
        string reason
    );
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
    error InsufficientTokenBalance();
    error TradeTooLarge();
    error TradeTooSoon();
    error SlippageExceeded();
    error ZeroAmount();
    error InvalidRiskLevel();
    error NoFeesToWithdraw();
    error InvalidAddress();
    error BelowMinimumBalance();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _usdc,
        address _botAddress,
        address _swapRouter,
        address _treasury,
        address _wrappedNative
    ) {
        if (_usdc == address(0) || _botAddress == address(0) ||
            _swapRouter == address(0) || _treasury == address(0) ||
            _wrappedNative == address(0)) {
            revert InvalidAddress();
        }

        USDC = IERC20(_usdc);
        BOT_ADDRESS = _botAddress;
        SWAP_ROUTER = _swapRouter;
        treasuryAddress = _treasury;
        WRAPPED_NATIVE = _wrappedNative;

        // Approve router for USDC
        IERC20(_usdc).safeApprove(_swapRouter, type(uint256).max);
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

    /// @notice Withdraw USDC from vault - USER CAN ALWAYS WITHDRAW THEIR OWN FUNDS
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();

        balances[msg.sender] -= amount;
        totalValueLocked -= amount;
        USDC.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Withdraw all USDC - USER CAN ALWAYS WITHDRAW ALL THEIR OWN FUNDS
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
        // Check minimum balance requirement for enabling bot trading
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

    /// @notice Emergency stop auto-trading - USER CAN ALWAYS STOP BOT
    function emergencyStopAutoTrade() external {
        autoTradeEnabled[msg.sender] = false;
        emit AutoTradeToggled(msg.sender, false);
    }

    /**
     * @notice EMERGENCY CLOSE - User can close their own position WITHOUT the bot
     * @param token The token to sell back to USDC
     */
    function emergencyClosePosition(address token) external nonReentrant {
        if (token == address(0) || token == address(USDC)) revert InvalidToken();

        uint256 tokenAmount = tokenBalances[msg.sender][token];
        if (tokenAmount == 0) revert InsufficientTokenBalance();

        uint256 costBasis = positionCost[msg.sender][token];

        // Clear position FIRST (prevents reentrancy)
        tokenBalances[msg.sender][token] = 0;
        positionCost[msg.sender][token] = 0;

        // Execute swap with 0 minOut - user accepts any price to exit
        uint256 usdcOut = _swapV3(token, address(USDC), tokenAmount, 0);

        // Calculate base fee (0.1%)
        uint256 baseFee = (usdcOut * BASE_FEE) / BASIS_POINTS;

        // Calculate profit and success fee
        uint256 successFee = 0;
        int256 profitLoss = int256(usdcOut) - int256(costBasis) - int256(baseFee);

        if (profitLoss > 0) {
            successFee = (uint256(profitLoss) * SUCCESS_FEE) / BASIS_POINTS;
        }

        uint256 totalFees = baseFee + successFee;
        uint256 netUsdcOut = usdcOut - totalFees;

        // Accumulate fees
        accumulatedFees += totalFees;

        // Credit USDC to user
        balances[msg.sender] += netUsdcOut;

        emit PositionClosed(msg.sender, token, tokenAmount, netUsdcOut, baseFee, successFee, profitLoss, "emergency_user");
    }

    /*//////////////////////////////////////////////////////////////
                            BOT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Open a position (buy token with USDC)
     * @param user User address
     * @param token Token to buy
     * @param usdcAmount Amount of USDC to spend
     * @param minTokenOut Minimum tokens to receive
     */
    function openPosition(
        address user,
        address token,
        uint256 usdcAmount,
        uint256 minTokenOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenOut)
    {
        // Authorization
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (!autoTradeEnabled[user]) revert AutoTradeDisabled();
        if (token == address(0) || token == address(USDC)) revert InvalidToken();
        if (balances[user] < usdcAmount) revert InsufficientBalance();

        // Check minimum balance
        if (balances[user] < MIN_VAULT_BALANCE) revert BelowMinimumBalance();

        // Risk check
        uint256 riskLevel = userRiskLevel[user];
        if (riskLevel == 0) riskLevel = DEFAULT_RISK_LEVEL;
        uint256 maxTradeSize = (balances[user] * riskLevel) / BASIS_POINTS;
        if (usdcAmount > maxTradeSize) revert TradeTooLarge();

        // Rate limit (5 minutes)
        if (block.timestamp < lastTradeTime[user] + MIN_TRADE_INTERVAL) {
            revert TradeTooSoon();
        }
        lastTradeTime[user] = block.timestamp;

        // Calculate base fee (0.1%)
        uint256 baseFee = (usdcAmount * BASE_FEE) / BASIS_POINTS;
        uint256 tradeAmount = usdcAmount - baseFee;

        // Deduct from user balance
        balances[user] -= usdcAmount;

        // Accumulate base fee
        accumulatedFees += baseFee;

        // Execute swap via Uniswap V3: USDC -> Token
        tokenOut = _swapV3(address(USDC), token, tradeAmount, minTokenOut);

        // Credit tokens to user and track cost basis
        tokenBalances[user][token] += tokenOut;
        positionCost[user][token] += usdcAmount; // Track full cost including fee

        emit PositionOpened(user, token, usdcAmount, tokenOut, baseFee);
        return tokenOut;
    }

    /**
     * @notice Close a position (sell token for USDC)
     * @param user User address
     * @param token Token to sell
     * @param tokenAmount Amount of tokens to sell
     * @param minUsdcOut Minimum USDC to receive
     */
    function closePosition(
        address user,
        address token,
        uint256 tokenAmount,
        uint256 minUsdcOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcOut)
    {
        // Authorization
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();
        if (token == address(0) || token == address(USDC)) revert InvalidToken();
        if (tokenBalances[user][token] < tokenAmount) revert InsufficientTokenBalance();

        // Rate limit
        if (block.timestamp < lastTradeTime[user] + MIN_TRADE_INTERVAL) {
            revert TradeTooSoon();
        }
        lastTradeTime[user] = block.timestamp;

        // Calculate proportional cost basis
        uint256 totalTokens = tokenBalances[user][token];
        uint256 totalCost = positionCost[user][token];
        uint256 proportionalCost = (totalCost * tokenAmount) / totalTokens;

        // Deduct tokens and cost from user
        tokenBalances[user][token] -= tokenAmount;
        positionCost[user][token] -= proportionalCost;

        // Execute swap via Uniswap V3: Token -> USDC
        usdcOut = _swapV3(token, address(USDC), tokenAmount, minUsdcOut);

        // Calculate base fee (0.1%)
        uint256 baseFee = (usdcOut * BASE_FEE) / BASIS_POINTS;

        // Calculate profit and success fee (10% of profit)
        uint256 successFee = 0;
        int256 profitLoss = int256(usdcOut) - int256(proportionalCost) - int256(baseFee);

        if (profitLoss > 0) {
            successFee = (uint256(profitLoss) * SUCCESS_FEE) / BASIS_POINTS;
        }

        uint256 totalFees = baseFee + successFee;
        uint256 netUsdcOut = usdcOut - totalFees;

        // Accumulate fees
        accumulatedFees += totalFees;

        // Credit USDC to user
        balances[user] += netUsdcOut;

        emit PositionClosed(user, token, tokenAmount, netUsdcOut, baseFee, successFee, profitLoss, "bot_close");
        return netUsdcOut;
    }

    /**
     * @notice Close entire position for a token
     */
    function closeFullPosition(
        address user,
        address token,
        uint256 minUsdcOut
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcOut)
    {
        if (msg.sender != BOT_ADDRESS) revert UnauthorizedBot();

        uint256 tokenAmount = tokenBalances[user][token];
        if (tokenAmount == 0) revert InsufficientTokenBalance();

        // Rate limit
        if (block.timestamp < lastTradeTime[user] + MIN_TRADE_INTERVAL) {
            revert TradeTooSoon();
        }
        lastTradeTime[user] = block.timestamp;

        // Get cost basis
        uint256 costBasis = positionCost[user][token];

        // Clear position
        tokenBalances[user][token] = 0;
        positionCost[user][token] = 0;

        // Execute swap via Uniswap V3: Token -> USDC
        usdcOut = _swapV3(token, address(USDC), tokenAmount, minUsdcOut);

        // Calculate base fee (0.1%)
        uint256 baseFee = (usdcOut * BASE_FEE) / BASIS_POINTS;

        // Calculate profit and success fee (10% of profit)
        uint256 successFee = 0;
        int256 profitLoss = int256(usdcOut) - int256(costBasis) - int256(baseFee);

        if (profitLoss > 0) {
            successFee = (uint256(profitLoss) * SUCCESS_FEE) / BASIS_POINTS;
        }

        uint256 totalFees = baseFee + successFee;
        uint256 netUsdcOut = usdcOut - totalFees;

        // Accumulate fees
        accumulatedFees += totalFees;

        // Credit USDC
        balances[user] += netUsdcOut;

        emit PositionClosed(user, token, tokenAmount, netUsdcOut, baseFee, successFee, profitLoss, "bot_full_close");
        return netUsdcOut;
    }

    /*//////////////////////////////////////////////////////////////
                          OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Withdraw accumulated platform fees
     */
    function withdrawFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToWithdraw();

        accumulatedFees = 0;
        USDC.safeTransfer(treasuryAddress, fees);

        emit FeesWithdrawn(treasuryAddress, fees);
    }

    /**
     * @notice Update treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasuryAddress;
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute swap via Uniswap V3 with 0.05% fee tier
     */
    function _swapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Approve if needed
        if (tokenIn != address(USDC)) {
            IERC20(tokenIn).safeApprove(SWAP_ROUTER, amountIn);
        }

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: POOL_FEE, // 0.05% = 500
            recipient: address(this),
            deadline: block.timestamp + SWAP_DEADLINE,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0 // No price limit
        });

        amountOut = ISwapRouter(SWAP_ROUTER).exactInputSingle(params);

        if (amountOut < minAmountOut) revert SlippageExceeded();
        return amountOut;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getBaseFee() external pure returns (uint256) {
        return BASE_FEE;
    }

    function getSuccessFee() external pure returns (uint256) {
        return SUCCESS_FEE;
    }

    function getPoolFee() external pure returns (uint24) {
        return POOL_FEE;
    }

    function getMinVaultBalance() external pure returns (uint256) {
        return MIN_VAULT_BALANCE;
    }

    function canTradeNow(address user) external view returns (bool) {
        return block.timestamp >= lastTradeTime[user] + MIN_TRADE_INTERVAL;
    }

    function getTokenBalance(address user, address token) external view returns (uint256) {
        return tokenBalances[user][token];
    }

    function getPositionCost(address user, address token) external view returns (uint256) {
        return positionCost[user][token];
    }

    function getUserRiskLevel(address user) external view returns (uint256) {
        uint256 level = userRiskLevel[user];
        return level == 0 ? DEFAULT_RISK_LEVEL : level;
    }

    function getMaxTradeSize(address user) external view returns (uint256) {
        uint256 riskLevel = userRiskLevel[user];
        if (riskLevel == 0) riskLevel = DEFAULT_RISK_LEVEL;
        return (balances[user] * riskLevel) / BASIS_POINTS;
    }

    function getCooldownRemaining(address user) external view returns (uint256) {
        uint256 nextTradeTime = lastTradeTime[user] + MIN_TRADE_INTERVAL;
        if (block.timestamp >= nextTradeTime) return 0;
        return nextTradeTime - block.timestamp;
    }

    /**
     * @notice Get contract info
     */
    function getContractInfo() external view returns (
        uint256 tvl,
        uint256 platformFees,
        uint256 baseFee,
        uint256 successFee,
        uint24 poolFee,
        uint256 minBalance,
        uint256 cooldown
    ) {
        return (
            totalValueLocked,
            accumulatedFees,
            BASE_FEE,
            SUCCESS_FEE,
            POOL_FEE,
            MIN_VAULT_BALANCE,
            MIN_TRADE_INTERVAL
        );
    }
}
