import { Token } from "@/components/Swap/TokenSelector";
import { fetchTokenInfo, isValidERC20 } from "@/utils/erc20";
import { getCustomTokens, saveCustomToken as saveToStorage } from "@/utils/tokenStorage";

interface ChainTokenList {
  [chainId: number]: Token[];
}

// Default token lists for each network
const DEFAULT_TOKENS: ChainTokenList = {
  // Ethereum Mainnet
  1: [
    { symbol: "ETH", name: "Ethereum", logo: "⟠", address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum" },
    { symbol: "USDC", name: "USD Coin", logo: "💵", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", coingeckoId: "usd-coin" },
    { symbol: "USDT", name: "Tether", logo: "₮", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", coingeckoId: "tether" },
    { symbol: "DAI", name: "Dai Stablecoin", logo: "◈", address: "0x6b175474e89094c44da98b954eedeac495271d0f", coingeckoId: "dai" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", logo: "₿", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", coingeckoId: "wrapped-bitcoin" },
    { symbol: "UNI", name: "Uniswap", logo: "🦄", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", coingeckoId: "uniswap" },
    { symbol: "LINK", name: "Chainlink", logo: "🔗", address: "0x514910771af9ca656af840dff83e8264ecf986ca", coingeckoId: "chainlink" },
    { symbol: "AAVE", name: "Aave", logo: "👻", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", coingeckoId: "aave" },
  ],
  // Sepolia Testnet
  11155111: [
    { symbol: "ETH", name: "Sepolia ETH", logo: "⟠", address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum" },
    { symbol: "USDC", name: "USD Coin (Testnet)", logo: "💵", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", coingeckoId: "usd-coin" },
    { symbol: "DAI", name: "Dai (Testnet)", logo: "◈", address: "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6", coingeckoId: "dai" },
    { symbol: "LINK", name: "Chainlink (Testnet)", logo: "🔗", address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", coingeckoId: "chainlink" },
  ],
  // Goerli Testnet
  5: [
    { symbol: "ETH", name: "Goerli ETH", logo: "⟠", address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum" },
    { symbol: "USDC", name: "USD Coin (Testnet)", logo: "💵", address: "0x07865c6e87b9f70255377e024ace6630c1eaa37f", coingeckoId: "usd-coin" },
    { symbol: "DAI", name: "Dai (Testnet)", logo: "◈", address: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844", coingeckoId: "dai" },
    { symbol: "WETH", name: "Wrapped Ether", logo: "Ⓦ", address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", coingeckoId: "weth" },
  ],
  // BSC Mainnet
  56: [
    { symbol: "BNB", name: "BNB", logo: "💎", address: "0x0000000000000000000000000000000000000000", coingeckoId: "binancecoin" },
    { symbol: "USDT", name: "Tether", logo: "₮", address: "0x55d398326f99059ff775485246999027b3197955", coingeckoId: "tether" },
    { symbol: "BUSD", name: "Binance USD", logo: "💵", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", coingeckoId: "binance-usd" },
    { symbol: "USDC", name: "USD Coin", logo: "💵", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", coingeckoId: "usd-coin" },
    { symbol: "WBNB", name: "Wrapped BNB", logo: "Ⓦ", address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", coingeckoId: "wbnb" },
    { symbol: "CAKE", name: "PancakeSwap", logo: "🥞", address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", coingeckoId: "pancakeswap-token" },
  ],
  // BSC Testnet
  97: [
    { symbol: "BNB", name: "BNB (Testnet)", logo: "💎", address: "0x0000000000000000000000000000000000000000", coingeckoId: "binancecoin" },
    { symbol: "USDT", name: "Tether (Testnet)", logo: "₮", address: "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd", coingeckoId: "tether" },
    { symbol: "BUSD", name: "Binance USD (Testnet)", logo: "💵", address: "0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee", coingeckoId: "binance-usd" },
    { symbol: "WBNB", name: "Wrapped BNB (Testnet)", logo: "Ⓦ", address: "0xae13d989dac2f0debff460ac112a837c89baa7cd", coingeckoId: "wbnb" },
  ],
};

// Cache for fetched tokens
const tokenCache = new Map<number, { tokens: Token[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get tokens for a specific chain ID
 * Merges default tokens with custom tokens from localStorage
 */
export const getTokensForNetwork = async (chainId: number): Promise<Token[]> => {
  // Check cache first
  const cached = tokenCache.get(chainId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.tokens;
  }

  // Get default tokens for this chain
  const defaultTokens = DEFAULT_TOKENS[chainId] || DEFAULT_TOKENS[1];
  
  // Get custom tokens from localStorage
  const customTokens = getCustomTokens(chainId);
  
  // Merge default and custom tokens (remove duplicates)
  const allTokens = [...defaultTokens];
  customTokens.forEach((customToken) => {
    const exists = allTokens.find(
      (t) => t.address.toLowerCase() === customToken.address.toLowerCase()
    );
    if (!exists) {
      allTokens.push(customToken);
    }
  });

  // Cache the result
  tokenCache.set(chainId, {
    tokens: allTokens,
    timestamp: Date.now(),
  });

  return allTokens;
};

/**
 * Search for a token by address using ERC20 contract methods
 * Fetches token info directly from blockchain and saves to localStorage
 */
export const searchTokenByAddress = async (
  address: string,
  chainId: number,
  rpcUrl: string
): Promise<Token | null> => {
  try {
    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return null;
    }

    // Check if it's a valid ERC20 contract
    const isValid = await isValidERC20(address, rpcUrl);
    if (!isValid) {
      console.log("Address is not a valid ERC20 token");
      return null;
    }

    // Fetch token information using ERC20 methods
    const tokenInfo = await fetchTokenInfo(address, rpcUrl, chainId);
    
    if (tokenInfo) {
      console.log("Token found:", tokenInfo);
      // Save to localStorage as custom token
      saveToStorage(tokenInfo, chainId);
      // Invalidate cache to force reload
      tokenCache.delete(chainId);
    }

    return tokenInfo;
  } catch (error) {
    console.error("Error searching token by address:", error);
    return null;
  }
};

/**
 * Get user's token balances (requires wallet connection)
 * This would typically call blockchain RPC or explorer APIs
 */
export const getUserTokenBalances = async (
  walletAddress: string,
  chainId: number
): Promise<Array<Token & { balance: string }>> => {
  try {
    if (!walletAddress) {
      return [];
    }

    // In production, this would:
    // 1. Call blockchain RPC to get token balances
    // 2. Use Etherscan/BSCScan API to get token list
    // 3. Use Alchemy/Moralis APIs for better performance

    // For now, return empty array
    return [];
  } catch (error) {
    console.error("Error fetching user token balances:", error);
    return [];
  }
};

/**
 * Add a custom token to the list
 */
export const addCustomToken = (token: Token, chainId: number): void => {
  const cached = tokenCache.get(chainId);
  if (cached) {
    const exists = cached.tokens.find(
      (t) => t.address.toLowerCase() === token.address.toLowerCase()
    );
    if (!exists) {
      cached.tokens.push(token);
      tokenCache.set(chainId, { ...cached, timestamp: Date.now() });
    }
  }
};
