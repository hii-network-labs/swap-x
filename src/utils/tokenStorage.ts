import { Token } from "@/components/Swap/TokenSelector";

const STORAGE_KEY = "custom_tokens";

interface StoredTokens {
  [chainId: number]: Token[];
}

/**
 * Get all custom tokens from localStorage
 */
export const getAllCustomTokens = (): StoredTokens => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error("Error reading custom tokens from localStorage:", error);
    return {};
  }
};

/**
 * Get custom tokens for a specific chain
 */
export const getCustomTokens = (chainId: number): Token[] => {
  const allTokens = getAllCustomTokens();
  return allTokens[chainId] || [];
};

/**
 * Save a custom token to localStorage
 */
export const saveCustomToken = (token: Token, chainId: number): void => {
  try {
    const allTokens = getAllCustomTokens();
    const chainTokens = allTokens[chainId] || [];
    
    // Check if token already exists
    const exists = chainTokens.find(
      (t) => t.address.toLowerCase() === token.address.toLowerCase()
    );
    
    if (!exists) {
      chainTokens.push(token);
      allTokens[chainId] = chainTokens;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allTokens));
      console.log("Custom token saved:", token.symbol);
    }
  } catch (error) {
    console.error("Error saving custom token:", error);
  }
};

/**
 * Remove a custom token from localStorage
 */
export const removeCustomToken = (tokenAddress: string, chainId: number): void => {
  try {
    const allTokens = getAllCustomTokens();
    const chainTokens = allTokens[chainId] || [];
    
    const filtered = chainTokens.filter(
      (t) => t.address.toLowerCase() !== tokenAddress.toLowerCase()
    );
    
    allTokens[chainId] = filtered;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allTokens));
    console.log("Custom token removed:", tokenAddress);
  } catch (error) {
    console.error("Error removing custom token:", error);
  }
};

/**
 * Check if a token is a custom token (user imported)
 */
export const isCustomToken = (tokenAddress: string, chainId: number): boolean => {
  const customTokens = getCustomTokens(chainId);
  return customTokens.some(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
};

/**
 * Clear all custom tokens (for debugging/reset)
 */
export const clearAllCustomTokens = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("All custom tokens cleared");
  } catch (error) {
    console.error("Error clearing custom tokens:", error);
  }
};
