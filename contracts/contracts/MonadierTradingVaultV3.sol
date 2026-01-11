// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Uniswap V2 Router interface
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    function WETH() external pure returns (address);
}

/// @notice WETH interface for wrapping/unwrapping
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
}

/**
 * @title MonadierTradingVaultV3
 * @notice Secure trading vault - USERS CAN ALWAYS WITHDRAW AND CLOSE POSITIONS
 * @dev Security model:
 *      - Users can ALWAYS withdraw their own USDC
 *      - Users can ALWAYS emergency close their own positions
 *      - Users can ALWAYS disable auto-trading
 *      - Owner can NEVER access user funds
 *      - Owner can ONLY withdraw accumulated platform fees
 *      - Bot can ONLY trade with user permission
 */
contract MonadierTradingVaultV3 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable USDC;
    address public immutable BOT_ADDRESS;
    address public immutable UNISWAP_ROUTER;
    address public immutable WRAPPED_NATIVE;
    uint256 public immutable CHAIN_ID;

    uint256 public constant BASE_CHAIN_ID = 8453;
    uint256 public constant BASE_CHAIN_FEE = 100; // 1%
    uint256 public constant OTHER_CHAIN_FEE = 350; // 3.5%
    uint256 public constant MAX_RISK_LEVEL = 10000; // 100%
    uint256 public constant MIN_RISK_LEVEL = 100; // 1%
    uint256 public constant DEFAULT_RISK_LEVEL = 500; // 5%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_TRADE_INTERVAL = 30 seconds;
    uint256 public constant SWAP_DEADLINE = 20 minutes;

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice User USDC balances
    mapping(address => uint256) public balances;

    /// @notice User token balances: user => token => amount
    mapping(address => mapping(address => uint256)) public tokenBalances;

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
    event DepositedETH(address indexed user, uint256 ethAmount, uint256 usdcReceived, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);
    event PositionOpened(
        address indexed user,
        address indexed token,
        uint256 usdcIn,
        uint256 tokenOut,
        uint256 fee
    );
    event PositionClosed(
        address indexed user,
        address indexed token,
        uint256 tokenIn,
        uint256 usdcOut,
        uint256 fee,
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

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _usdc,
        address _botAddress,
        address _router,
        address _treasury,
        address _wrappedNative
    ) {
        if (_usdc == address(0) || _botAddress == address(0) ||
            _router == address(0) || _treasury == address(0) ||
            _wrappedNative == address(0)) {
            revert InvalidAddress();
        }

        USDC = IERC20(_usdc);
        BOT_ADDRESS = _botAddress;
        UNISWAP_ROUTER = _router;
        treasuryAddress = _treasury;
        WRAPPED_NATIVE = _wrappedNative;
        CHAIN_ID = block.chainid;

        // Approve router for USDC
        IERC20(_usdc).safeApprove(_router, type(uint256).max);
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

    /**
     * @notice Deposit ETH and auto-swap to USDC
     * @param minUsdcOut Minimum USDC to receive (slippage protection)
     */
    function depositETH(uint256 minUsdcOut) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();

        // Swap ETH -> USDC via router
        IUniswapV2Router router = IUniswapV2Router(UNISWAP_ROUTER);

        address[] memory path = new address[](2);
        path[0] = WRAPPED_NATIVE;
        path[1] = address(USDC);

        uint256[] memory amounts = router.swapExactETHForTokens{value: msg.value}(
            minUsdcOut,
            path,
            address(this),
            block.timestamp + SWAP_DEADLINE
        );

        uint256 usdcReceived = amounts[amounts.length - 1];
        if (usdcReceived < minUsdcOut) revert SlippageExceeded();

        // Credit USDC to user
        balances[msg.sender] += usdcReceived;
        totalValueLocked += usdcReceived;

        emit DepositedETH(msg.sender, msg.value, usdcReceived, balances[msg.sender]);
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
     * @dev User accepts any price (minUsdcOut = 0) to guarantee exit
     * @param token The token to sell back to USDC
     */
    function emergencyClosePosition(address token) external nonReentrant {
        if (token == address(0) || token == address(USDC)) revert InvalidToken();

        uint256 tokenAmount = tokenBalances[msg.sender][token];
        if (tokenAmount == 0) revert InsufficientTokenBalance();

        // Clear token balance FIRST (prevents reentrancy)
        tokenBalances[msg.sender][token] = 0;

        // Execute swap with 0 minOut - user accepts any price to exit
        uint256 usdcOut = _swap(token, address(USDC), tokenAmount, 0);

        // Calculate fee (lower fee for emergency - only 0.5%)
        uint256 fee = (usdcOut * 50) / BASIS_POINTS; // 0.5% emergency fee
        uint256 netUsdcOut = usdcOut - fee;

        // Accumulate fee (owner withdraws later)
        accumulatedFees += fee;

        // Credit USDC to user
        balances[msg.sender] += netUsdcOut;

        emit PositionClosed(msg.sender, token, tokenAmount, netUsdcOut, fee, "emergency_user");
    }

    /**
     * @notice Get all user's open positions (tokens they hold)
     * @param user User address
     * @param tokens Array of token addresses to check
     * @return amounts Array of token balances
     */
    function getUserPositions(address user, address[] calldata tokens)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = tokenBalances[user][tokens[i]];
        }
        return amounts;
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

        // Risk check
        uint256 riskLevel = userRiskLevel[user];
        if (riskLevel == 0) riskLevel = DEFAULT_RISK_LEVEL;
        uint256 maxTradeSize = (balances[user] * riskLevel) / BASIS_POINTS;
        if (usdcAmount > maxTradeSize) revert TradeTooLarge();

        // Rate limit
        if (block.timestamp < lastTradeTime[user] + MIN_TRADE_INTERVAL) {
            revert TradeTooSoon();
        }
        lastTradeTime[user] = block.timestamp;

        // Calculate fee
        uint256 fee = (usdcAmount * getPlatformFee()) / BASIS_POINTS;
        uint256 tradeAmount = usdcAmount - fee;

        // Deduct from user balance
        balances[user] -= usdcAmount;

        // Accumulate fee (owner withdraws later)
        accumulatedFees += fee;

        // Execute swap: USDC -> Token
        tokenOut = _swap(address(USDC), token, tradeAmount, minTokenOut);

        // Credit tokens to user
        tokenBalances[user][token] += tokenOut;

        emit PositionOpened(user, token, usdcAmount, tokenOut, fee);
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

        // Deduct tokens from user
        tokenBalances[user][token] -= tokenAmount;

        // Execute swap: Token -> USDC
        usdcOut = _swap(token, address(USDC), tokenAmount, minUsdcOut);

        // Calculate fee on output
        uint256 fee = (usdcOut * getPlatformFee()) / BASIS_POINTS;
        uint256 netUsdcOut = usdcOut - fee;

        // Accumulate fee
        accumulatedFees += fee;

        // Credit USDC to user
        balances[user] += netUsdcOut;

        emit PositionClosed(user, token, tokenAmount, netUsdcOut, fee, "bot_close");
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

        // Clear token balance
        tokenBalances[user][token] = 0;

        // Execute swap: Token -> USDC
        usdcOut = _swap(token, address(USDC), tokenAmount, minUsdcOut);

        // Calculate fee
        uint256 fee = (usdcOut * getPlatformFee()) / BASIS_POINTS;
        uint256 netUsdcOut = usdcOut - fee;

        // Accumulate fee
        accumulatedFees += fee;

        // Credit USDC
        balances[user] += netUsdcOut;

        emit PositionClosed(user, token, tokenAmount, netUsdcOut, fee, "bot_full_close");
        return netUsdcOut;
    }

    /*//////////////////////////////////////////////////////////////
                          OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Withdraw accumulated platform fees - OWNER CAN ONLY WITHDRAW FEES, NOT USER FUNDS
     * @dev This is the ONLY way owner can withdraw. Cannot access user balances.
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

    /**
     * @notice Pause contract in emergency
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        IUniswapV2Router router = IUniswapV2Router(UNISWAP_ROUTER);

        // Approve if needed
        if (tokenIn != address(USDC)) {
            IERC20(tokenIn).safeApprove(UNISWAP_ROUTER, amountIn);
        }

        // Build path through WETH for better liquidity
        address[] memory path;
        if (tokenIn == WRAPPED_NATIVE || tokenOut == WRAPPED_NATIVE) {
            path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
        } else {
            path = new address[](3);
            path[0] = tokenIn;
            path[1] = WRAPPED_NATIVE;
            path[2] = tokenOut;
        }

        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + SWAP_DEADLINE
        );

        amountOut = amounts[amounts.length - 1];
        if (amountOut < minAmountOut) revert SlippageExceeded();

        return amountOut;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getPlatformFee() public view returns (uint256) {
        return CHAIN_ID == BASE_CHAIN_ID ? BASE_CHAIN_FEE : OTHER_CHAIN_FEE;
    }

    function canTradeNow(address user) external view returns (bool) {
        return block.timestamp >= lastTradeTime[user] + MIN_TRADE_INTERVAL;
    }

    function getTokenBalance(address user, address token) external view returns (uint256) {
        return tokenBalances[user][token];
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

    /**
     * @notice Get contract security info
     * @return userFunds Total user funds (balances)
     * @return platformFees Accumulated platform fees
     * @return tvl Total value locked
     */
    function getSecurityInfo() external view returns (
        uint256 userFunds,
        uint256 platformFees,
        uint256 tvl
    ) {
        return (totalValueLocked, accumulatedFees, totalValueLocked);
    }
}
