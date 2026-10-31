[dotenv@17.2.3] injecting env (3) from .env -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild
// Sources flattened with hardhat v2.28.3 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.4) (utils/Context.sol)

pragma solidity ^0.8.0;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/security/Pausable.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (security/Pausable.sol)

pragma solidity ^0.8.0;

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        require(!paused(), "Pausable: paused");
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        require(paused(), "Pausable: not paused");
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}


// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.4) (token/ERC20/extensions/IERC20Permit.sol)

pragma solidity ^0.8.0;

/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.0;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}


// File @openzeppelin/contracts/utils/Address.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (utils/Address.sol)

pragma solidity ^0.8.1;

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     *
     * Furthermore, `isContract` will also return true if the target contract within
     * the same transaction is already scheduled for destruction by `SELFDESTRUCT`,
     * which only has an effect at the end of a transaction.
     * ====
     *
     * [IMPORTANT]
     * ====
     * You shouldn't rely on `isContract` to protect against flash loan attacks!
     *
     * Preventing calls from contracts is highly discouraged. It breaks composability, breaks support for smart wallets
     * like Gnosis Safe, and does not provide security since it can be circumvented by calling from a contract
     * constructor.
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize/address.code.length, which returns 0
        // for contracts in construction, since the code is only stored at the end
        // of the constructor execution.

        return account.code.length > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.0/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason, it is bubbled up by this
     * function (like regular Solidity function calls).
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     *
     * _Available since v3.1._
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and revert (either by bubbling
     * the revert reason or using the provided one) in case of unsuccessful call or if target was not a contract.
     *
     * _Available since v4.8._
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(isContract(target), "Address: call to non-contract");
            }
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and revert if it wasn't, either by bubbling the
     * revert reason or using the provided one.
     *
     * _Available since v4.3._
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    function _revert(bytes memory returndata, string memory errorMessage) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(errorMessage);
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.3) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.0;



/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    /**
     * @dev Deprecated. This function has issues similar to the ones found in
     * {IERC20-approve}, and its usage is discouraged.
     *
     * Whenever possible, use {safeIncreaseAllowance} and
     * {safeDecreaseAllowance} instead.
     */
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance + value));
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        unchecked {
            uint256 oldAllowance = token.allowance(address(this), spender);
            require(oldAllowance >= value, "SafeERC20: decreased allowance below zero");
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance - value));
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeWithSelector(token.approve.selector, spender, value);

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, 0));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Use a ERC-2612 signature to set the `owner` approval toward `spender` on `token`.
     * Revert on invalid signature.
     */
    function safePermit(
        IERC20Permit token,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 nonceBefore = token.nonces(owner);
        token.permit(owner, spender, value, deadline, v, r, s);
        uint256 nonceAfter = token.nonces(owner);
        require(nonceAfter == nonceBefore + 1, "SafeERC20: permit did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data, "SafeERC20: low-level call failed");
        require(returndata.length == 0 || abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return
            success && (returndata.length == 0 || abi.decode(returndata, (bool))) && Address.isContract(address(token));
    }
}


// File @openzeppelin/contracts/security/ReentrancyGuard.sol@v4.9.6

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (security/ReentrancyGuard.sol)

pragma solidity ^0.8.0;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be _NOT_ENTERED
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == _ENTERED;
    }
}


// File contracts/MonadierTradingVault.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.24;




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
