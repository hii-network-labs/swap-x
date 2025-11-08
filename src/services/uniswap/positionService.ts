import { ethers } from "ethers";
import { Position } from "@uniswap/v3-sdk";
import { POSITION_MANAGER_ABI, getUniswapAddresses } from "@/config/uniswap";
import { UniswapPosition, PositionWithValues, TokenInfo, PriceRange } from "@/types/uniswap";
import { getPoolInfo, createPoolInstance, getPriceFromTick } from "./poolService";

/**
 * Get token info from contract
 */
const getTokenInfo = async (
  provider: ethers.Provider,
  tokenAddress: string
): Promise<TokenInfo> => {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      "function symbol() view returns (string)",
      "function name() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    provider
  );

  const [symbol, name, decimals] = await Promise.all([
    tokenContract.symbol(),
    tokenContract.name(),
    tokenContract.decimals(),
  ]);

  return {
    address: tokenAddress,
    symbol,
    name,
    decimals: Number(decimals),
  };
};

/**
 * Get all position token IDs for a wallet
 */
export const getPositionTokenIds = async (
  provider: ethers.Provider,
  chainId: number,
  walletAddress: string
): Promise<string[]> => {
  const addresses = getUniswapAddresses(chainId);
  if (!addresses) {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  const positionManager = new ethers.Contract(
    addresses.positionManager,
    POSITION_MANAGER_ABI,
    provider
  );

  const balance = await positionManager.balanceOf(walletAddress);
  const tokenIds: string[] = [];

  for (let i = 0; i < Number(balance); i++) {
    const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
    tokenIds.push(tokenId.toString());
  }

  return tokenIds;
};

/**
 * Get position details by token ID
 */
export const getPositionDetails = async (
  provider: ethers.Provider,
  chainId: number,
  tokenId: string
): Promise<UniswapPosition> => {
  const addresses = getUniswapAddresses(chainId);
  if (!addresses) {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  const positionManager = new ethers.Contract(
    addresses.positionManager,
    POSITION_MANAGER_ABI,
    provider
  );

  const position = await positionManager.positions(tokenId);

  return {
    tokenId,
    nonce: position.nonce.toString(),
    operator: position.operator,
    token0: position.token0,
    token1: position.token1,
    fee: Number(position.fee),
    tickLower: Number(position.tickLower),
    tickUpper: Number(position.tickUpper),
    liquidity: position.liquidity.toString(),
    feeGrowthInside0LastX128: position.feeGrowthInside0LastX128.toString(),
    feeGrowthInside1LastX128: position.feeGrowthInside1LastX128.toString(),
    tokensOwed0: position.tokensOwed0.toString(),
    tokensOwed1: position.tokensOwed1.toString(),
  };
};

/**
 * Calculate position values with pool data
 */
export const calculatePositionValues = async (
  provider: ethers.Provider,
  chainId: number,
  position: UniswapPosition
): Promise<PositionWithValues> => {
  // Get token info
  const [token0Info, token1Info] = await Promise.all([
    getTokenInfo(provider, position.token0),
    getTokenInfo(provider, position.token1),
  ]);

  // Get pool address
  const addresses = getUniswapAddresses(chainId);
  const factory = new ethers.Contract(
    addresses.factory,
    ["function getPool(address, address, uint24) view returns (address)"],
    provider
  );
  const poolAddress = await factory.getPool(
    position.token0,
    position.token1,
    position.fee
  );

  // Get pool info
  const poolInfo = await getPoolInfo(
    provider,
    chainId,
    poolAddress,
    token0Info,
    token1Info
  );

  // Create pool instance
  const pool = createPoolInstance(poolInfo, chainId);

  // Create position instance from SDK
  const sdkPosition = new Position({
    pool,
    liquidity: position.liquidity,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
  });

  // Calculate price range
  const lowerPrice = getPriceFromTick(position.tickLower, token0Info, token1Info);
  const upperPrice = getPriceFromTick(position.tickUpper, token0Info, token1Info);
  const currentPrice = getPriceFromTick(poolInfo.tick, token0Info, token1Info);

  const priceRange: PriceRange = {
    lower: lowerPrice,
    upper: upperPrice,
    current: currentPrice,
  };

  // Check if position is in range
  const inRange = poolInfo.tick >= position.tickLower && poolInfo.tick < position.tickUpper;

  // Get token amounts
  const token0Amount = sdkPosition.amount0.toSignificant(8);
  const token1Amount = sdkPosition.amount1.toSignificant(8);

  return {
    tokenId: position.tokenId,
    pool: poolInfo,
    liquidity: position.liquidity,
    priceRange,
    token0Amount,
    token1Amount,
    unclaimedFees0: position.tokensOwed0,
    unclaimedFees1: position.tokensOwed1,
    inRange,
  };
};

/**
 * Get all positions for a wallet with calculated values
 */
export const getAllPositions = async (
  provider: ethers.Provider,
  chainId: number,
  walletAddress: string
): Promise<PositionWithValues[]> => {
  // Get all token IDs
  const tokenIds = await getPositionTokenIds(provider, chainId, walletAddress);

  if (tokenIds.length === 0) {
    return [];
  }

  // Get position details for each token ID
  const positions = await Promise.all(
    tokenIds.map((tokenId) => getPositionDetails(provider, chainId, tokenId))
  );

  // Filter out positions with zero liquidity
  const activePositions = positions.filter((pos) => BigInt(pos.liquidity) > 0n);

  // Calculate values for each position
  const positionsWithValues = await Promise.all(
    activePositions.map((pos) => calculatePositionValues(provider, chainId, pos))
  );

  return positionsWithValues;
};

/**
 * Collect fees from a position
 */
export const collectFees = async (
  provider: ethers.Provider,
  chainId: number,
  tokenId: string,
  recipient: string,
  signer: ethers.Signer
): Promise<ethers.ContractTransactionResponse> => {
  const addresses = getUniswapAddresses(chainId);
  if (!addresses) {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  const positionManager = new ethers.Contract(
    addresses.positionManager,
    POSITION_MANAGER_ABI,
    signer
  );

  const MAX_UINT128 = 2n ** 128n - 1n;

  return await positionManager.collect({
    tokenId,
    recipient,
    amount0Max: MAX_UINT128,
    amount1Max: MAX_UINT128,
  });
};
