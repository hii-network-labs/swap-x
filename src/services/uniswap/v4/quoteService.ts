import { Address } from "viem";
import { Token } from "@uniswap/sdk-core";
import { fetchTokenInfo, ZERO_ADDRESS } from "./helpers";
import { getPool } from "./poolService";
import { getUniswapV4Addresses, QUOTER_ABI } from "@/config/uniswapV4";

const TICK_TO_FEE: Record<number, number> = {
  10: 500,
  60: 3000,
  200: 10000,
};

export interface QuoteParams {
  client: any;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amount: number; // human units
  tickSpacing?: number; // if omitted, tries common values
  fee?: number; // if omitted, inferred from tickSpacing
}

export interface QuoteResult {
  amountOut?: number; // for exact input
  amountIn?: number; // for exact output
  rate: number; // tokenOut per tokenIn
}

// Estimate quote using current pool price. Ignores price impact; applies lp fee.
export async function estimateExactInput(params: QuoteParams): Promise<QuoteResult | null> {
  const { client, chainId, tokenIn, tokenOut, amount } = params;
  if (!client || !tokenIn || !tokenOut || !amount || amount <= 0) return null;

  const tokenInInfo = await fetchTokenInfo(client, tokenIn);
  const tokenOutInfo = await fetchTokenInfo(client, tokenOut);

  const token0 = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const token1 = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);

  const tick = params.tickSpacing ?? 60; // default to standard
  const fee = params.fee ?? TICK_TO_FEE[tick] ?? 3000;

  const poolData = await getPool(client, chainId, fee, tick, ZERO_ADDRESS, token0, token1);
  if (!poolData || !poolData.pool) return null;

  const sqrtPriceX96 = BigInt(poolData.sqrtPriceX96);
  const Q96 = 2n ** 96n;
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrt * sqrt; // token1 per token0 before decimals adjustment

  // Adjust for token decimals using constructed Token objects
  const decimalsAdj = Math.pow(10, token1.decimals - token0.decimals);
  const feeMultiplier = 1 - fee / 1_000_000; // v3/v4 fee units
  let rate = price * decimalsAdj * feeMultiplier;
  // Basic guard against non-finite numbers
  if (!isFinite(rate) || rate < 0) rate = 0;

  return {
    amountOut: amount * rate,
    rate,
  };
}

export async function estimateExactOutput(params: QuoteParams): Promise<QuoteResult | null> {
  const res = await estimateExactInput({ ...params, amount: 1 });
  if (!res) return null;
  const { rate } = res;
  const { amount } = params;
  if (rate <= 0) return null;
  return {
    amountIn: amount / rate,
    rate,
  };
}

// Prefer Quoter when available for more realistic quoting
export async function quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult | null> {
  const { client, chainId, tokenIn, tokenOut, amount } = params;
  const addresses = getUniswapV4Addresses(chainId);
  if (!client || !addresses?.quoter || amount <= 0) return null;

  const tokenInInfo = await fetchTokenInfo(client, tokenIn);
  const tokenOutInfo = await fetchTokenInfo(client, tokenOut);

  const tokenA = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const tokenB = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);

  const token0IsA = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const currency0 = token0IsA ? tokenA : tokenB;
  const currency1 = token0IsA ? tokenB : tokenA;
  const zeroForOne = tokenA.address.toLowerCase() === currency0.address.toLowerCase();

  const tick = params.tickSpacing ?? 60;
  const fee = params.fee ?? TICK_TO_FEE[tick] ?? 3000;

  const amountInWei = BigInt(Math.round(amount * Math.pow(10, tokenA.decimals)));

  // Optional sanity checks
  try {
    const quoterPoolManager = await client.readContract({ address: addresses.quoter as `0x${string}`, abi: QUOTER_ABI, functionName: "poolManager" });
    if (quoterPoolManager?.toLowerCase() !== addresses.poolManager.toLowerCase()) {
      console.warn(`Quoter linked PoolManager mismatch: ${quoterPoolManager}`);
    }
  } catch {}

  const quoted = await client.readContract({
    address: addresses.quoter as `0x${string}`,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      { currency0: currency0.address as `0x${string}`, currency1: currency1.address as `0x${string}`, fee, tickSpacing: tick, hooks: ZERO_ADDRESS as `0x${string}` },
      zeroForOne,
      amountInWei,
      "0x",
    ],
  });

  const amountOutWei = (quoted as any)?.amountOut ?? (Array.isArray(quoted) ? (quoted as any)[0] : quoted);
  const amountOut = Number(amountOutWei) / Math.pow(10, tokenOutInfo.decimals);
  const rate = amountOut / amount;
  return { amountOut, rate };
}

export async function quoteExactOutputSingle(params: QuoteParams): Promise<QuoteResult | null> {
  // Simple inversion using input quote; could be replaced with dedicated exactOutput quoter if available
  const q = await quoteExactInputSingle({ ...params, amount: 1 });
  if (!q || !q.rate || q.rate <= 0) return null;
  return { amountIn: params.amount / q.rate, rate: q.rate };
}