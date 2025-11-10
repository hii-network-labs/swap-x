import { Address, PublicClient } from "viem";
import { Token, Currency, Ether } from "@uniswap/sdk-core";
import { ERC20_ABI } from "@/config/uniswapV4";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function isNativeETH(currency: Address): boolean {
  return currency.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export async function fetchTokenInfo(
  client: any,
  tokenAddress: Address
): Promise<TokenInfo> {
  if (isNativeETH(tokenAddress)) {
    return {
      address: tokenAddress,
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
    };
  }

  const [symbol, name, decimals] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "name",
    }) as Promise<string>,
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    }) as Promise<number>,
  ]);

  return {
    address: tokenAddress,
    symbol,
    name,
    decimals,
  };
}

export function sortTokens(tokenA: Token, tokenB: Token): [Token, Token] {
  return tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

export function decodePositionInfo(infoValue: bigint): {
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
} {
  // Position info is packed in a uint256:
  // liquidity (128 bits) | tickLower (24 bits) | tickUpper (24 bits)
  const liquidity = infoValue & ((1n << 128n) - 1n);
  const tickLower = Number((infoValue >> 128n) & ((1n << 24n) - 1n));
  const tickUpper = Number((infoValue >> 152n) & ((1n << 24n) - 1n));

  // Convert unsigned to signed for ticks
  const signedTickLower = tickLower > 0x7fffff ? tickLower - 0x1000000 : tickLower;
  const signedTickUpper = tickUpper > 0x7fffff ? tickUpper - 0x1000000 : tickUpper;

  return {
    liquidity,
    tickLower: signedTickLower,
    tickUpper: signedTickUpper,
  };
}

export function createCurrency(
  chainId: number,
  address: Address,
  tokenInfo: TokenInfo
): Currency {
  if (isNativeETH(address)) {
    return Ether.onChain(chainId);
  }
  return new Token(chainId, address, tokenInfo.decimals, tokenInfo.symbol, tokenInfo.name);
}
