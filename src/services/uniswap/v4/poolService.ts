import { Address } from "viem";
import { Token } from "@uniswap/sdk-core";
import { TickMath } from "@uniswap/v3-sdk";
import { Pool } from "@uniswap/v4-sdk";
import {
  getUniswapV4Addresses,
  POOL_MANAGER_ABI,
  STATE_VIEW_ABI,
} from "@/config/uniswapV4";
import { ZERO_ADDRESS, decodePositionInfo, getBigIntPoolId } from "./helpers";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export async function getPool(
  client: any,
  chainId: number,
  fee: number,
  tickSpacing: number,
  hookAddress: Address,
  token0: Token,
  token1: Token
) {
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) {
      throw new Error(`V4 not supported on chain ${chainId}`);
    }

    const poolKey: PoolKey = {
      currency0: token0.address as Address,
      currency1: token1.address as Address,
      fee,
      tickSpacing,
      hooks: hookAddress,
    };

    // Get poolId using V4 SDK
    const poolId = Pool.getPoolId(
      token0,
      token1,
      fee,
      tickSpacing,
      hookAddress
    );
    const bigIntPoolId = getBigIntPoolId(poolKey);

    const [slot0, liquidity] = await Promise.all([
      client.readContract({
        address: addresses.stateView as Address,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId as `0x${string}`],
      }),
      client.readContract({
        address: addresses.stateView as Address,
        abi: STATE_VIEW_ABI,
        functionName: "getLiquidity",
        args: [poolId as `0x${string}`],
      }),
    ]);

    const sqrtPriceX96Current = (slot0 as any)[0] as bigint;
    const currentTick = (slot0 as any)[1] as number;
    const currentLiquidity = liquidity as bigint;

    // Create V4 Pool instance
    const pool = new Pool(
      token0,
      token1,
      fee,
      tickSpacing,
      hookAddress,
      sqrtPriceX96Current.toString(),
      currentLiquidity.toString(),
      currentTick
    );

    return {
      pool,
      poolKey,
      sqrtPriceX96: sqrtPriceX96Current.toString(),
      tick: currentTick,
      liquidity: currentLiquidity.toString(),
    };
  } catch (error) {
    console.error("❌ Error in getPool:", error);
    return null;
  }
}

export async function initializePool(
  client: any,
  walletClient: any,
  chainId: number,
  account: Address,
  token0: Token,
  token1: Token,
  fee: number,
  tickSpacing: number,
  hooks: Address = ZERO_ADDRESS
) {
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) {
      throw new Error(`V4 not supported on chain ${chainId}`);
    }

    console.log("🔹 Starting pool initialization...");
    console.log("Tokens:", token0.symbol, token1.symbol);
    console.log("Fee:", fee);
    console.log("Tick spacing:", tickSpacing);

    // Sort tokens
    const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
    const currency0 = token0IsA ? token0 : token1;
    const currency1 = token0IsA ? token1 : token0;

    const poolKey = {
      currency0: currency0.address as Address,
      currency1: currency1.address as Address,
      fee,
      tickSpacing,
      hooks: hooks || ZERO_ADDRESS,
    };

    // Check if pool exists
    const existingPool = await getPool(
      client,
      chainId,
      fee,
      tickSpacing,
      hooks,
      token0,
      token1
    );
    if (existingPool && existingPool.pool) {
      console.log("✅ Pool already exists");
      return existingPool.pool;
    }

    // Initialize at 1:1 price (tick 0)
    const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(0).toString();
    console.log("🔹 sqrtPriceX96 (1:1):", sqrtPriceX96);

    // Send initialize transaction
    const hash = await walletClient.writeContract({
      account,
      address: addresses.poolManager as Address,
      abi: POOL_MANAGER_ABI,
      functionName: "initialize",
      args: [poolKey, BigInt(sqrtPriceX96)],
    });

    console.log("⛓️  Initializing pool... tx:", hash);

    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log("✅ Pool initialized successfully!");
    console.log("Tx receipt:", receipt.transactionHash);

    // Fetch newly created pool
    const newPool = await getPool(client, chainId, fee, tickSpacing, hooks, token0, token1);
    if (!newPool || !newPool.pool) {
      throw new Error("Failed to fetch pool after initialization");
    }

    return newPool.pool;
  } catch (error: any) {
    console.error("❌ Error in initializePool:", error);
    throw error;
  }
}
