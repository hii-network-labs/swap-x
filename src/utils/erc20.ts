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
    console.log(`Fetching token info for ${tokenAddress} on chain ${chainId} using RPC: ${rpcUrl}`);
    
    // Validate address format
    if (!ethers.utils.isAddress(tokenAddress)) {
      console.error("Invalid address format:", tokenAddress);
      throw new Error("Invalid address format");
    }

    // Create provider
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Create contract instance
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    console.log("Calling ERC20 methods...");
    
    // Fetch token info in parallel with timeout
    const [name, symbol, decimals] = await Promise.race([
      Promise.all([
        contract.name().catch((e) => {
          console.error("Error fetching name:", e.message);
          return "Unknown Token";
        }),
        contract.symbol().catch((e) => {
          console.error("Error fetching symbol:", e.message);
          return "UNKNOWN";
        }),
        contract.decimals().catch((e) => {
          console.error("Error fetching decimals:", e.message);
          return 18;
        }),
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), 10000)
      ),
    ]) as [string, string, number];

    console.log("Token info fetched successfully:", { name, symbol, decimals });

    // Generate a simple emoji logo based on symbol
    const logo = generateTokenLogo(symbol);

    return {
      symbol: symbol,
      name: name,
      logo: logo,
      address: tokenAddress,
      coingeckoId: "", // Would need additional API call to CoinGecko
    };
  } catch (error: any) {
    console.error("Error fetching token info:", error.message || error);
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
    if (!ethers.utils.isAddress(tokenAddress) || !ethers.utils.isAddress(walletAddress)) {
      return null;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
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
    return ethers.utils.formatUnits(balance, decimals);
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
    if (!ethers.utils.isAddress(walletAddress)) {
      return null;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(walletAddress);

    // Native tokens typically have 18 decimals
    return ethers.utils.formatEther(balance);
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
    console.log(`Verifying ERC20 contract at ${tokenAddress}`);
    
    if (!ethers.utils.isAddress(tokenAddress)) {
      console.log("Invalid address format");
      return false;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check if there's code at the address
    const code = await provider.getCode(tokenAddress);
    if (code === "0x") {
      console.log("No contract code found at address");
      return false;
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Try to call symbol() - if it works, it's likely an ERC20 token
    const symbol = await Promise.race([
      contract.symbol(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), 8000)
      ),
    ]);
    
    console.log("Valid ERC20 token found, symbol:", symbol);
    return true;
  } catch (error: any) {
    console.error("ERC20 validation failed:", error.message || error);
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
    HNC: "⟠",
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
