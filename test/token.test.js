import { expect } from 'chai'
import hre from 'hardhat'

const { ethers } = hre

const assertHolderList = async (token, ...addresses) => {
  const n = await token.getNumTokenHolders()
  const holders = []
  for (let i = 1n; i <= n; i++) {
    holders.push(await token.getTokenHolder(i))
  }
  const holdersSorted = holders.map(addr => addr.toLowerCase()).sort()
  const expectedSorted = addresses.map(addr => addr.toLowerCase()).sort()
  expect(holdersSorted.length).to.equal(expectedSorted.length)
  expect(holdersSorted).to.deep.equal(expectedSorted)
}

describe('Token', function () {
  let token
  let accounts
  let owner

  beforeEach(async function () {
    accounts = await ethers.getSigners()
    owner = accounts[0]
    const Token = await ethers.getContractFactory('Token')
    token = await Token.deploy()
    await token.waitForDeployment()
  })

  it('has default values', async function () {
    expect(await token.name()).to.equal('Test token')
    expect(await token.symbol()).to.equal('TEST')
    expect(await token.decimals()).to.equal(18n)
    expect(await token.totalSupply()).to.equal(0n)
  })

  it('can be minted', async function () {
    await expect(token.mint()).to.be.revertedWith('Must send ETH to mint')

    await token.mint({ value: 23n })
    expect(await token.balanceOf(accounts[0].address)).to.equal(23n)
    expect(await token.totalSupply()).to.equal(23n)

    await token.mint({ value: 50n })
    expect(await token.balanceOf(accounts[0].address)).to.equal(73n)
    expect(await token.totalSupply()).to.equal(73n)

    expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(73n)

    await token.connect(accounts[1]).mint({ value: 50n })
    expect(await token.balanceOf(accounts[0].address)).to.equal(73n)
    expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
    expect(await token.totalSupply()).to.equal(123n)

    expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(123n)
  })

  it('can be burnt', async function () {
    await token.mint({ value: 23n })
    await token.connect(accounts[1]).mint({ value: 50n })

    expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(73n)

    const preBal = await ethers.provider.getBalance(accounts[9].address)

    await token.burn(accounts[9].address)
    expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(50n)

    const postBal = await ethers.provider.getBalance(accounts[9].address)

    expect(postBal - preBal).to.equal(23n)
  })

  describe('once minted', function () {
    beforeEach(async function () {
      await token.mint({ value: 50n })
      await token.connect(accounts[1]).mint({ value: 50n })
    })

    it('can be transferred directly', async function () {
      await token.connect(accounts[1]).transfer(accounts[2].address, 1n)
      expect(await token.balanceOf(accounts[1].address)).to.equal(49n)
      expect(await token.balanceOf(accounts[2].address)).to.equal(1n)
      expect(await token.totalSupply()).to.equal(100n)

      await expect(token.connect(accounts[2]).transfer(accounts[1].address, 2n))
        .to.be.revertedWith('Insufficient balance')
    })

    it('can be transferred indirectly', async function () {
      await token.approve(accounts[1].address, 5n)
      expect(await token.allowance(accounts[0].address, accounts[1].address)).to.equal(5n)

      await token.approve(accounts[1].address, 10n)
      expect(await token.allowance(accounts[0].address, accounts[1].address)).to.equal(10n)

      await expect(token.connect(accounts[1]).transferFrom(accounts[0].address, accounts[2].address, 11n))
        .to.be.revertedWith('Insufficient allowance')
      await token.connect(accounts[1]).transferFrom(accounts[0].address, accounts[2].address, 9n)

      expect(await token.balanceOf(accounts[0].address)).to.equal(41n)
      expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
      expect(await token.balanceOf(accounts[2].address)).to.equal(9n)

      expect(await token.allowance(accounts[0].address, accounts[1].address)).to.equal(1n)
      await expect(token.connect(accounts[1]).transferFrom(accounts[0].address, accounts[1].address, 2n))
        .to.be.revertedWith('Insufficient allowance')
      await token.connect(accounts[1]).transferFrom(accounts[0].address, accounts[1].address, 1n)

      expect(await token.balanceOf(accounts[0].address)).to.equal(40n)
      expect(await token.balanceOf(accounts[1].address)).to.equal(51n)
      expect(await token.balanceOf(accounts[2].address)).to.equal(9n)

      expect(await token.allowance(accounts[0].address, accounts[1].address)).to.equal(0n)
    })

    describe('can record dividends', function () {
      it('and disallows empty dividend', async function () {
        await expect(token.recordDividend()).to.be.revertedWith('Must send ETH for dividend')
      })

      it('and keeps track of holders when minting and burning', async function () {
        await assertHolderList(token, accounts[0].address, accounts[1].address)

        await token.connect(accounts[2]).mint({ value: 100n })
        await token.burn(accounts[9].address)

        expect(await token.balanceOf(accounts[0].address)).to.equal(0n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(100n)

        await assertHolderList(token, accounts[1].address, accounts[2].address)

        await token.connect(accounts[5]).recordDividend({ value: 1500n })

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(0n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(1000n)

        await assertHolderList(token, accounts[1].address, accounts[2].address)
      })

      it('and keeps track of holders when transferring', async function () {
        await token.transfer(accounts[2].address, 25n)
        await token.transfer(accounts[3].address, 0n)

        await token.connect(accounts[1]).approve(accounts[0].address, 50n)
        await token.transferFrom(accounts[1].address, accounts[2].address, 50n)

        expect(await token.balanceOf(accounts[0].address)).to.equal(25n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(0n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(75n)
        expect(await token.balanceOf(accounts[3].address)).to.equal(0n)

        await assertHolderList(token, accounts[0].address, accounts[2].address)

        await token.connect(accounts[5]).recordDividend({ value: 1000n })

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(0n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(750n)
        expect(await token.getWithdrawableDividend(accounts[3].address)).to.equal(0n)
      })

      it('and compounds the payouts', async function () {
        await token.transfer(accounts[2].address, 25n)

        expect(await token.balanceOf(accounts[0].address)).to.equal(25n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(25n)

        await token.connect(accounts[5]).recordDividend({ value: 1000n })

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)

        // do some transfer to update the proportional holdings
        await token.connect(accounts[1]).transfer(accounts[2].address, 25n)
        await token.connect(accounts[1]).mint({ value: 75n })
        await token.burn(accounts[0].address)

        expect(await token.balanceOf(accounts[0].address)).to.equal(0n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(100n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(50n)
        expect(await token.totalSupply()).to.equal(150n)

        await assertHolderList(token, accounts[1].address, accounts[2].address)

        await token.connect(accounts[5]).recordDividend({ value: 90n })

        // check that new payouts are in accordance with new holding proportions
        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n + 0n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n + 60n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n + 30n)
      })

      it('and allows for withdrawals in-between payouts', async function () {
        await token.transfer(accounts[2].address, 25n)

        expect(await token.balanceOf(accounts[0].address)).to.equal(25n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(25n)

        await assertHolderList(token, accounts[0].address, accounts[1].address, accounts[2].address)

        await token.connect(accounts[5]).recordDividend({ value: 1000n })

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)

        // check that withdrawal works!
        const preBal = await ethers.provider.getBalance(accounts[9].address)
        await token.connect(accounts[1]).withdrawDividend(accounts[9].address)
        const postBal = await ethers.provider.getBalance(accounts[9].address)
        expect(postBal - preBal).to.equal(500n)

        // check that withdrawable balance has been reset for account 1
        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(0n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)
      })

      it('and allows for withdrawals even after holder relinquishes tokens', async function () {
        await token.transfer(accounts[2].address, 25n)

        expect(await token.balanceOf(accounts[0].address)).to.equal(25n)
        expect(await token.balanceOf(accounts[1].address)).to.equal(50n)
        expect(await token.balanceOf(accounts[2].address)).to.equal(25n)

        await assertHolderList(token, accounts[0].address, accounts[1].address, accounts[2].address)

        await token.connect(accounts[5]).recordDividend({ value: 1000n })

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)

        const preBal = await ethers.provider.getBalance(accounts[9].address)

        // burn tokens
        await token.connect(accounts[1]).burn(accounts[9].address)

        await assertHolderList(token, accounts[0].address, accounts[2].address)

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(500n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)

        // try withdrawing
        await token.connect(accounts[1]).withdrawDividend(accounts[9].address)

        // check dest balances
        const postBal = await ethers.provider.getBalance(accounts[9].address)
        expect(postBal - preBal).to.equal(50n + 500n)

        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(0n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n)

        // record new dividend
        await token.connect(accounts[5]).recordDividend({ value: 80n })

        // this time accounts[1] doesn't get any payout because they no longer hold tokens
        expect(await token.getWithdrawableDividend(accounts[0].address)).to.equal(250n + 40n)
        expect(await token.getWithdrawableDividend(accounts[1].address)).to.equal(0n)
        expect(await token.getWithdrawableDividend(accounts[2].address)).to.equal(250n + 40n)
      })
    })
  })
})