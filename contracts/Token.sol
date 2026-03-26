// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "./IERC20.sol";
import "./IMintableToken.sol";
import "./IDividends.sol";
import "./SafeMath.sol";

contract Token is IERC20, IMintableToken, IDividends {
  // ------------------------------------------ //
  // ----- BEGIN: DO NOT EDIT THIS SECTION ---- //
  // ------------------------------------------ //
  using SafeMath for uint256;
  uint256 public totalSupply;
  uint256 public decimals = 18;
  string public name = "Test token";
  string public symbol = "TEST";
  mapping (address => uint256) public balanceOf;
  // ------------------------------------------ //
  // ----- END: DO NOT EDIT THIS SECTION ------ //
  // ------------------------------------------ //

  // ERC20 allowances: owner => spender => amount
  mapping(address => mapping(address => uint256)) private _allowances;

  // Token holder tracking with O(1) add/remove
  // Uses 1-based index: 0 means not a holder
  address[] private _holders;
  mapping(address => uint256) private _holderIndex;

  // Dividend tracking per address
  mapping(address => uint256) private _withdrawableDividend;

  // ============================================
  // Internal helper functions
  // ============================================

  function _addHolder(address account) internal {
    if (_holderIndex[account] == 0 && account != address(0)) {
      _holders.push(account);
      _holderIndex[account] = _holders.length; // 1-based index
    }
  }

  function _removeHolder(address account) internal {
    uint256 index = _holderIndex[account];
    if (index == 0) return;

    // Swap with last element and pop (O(1) removal)
    uint256 lastIndex = _holders.length;
    if (index != lastIndex) {
      address lastHolder = _holders[lastIndex - 1];
      _holders[index - 1] = lastHolder;
      _holderIndex[lastHolder] = index;
    }
    _holders.pop();
    _holderIndex[account] = 0;
  }

  function _updateHolderStatus(address account) internal {
    if (balanceOf[account] > 0) {
      _addHolder(account);
    } else {
      _removeHolder(account);
    }
  }

  function _transfer(address from, address to, uint256 value) internal {
    require(balanceOf[from] >= value, "Insufficient balance");

    // Handle zero-value transfers without modifying holders
    if (value == 0) return;

    balanceOf[from] = balanceOf[from].sub(value);
    balanceOf[to] = balanceOf[to].add(value);

    _updateHolderStatus(from);
    _updateHolderStatus(to);
  }

  // ============================================
  // IERC20 Implementation
  // ============================================

  function allowance(address owner, address spender) external view override returns (uint256) {
    return _allowances[owner][spender];
  }

  function transfer(address to, uint256 value) external override returns (bool) {
    _transfer(msg.sender, to, value);
    return true;
  }

  function approve(address spender, uint256 value) external override returns (bool) {
    _allowances[msg.sender][spender] = value;
    return true;
  }

  function transferFrom(address from, address to, uint256 value) external override returns (bool) {
    require(_allowances[from][msg.sender] >= value, "Insufficient allowance");
    _allowances[from][msg.sender] = _allowances[from][msg.sender].sub(value);
    _transfer(from, to, value);
    return true;
  }

  // ============================================
  // IMintableToken Implementation
  // ============================================

  function mint() external payable override {
    require(msg.value > 0, "Must send ETH to mint");

    balanceOf[msg.sender] = balanceOf[msg.sender].add(msg.value);
    totalSupply = totalSupply.add(msg.value);

    _addHolder(msg.sender);
  }

  function burn(address payable dest) external override {
    uint256 amount = balanceOf[msg.sender];
    require(amount > 0, "No tokens to burn");

    // Effects first (checks-effects-interactions pattern)
    balanceOf[msg.sender] = 0;
    totalSupply = totalSupply.sub(amount);
    _removeHolder(msg.sender);

    // Interaction last
    (bool success, ) = dest.call{value: amount}("");
    require(success, "ETH transfer failed");
  }

  // ============================================
  // IDividends Implementation
  // ============================================

  function getNumTokenHolders() external view override returns (uint256) {
    return _holders.length;
  }

  function getTokenHolder(uint256 index) external view override returns (address) {
    // Return address(0) for out of bounds (per interface spec)
    if (index == 0 || index > _holders.length) {
      return address(0);
    }
    return _holders[index - 1];
  }

  function recordDividend() external payable override {
    require(msg.value > 0, "Must send ETH for dividend");
    require(totalSupply > 0, "No tokens in circulation");

    uint256 dividendAmount = msg.value;
    uint256 supply = totalSupply;

    // Distribute proportionally to all current holders
    for (uint256 i = 0; i < _holders.length; i++) {
      address holder = _holders[i];
      uint256 holderBalance = balanceOf[holder];

      // Calculate share: (dividendAmount * holderBalance) / totalSupply
      // Multiply first to avoid precision loss
      uint256 share = dividendAmount.mul(holderBalance).div(supply);

      if (share > 0) {
        _withdrawableDividend[holder] = _withdrawableDividend[holder].add(share);
      }
    }
  }

  function getWithdrawableDividend(address payee) external view override returns (uint256) {
    return _withdrawableDividend[payee];
  }

  function withdrawDividend(address payable dest) external override {
    uint256 amount = _withdrawableDividend[msg.sender];
    require(amount > 0, "No dividends to withdraw");

    // Effects first
    _withdrawableDividend[msg.sender] = 0;

    // Interaction last
    (bool success, ) = dest.call{value: amount}("");
    require(success, "ETH transfer failed");
  }
}