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
    const chainId: number | undefined = (client?.chain?.id ?? undefined);
    const isHii = chainId === 22469 || Number(import.meta.env.VITE_DEFAULT_CHAIN_ID ?? 0) === 22469;
    return {
      address: tokenAddress,
      symbol: isHii ? "HNC" : "ETH",
      name: isHii ? "HNC" : "Ether",
      decimals: 18,
    };
  }

  const [symbol, name, decimals] = await Promise.all([
    (async () => {
      try {
        return await client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" });
      } catch {
        return "TOKEN";
      }
    })() as Promise<string>,
    (async () => {
      try {
        return await client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "name" });
      } catch {
        return "Token";
      }
    })() as Promise<string>,
    (async () => {
      try {
        return await client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" });
      } catch {
        return 18;
      }
    })() as Promise<number>,
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
  tickLower: number;
  tickUpper: number;
  hasSubscriber: boolean;
} {
  // v4 PositionInfo layout (LSB -> MSB):
  // 8 bits hasSubscriber | 24 bits tickLower | 24 bits tickUpper | 200 bits poolId
  // See PositionInfoLibrary docs: TICK_LOWER_OFFSET = 8, TICK_UPPER_OFFSET = 32
  const rawUpper = Number((infoValue >> 32n) & 0xffffffn);
  const rawLower = Number((infoValue >> 8n) & 0xffffffn);

  // Convert to signed int24
  const tickUpper = rawUpper >= 0x800000 ? rawUpper - 0x1000000 : rawUpper;
  const tickLower = rawLower >= 0x800000 ? rawLower - 0x1000000 : rawLower;

  const hasSubscriber = (infoValue & 0xffn) !== 0n;

  return { tickLower, tickUpper, hasSubscriber };
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
