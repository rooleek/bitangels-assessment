# BitAngels Token Assessment

ERC-20 token with mint/burn functionality and dividend distribution.

## Description

The `Token.sol` contract implements:

- **ERC-20** standard (transfer, approve, transferFrom, allowance)
- **Mintable Token** - mint tokens by depositing ETH (1 ETH = 1 token)
- **Burnable Token** - burn tokens and receive equivalent ETH back
- **Dividends** - distribute dividends to holders proportionally to their balance

## Installation

```bash
npm install
```

## Run Tests

```bash
npm test
```

## Compile

```bash
npm run compile
```

## Token.sol Architecture

### Token Holder Tracking

Efficient data structure for O(1) add/remove operations:

```solidity
address[] private _holders;
mapping(address => uint256) private _holderIndex; // 1-based index
```

- **Add**: O(1) - push to array + write to mapping
- **Remove**: O(1) - swap with last element + pop

### Dividend Distribution

```solidity
share = dividendAmount * holderBalance / totalSupply
```

Multiplication is performed first to avoid precision loss in integer division.

### Security

- **Checks-Effects-Interactions** pattern to prevent reentrancy
- Using `dest.call{value}` instead of `dest.transfer()` for contract compatibility
- SafeMath for overflow/underflow protection

## API

### IERC20

| Function | Description |
|----------|-------------|
| `transfer(to, value)` | Transfer tokens |
| `approve(spender, value)` | Approve spending |
| `transferFrom(from, to, value)` | Transfer on behalf |
| `allowance(owner, spender)` | Check allowance |
| `balanceOf(address)` | Get balance |

### IMintableToken

| Function | Description |
|----------|-------------|
| `mint()` | Mint tokens (payable, 1 ETH = 1 token) |
| `burn(dest)` | Burn all tokens, ETH sent to dest |

### IDividends

| Function | Description |
|----------|-------------|
| `getNumTokenHolders()` | Number of holders with non-zero balance |
| `getTokenHolder(index)` | Holder address by index (1-based) |
| `recordDividend()` | Record dividend payment (payable) |
| `getWithdrawableDividend(payee)` | Available dividends for address |
| `withdrawDividend(dest)` | Withdraw dividends to specified address |

## Requirements

- Node.js >= 20.0.0
- Solidity 0.7.0

## License

MIT