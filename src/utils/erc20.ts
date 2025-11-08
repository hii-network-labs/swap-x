import { ethers } from "ethers";
import { Token } from "@/components/Swap/TokenSelector";

// ERC20 ABI - only the functions we need
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];

/**
 * Fetch token information from blockchain using ERC20 standard methods
 */
export const fetchTokenInfo = async (
  tokenAddress: string,
  rpcUrl: string,
  chainId: number
): Promise<Token | null> => {
  try {
    // Validate address format
    if (!ethers.isAddress(tokenAddress)) {
      throw new Error("Invalid address format");
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Create contract instance
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Fetch token info in parallel
    const [name, symbol, decimals] = await Promise.all([
      contract.name().catch(() => "Unknown Token"),
      contract.symbol().catch(() => "UNKNOWN"),
      contract.decimals().catch(() => 18),
    ]);

    // Generate a simple emoji logo based on symbol
    const logo = generateTokenLogo(symbol);

    return {
      symbol: symbol,
      name: name,
      logo: logo,
      address: tokenAddress,
      coingeckoId: "", // Would need additional API call to CoinGecko
    };
  } catch (error) {
    console.error("Error fetching token info:", error);
    return null;
  }
};

/**
 * Get token balance for a wallet address
 */
export const getTokenBalance = async (
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string
): Promise<string | null> => {
  try {
    if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(walletAddress)) {
      return null;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
      provider
    );

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
    ]);

    // Format balance to human readable number
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return null;
  }
};

/**
 * Get native token (ETH, BNB) balance
 */
export const getNativeBalance = async (
  walletAddress: string,
  rpcUrl: string
): Promise<string | null> => {
  try {
    if (!ethers.isAddress(walletAddress)) {
      return null;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(walletAddress);

    // Native tokens typically have 18 decimals
    return ethers.formatEther(balance);
  } catch (error) {
    console.error("Error fetching native balance:", error);
    return null;
  }
};

/**
 * Verify if an address is a valid ERC20 token contract
 */
export const isValidERC20 = async (
  tokenAddress: string,
  rpcUrl: string
): Promise<boolean> => {
  try {
    if (!ethers.isAddress(tokenAddress)) {
      return false;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Try to call symbol() - if it works, it's likely an ERC20 token
    await contract.symbol();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Generate a simple emoji logo based on token symbol
 */
function generateTokenLogo(symbol: string): string {
  const symbolUpper = symbol.toUpperCase();

  // Common token logos
  const logoMap: { [key: string]: string } = {
    ETH: "⟠",
    WETH: "Ⓦ",
    BTC: "₿",
    WBTC: "₿",
    USDC: "💵",
    USDT: "₮",
    DAI: "◈",
    BUSD: "💵",
    BNB: "💎",
    WBNB: "Ⓦ",
    UNI: "🦄",
    LINK: "🔗",
    AAVE: "👻",
    CAKE: "🥞",
  };

  return logoMap[symbolUpper] || "🪙";
}
