import { ethers } from "ethers";
import { Token, Price } from "@uniswap/sdk-core";
import { Pool, tickToPrice } from "@uniswap/v3-sdk";
import { POOL_ABI, FACTORY_ABI, getUniswapAddresses } from "@/config/uniswap";
import { PoolInfo, PoolSlot0, TokenInfo } from "@/types/uniswap";

/**
 * Get pool address from factory
 */
export const getPoolAddress = async (
  provider: ethers.Provider,
  chainId: number,
  token0: string,
  token1: string,
  fee: number
): Promise<string> => {
  const addresses = getUniswapAddresses(chainId);
  if (!addresses) {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  const factory = new ethers.Contract(addresses.factory, FACTORY_ABI, provider);
  const poolAddress = await factory.getPool(token0, token1, fee);
  
  if (poolAddress === ethers.ZeroAddress) {
    throw new Error(`Pool not found for ${token0}/${token1} with fee ${fee}`);
  }

  return poolAddress;
};

/**
 * Get pool slot0 data (price, tick, etc)
 */
export const getPoolSlot0 = async (
  provider: ethers.Provider,
  poolAddress: string
): Promise<PoolSlot0> => {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const slot0 = await pool.slot0();

  return {
    sqrtPriceX96: slot0.sqrtPriceX96.toString(),
    tick: Number(slot0.tick),
    observationIndex: Number(slot0.observationIndex),
    observationCardinality: Number(slot0.observationCardinality),
    observationCardinalityNext: Number(slot0.observationCardinalityNext),
    feeProtocol: Number(slot0.feeProtocol),
    unlocked: slot0.unlocked,
  };
};

/**
 * Get pool liquidity
 */
export const getPoolLiquidity = async (
  provider: ethers.Provider,
  poolAddress: string
): Promise<string> => {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const liquidity = await pool.liquidity();
  return liquidity.toString();
};

/**
 * Calculate price from sqrtPriceX96
 */
export const calculatePrice = (
  sqrtPriceX96: string,
  token0Decimals: number,
  token1Decimals: number
): number => {
  const Q96 = 2n ** 96n;
  const sqrtPrice = BigInt(sqrtPriceX96);
  
  // price = (sqrtPriceX96 / 2^96)^2
  const price = (sqrtPrice * sqrtPrice * BigInt(10 ** token0Decimals)) / (Q96 * Q96);
  const priceNumber = Number(price) / (10 ** token1Decimals);
  
  return priceNumber;
};

/**
 * Calculate price from tick using Uniswap SDK
 */
export const getPriceFromTick = (
  tick: number,
  token0: TokenInfo,
  token1: TokenInfo
): number => {
  const baseToken = new Token(
    1, // chainId doesn't matter for price calculation
    token0.address,
    token0.decimals,
    token0.symbol,
    token0.name
  );

  const quoteToken = new Token(
    1,
    token1.address,
    token1.decimals,
    token1.symbol,
    token1.name
  );

  const price = tickToPrice(baseToken, quoteToken, tick);
  return parseFloat(price.toSignificant(8));
};

/**
 * Get complete pool information
 */
export const getPoolInfo = async (
  provider: ethers.Provider,
  chainId: number,
  poolAddress: string,
  token0Info: TokenInfo,
  token1Info: TokenInfo
): Promise<PoolInfo> => {
  const [slot0, liquidity] = await Promise.all([
    getPoolSlot0(provider, poolAddress),
    getPoolLiquidity(provider, poolAddress),
  ]);

  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  const fee = await pool.fee();

  return {
    address: poolAddress,
    token0: token0Info,
    token1: token1Info,
    fee: Number(fee),
    liquidity,
    sqrtPriceX96: slot0.sqrtPriceX96,
    tick: slot0.tick,
  };
};

/**
 * Create Pool instance from Uniswap SDK
 */
export const createPoolInstance = (
  poolInfo: PoolInfo,
  chainId: number
): Pool => {
  const token0 = new Token(
    chainId,
    poolInfo.token0.address,
    poolInfo.token0.decimals,
    poolInfo.token0.symbol,
    poolInfo.token0.name
  );

  const token1 = new Token(
    chainId,
    poolInfo.token1.address,
    poolInfo.token1.decimals,
    poolInfo.token1.symbol,
    poolInfo.token1.name
  );

  return new Pool(
    token0,
    token1,
    poolInfo.fee,
    poolInfo.sqrtPriceX96,
    poolInfo.liquidity,
    poolInfo.tick
  );
};
