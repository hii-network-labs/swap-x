// Uniswap V3 Position types
export interface UniswapPosition {
  tokenId: string;
  nonce: string;
  operator: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
}

// Pool data from slot0
export interface PoolSlot0 {
  sqrtPriceX96: string;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

// Token info
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Pool info
export interface PoolInfo {
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

// Price range for position
export interface PriceRange {
  lower: number;
  upper: number;
  current: number;
}

// Position with calculated values
export interface PositionWithValues {
  tokenId: string;
  pool: PoolInfo;
  liquidity: string;
  priceRange: PriceRange;
  token0Amount: string;
  token1Amount: string;
  unclaimedFees0: string;
  unclaimedFees1: string;
  inRange: boolean;
}
