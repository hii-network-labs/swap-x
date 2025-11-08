// Uniswap V3 Contract Addresses for different networks
export const UNISWAP_V3_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  // Sepolia Testnet
  11155111: {
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
    quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  },
  // Goerli Testnet
  5: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  },
  // BSC Mainnet
  56: {
    factory: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
    router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    positionManager: "0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613",
    quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
    quoterV2: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
  },
  // BSC Testnet
  97: {
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    router: "0x9a489505a00cE272eAa5e07Dba6491314CaE3796",
    positionManager: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
    quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
    quoterV2: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
  },
} as const;

// Common token addresses for each network
export const COMMON_TOKENS = {
  // Ethereum Mainnet
  1: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
  // Sepolia Testnet
  11155111: {
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
    DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
  },
  // Goerli Testnet
  5: {
    WETH: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    USDC: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
    USDT: "0x509Ee0d083DdF8AC028f2a56731412edD63223B9",
    DAI: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844",
  },
  // BSC Mainnet
  56: {
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    ETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  },
  // BSC Testnet
  97: {
    WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    USDC: "0x64544969ed7EBf5f083679233325356EbE738930",
    USDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    BUSD: "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee",
  },
} as const;

// Fee tiers for Uniswap V3 pools
export const FEE_TIERS = {
  LOWEST: 100, // 0.01%
  LOW: 500, // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000, // 1%
} as const;

// Helper to get contract addresses for current network
export const getUniswapAddresses = (chainId: number) => {
  return UNISWAP_V3_ADDRESSES[chainId as keyof typeof UNISWAP_V3_ADDRESSES];
};

// Helper to get common tokens for current network
export const getCommonTokens = (chainId: number) => {
  return COMMON_TOKENS[chainId as keyof typeof COMMON_TOKENS] || {};
};

// Check if network is supported
export const isSupportedNetwork = (chainId: number): boolean => {
  return chainId in UNISWAP_V3_ADDRESSES;
};

// Position NFT metadata
export const POSITION_MANAGER_ABI = [
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) external returns (uint256 amount0, uint256 amount1)",
];

// Pool ABI for price and liquidity data
export const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
];

// Factory ABI
export const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];
