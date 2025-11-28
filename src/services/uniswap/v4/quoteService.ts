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

/**
 * Fetch current pool price from Indexer API (realtime, same calculation as Filler)
 * Returns price calculated from on-chain sqrtPriceX96
 */
export async function fetchPoolPriceFromIndexer(poolId: string): Promise<{
  price: number;
  inversePrice: number;
  tick: number;
  lastUpdated: string;
} | null> {
  try {
    // TODO: Use env variable for API URL
    const apiUrl = `http://localhost:3001/indexer/pools/${poolId}/price`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.warn(`Failed to fetch pool price from indexer: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return {
      price: parseFloat(data.price),
      inversePrice: parseFloat(data.inversePrice),
      tick: data.tick,
      lastUpdated: data.lastUpdated,
    };
  } catch (error) {
    console.error('Error fetching pool price from indexer:', error);
    return null;
  }
}

export interface QuoteParams {
  client: any;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amount: number; // human units
  tickSpacing?: number; // if omitted, tries common values
  fee?: number; // if omitted, inferred from tickSpacing
  hooks?: Address; // optional hook address for poolKey
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

  const [tokenInInfo, tokenOutInfo] = await Promise.all([
    fetchTokenInfo(client, tokenIn),
    fetchTokenInfo(client, tokenOut),
  ]);

  const token0 = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const token1 = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);

  // Try to resolve a valid pool by probing tick/fee candidates, respecting hooks if provided
  const hooks = (params.hooks ?? ZERO_ADDRESS) as Address;
  const tickCandidates = Array.from(new Set([
    ...(params.tickSpacing !== undefined ? [params.tickSpacing] : [60, 10, 200]),
  ]));
  const feeCandidates = Array.from(new Set([
    ...(params.fee !== undefined ? [params.fee] : [500, 3000, 10000]),
  ]));

  let tick = tickCandidates[0];
  let fee = params.fee ?? TICK_TO_FEE[tick] ?? 3000;

  console.groupCollapsed("🔎 V4Quote/estimateExactInput");
  console.debug("chainId:", chainId);
  console.debug("tokenIn:", tokenIn, tokenInInfo.symbol, tokenInInfo.decimals);
  console.debug("tokenOut:", tokenOut, tokenOutInfo.symbol, tokenOutInfo.decimals);
  console.debug("amount(human):", amount);
  console.debug("requested hooks:", hooks);
  console.debug("candidate tickSpacings:", tickCandidates);
  console.debug("candidate fees:", feeCandidates);
  console.debug("initial tickSpacing:", tick, "initial fee:", fee);

  // Pre-check and probe for a pool with liquidity
  let poolData = await getPool(client, chainId, fee, tick, hooks, token0, token1);
  if (!poolData?.pool || !poolData?.liquidity || BigInt(poolData.liquidity) === 0n) {
    console.warn("estimateExactInput: initial pool has no liquidity or not found", { tickSpacing: tick, fee });
    let found = false;
    for (const t of tickCandidates) {
      for (const f of feeCandidates) {
        try {
          const alt = await getPool(client, chainId, f, t, hooks, token0, token1);
          const hasLiquidity = Boolean(alt?.pool && alt?.liquidity && BigInt(alt.liquidity) > 0n);
          console.debug("probe:", { tickSpacing: t, fee: f, liquidity: alt?.liquidity?.toString?.(), found: hasLiquidity });
          if (hasLiquidity) {
            tick = t;
            fee = f;
            poolData = alt;
            found = true;
            break;
          }
        } catch (probeErr) {
          console.warn("probe error for", { tickSpacing: t, fee: f }, probeErr);
        }
      }
      if (found) break;
    }
  }
  if (!poolData?.pool || !poolData?.liquidity || BigInt(poolData.liquidity) === 0n) {
    console.warn("estimateExactInput: ❌ No pool/liquidity found for any candidate", { tickCandidates, feeCandidates });
    console.groupEnd();
    return null;
  }

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

  console.debug("sqrtPriceX96:", poolData.sqrtPriceX96, "tick:", poolData.tick, "liquidity:", poolData.liquidity);
  console.debug("price(before decimals):", price);
  console.debug("decimalsAdj:", decimalsAdj, "feeMultiplier:", feeMultiplier);
  console.debug("computed rate(tokenOut/tokenIn):", rate);
  console.groupEnd();

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

  const [tokenInInfo, tokenOutInfo] = await Promise.all([
    fetchTokenInfo(client, tokenIn),
    fetchTokenInfo(client, tokenOut),
  ]);

  const tokenA = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const tokenB = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);

  const token0IsA = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const currency0 = token0IsA ? tokenA : tokenB;
  const currency1 = token0IsA ? tokenB : tokenA;
  const zeroForOne = tokenA.address.toLowerCase() === currency0.address.toLowerCase();

  // Resolve a valid pool by probing tickSpacing candidates (if pool for requested tickSpacing doesn't exist)
  const tickCandidates = Array.from(new Set([
    ...(params.tickSpacing !== undefined ? [params.tickSpacing] : [60, 10, 200]),
  ]));
  const feeCandidates = Array.from(new Set([
    ...(params.fee !== undefined ? [params.fee] : [500, 3000, 10000]),
  ]));
  let tick = tickCandidates[0];
  let fee = params.fee ?? TICK_TO_FEE[tick] ?? 3000;
  const hooks = (params.hooks ?? ZERO_ADDRESS) as Address;

  // If pool uses hooks, many hook implementations may require non-empty hookData and
  // can cause Quoter to revert. In this case, prefer returning null so caller can
  // fallback to state-view estimation.
  if (hooks !== ZERO_ADDRESS) {
    console.warn("quoteExactInputSingle: hooks present, skipping Quoter and relying on estimateExactInput", { hooks });
    return null;
  }

  // Pre-check pool existence to avoid Quoter revert
  try {
    const poolCheck = await getPool(client, chainId, fee, tick, hooks, tokenA, tokenB);
    if (!poolCheck?.pool || !poolCheck?.liquidity || BigInt(poolCheck.liquidity) === 0n) {
      console.warn("quoteExactInputSingle: initial pool has no liquidity or not found", { tickSpacing: tick, fee });
      // Try other tickSpacing and fee combinations
      let found = false;
      for (const t of tickCandidates) {
        for (const f of feeCandidates) {
          try {
            const alt = await getPool(client, chainId, f, t, hooks, tokenA, tokenB);
            const hasLiquidity = Boolean(alt?.pool && alt?.liquidity && BigInt(alt.liquidity) > 0n);
            console.debug("quoter precheck probe:", { tickSpacing: t, fee: f, liquidity: alt?.liquidity?.toString?.(), found: hasLiquidity });
            if (hasLiquidity) {
              tick = t;
              fee = f;
              found = true;
              break;
            }
          } catch (probeErr) {
            console.warn("quoter precheck probe error for", { tickSpacing: t, fee: f }, probeErr);
          }
        }
        if (found) break;
      }
    }
    // Final verification before calling Quoter; if still missing liquidity, bail out
    const finalPool = await getPool(client, chainId, fee, tick, hooks, tokenA, tokenB);
    if (!finalPool?.pool || !finalPool?.liquidity || BigInt(finalPool.liquidity) === 0n) {
      console.warn("quoteExactInputSingle: ❌ no pool/liquidity for any candidate; skipping Quoter", { tickCandidates, feeCandidates });
      return null;
    }
  } catch (e) {
    // If state view fails or pool doesn’t exist, bail early (no revert from Quoter)
    console.warn("quoteExactInputSingle: ❌ pool check failed or pool missing, returning null.", e);
    console.groupEnd();
    return null;
  }

  const amountInWei = BigInt(Math.round(amount * Math.pow(10, tokenA.decimals)));

  // Prevent calling Quoter with zero amount which can cause a revert
  if (amountInWei <= 0n) {
    console.warn("quoteExactInputSingle: amountInWei computed as 0, returning null");
    console.groupEnd();
    return null;
  }

  console.groupCollapsed("🔎 V4Quote/quoteExactInputSingle");
  console.debug("chainId:", chainId);
  console.debug("addresses:", addresses);
  console.debug("tokenIn:", tokenIn, tokenInInfo.symbol, tokenInInfo.decimals);
  console.debug("tokenOut:", tokenOut, tokenOutInfo.symbol, tokenOutInfo.decimals);
  console.debug("zeroForOne:", zeroForOne);
  console.debug("tickSpacing:", tick, "fee:", fee, "hooks:", hooks);
  console.debug("amountInWei:", amountInWei.toString());

  // Optional sanity checks
  try {
    const quoterPoolManager = await client.readContract({ address: addresses.quoter as `0x${string}`, abi: QUOTER_ABI, functionName: "poolManager" });
    if (quoterPoolManager?.toLowerCase() !== addresses.poolManager.toLowerCase()) {
      console.warn(`Quoter linked PoolManager mismatch: ${quoterPoolManager}`);
    }
  } catch {}

  let quoted: any;
  try {
    console.debug("quoteExactInputSingle: calling with args:", [
      { currency0: currency0.address as `0x${string}`, currency1: currency1.address as `0x${string}`, fee, tickSpacing: tick, hooks: hooks as `0x${string}` },
      zeroForOne,
      amountInWei,
      "0x",
    ]);
    quoted = await client.readContract({
      address: addresses.quoter as `0x${string}`,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        { currency0: currency0.address as `0x${string}`, currency1: currency1.address as `0x${string}`, fee, tickSpacing: tick, hooks: hooks as `0x${string}` },
        zeroForOne,
        amountInWei,
        "0x",
      ],
    });
  } catch (err) {
    const sig = (err as any)?.data && typeof (err as any).data === "string" && (err as any).data.startsWith("0x")
      ? (err as any).data.slice(0, 10)
      : "0x";
    const msg = (err as any)?.shortMessage || (err as any)?.message || "";
    console.warn("quoteExactInputSingle: readContract reverted, returning null. signature:", sig, "message:", msg);
    console.groupEnd();
    return null;
  }

  console.debug("raw quoted response:", quoted);

  // Robust extraction across different ABI decoding shapes
  // Possible shapes:
  // - { quotedAmountOut: { amountOut: bigint } }
  // - { amountOut: bigint }
  // - [ { amountOut: bigint } ]
  // - bigint
  let amountOutWei: bigint | undefined;
  if (quoted && typeof quoted === "object" && !Array.isArray(quoted)) {
    const qObj = quoted as any;
    if (qObj.quotedAmountOut && typeof qObj.quotedAmountOut === "object") {
      amountOutWei = qObj.quotedAmountOut.amountOut as bigint;
    } else if (typeof qObj.amountOut === "bigint") {
      amountOutWei = qObj.amountOut as bigint;
    }
  }
  if (!amountOutWei && Array.isArray(quoted)) {
    const first = (quoted as any)[0];
    if (first && typeof first === "object" && typeof first.amountOut === "bigint") {
      amountOutWei = first.amountOut as bigint;
    } else if (typeof first === "bigint") {
      amountOutWei = first as bigint;
    }
  }
  if (!amountOutWei && typeof quoted === "bigint") {
    amountOutWei = quoted as bigint;
  }

  if (!amountOutWei || amountOutWei < 0n) {
    console.warn("quoteExactInputSingle: ❌ amountOutWei invalid or missing", amountOutWei);
    console.groupEnd();
    return null;
  }

  const amountOut = Number(amountOutWei) / Math.pow(10, tokenOutInfo.decimals);
  const rate = amountOut / amount;
  if (!isFinite(rate) || rate <= 0) {
    console.warn("quoteExactInputSingle: ❌ computed rate invalid:", rate);
    console.groupEnd();
    return null;
  }
  console.debug("amountOutWei:", amountOutWei.toString(), "amountOut(human):", amountOut, "rate:", rate);
  console.groupEnd();
  return { amountOut, rate };
}

export async function quoteExactOutputSingle(params: QuoteParams): Promise<QuoteResult | null> {
  // Simple inversion using input quote; could be replaced with dedicated exactOutput quoter if available
  const q = await quoteExactInputSingle({ ...params, amount: 1 });
  if (!q || !q.rate || q.rate <= 0) return null;
  return { amountIn: params.amount / q.rate, rate: q.rate };
}