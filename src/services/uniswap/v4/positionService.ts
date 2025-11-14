import { Address, decodeAbiParameters, encodeFunctionData, BaseError, ContractFunctionRevertedError } from "viem";
import { Token, Percent, Ether, CurrencyAmount } from "@uniswap/sdk-core";
import { nearestUsableTick, TickMath } from "@uniswap/v3-sdk";
import { Position, MintOptions, V4PositionManager, PermitDetails } from "@uniswap/v4-sdk";
import {
  getUniswapV4Addresses,
  POSITION_MANAGER_ABI,
  PERMIT2_ABI,
  PERMIT2_TYPES,
  ERC20_ABI,
  STATE_VIEW_ABI,
} from "@/config/uniswapV4";
import { getPool } from "./poolService";
import { ZERO_ADDRESS, isNativeETH, fetchTokenInfo, decodePositionInfo } from "./helpers";
import { Pool } from "@uniswap/v4-sdk";

const AMOUNT_MAX = 2n ** 256n - 1n;
const MAX_UINT128 = 2n ** 128n - 1n;

// In-memory caches for frequently accessed position data
const DETAILS_CACHE = new Map<string, { value: V4PositionDetails; ts: number }>();
const FEES_CACHE = new Map<string, { value: { token0: { symbol: string; address: Address; amount: string }; token1: { symbol: string; address: Address; amount: string } }; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export function invalidatePositionCaches(chainId: number, tokenId: bigint) {
  const key = `${chainId}-${tokenId.toString()}`;
  DETAILS_CACHE.delete(key);
  FEES_CACHE.delete(key);
}

export function calculateLiquidityToRemove(
  currentLiquidity: bigint,
  percentageToRemove: number // 0.25 = 25%, 1.0 = 100%
): {
  liquidityToRemove: bigint;
  liquidityPercentage: Percent;
} {
  const scaled = Math.floor(percentageToRemove * 10000);
  const liquidityToRemove = (currentLiquidity * BigInt(scaled)) / 10000n;
  const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 100);
  return { liquidityToRemove, liquidityPercentage };
}

export async function removeLiquidityFromPosition(
  client: any,
  walletClient: any,
  chainId: number,
  account: Address,
  tokenId: bigint,
  percentageToRemove: number, // 0.25 = 25%, 1.0 = 100%
  slippageTolerance: number = 0.05,
  burnTokenIfEmpty: boolean = false
) {
  try {
    console.groupCollapsed("🔎 V4Position/removeLiquidityFromPosition");
    console.debug("inputs:", {
      chainId,
      account,
      tokenId: tokenId.toString(),
      percentageToRemove,
      slippageTolerance,
      burnTokenIfEmpty,
    });
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) throw new Error(`V4 not supported on chain ${chainId}`);
    console.debug("🔗 Using connected chainId", chainId, {
      positionManager: addresses.positionManager,
      stateView: addresses.stateView,
      permit2: addresses.permit2,
    });

    // Load full position details from chain
    const details = await getPositionDetails(client, chainId, tokenId);
    if (!details) throw new Error("Position details not found");

    // Build tokens (fetch metadata concurrently)
    const [token0Info, token1Info] = await Promise.all([
      fetchTokenInfo(client, details.token0.address),
      fetchTokenInfo(client, details.token1.address),
    ]);
    const token0 = new Token(chainId, details.token0.address, token0Info.decimals, token0Info.symbol, token0Info.name);
    const token1 = new Token(chainId, details.token1.address, token1Info.decimals, token1Info.symbol, token1Info.name);

    // Get pool (current state)
    const poolData = await getPool(
      client,
      chainId,
      details.poolKey.fee,
      details.poolKey.tickSpacing,
      details.poolKey.hooks as Address,
      token0,
      token1
    );
    if (!poolData || !poolData.pool) throw new Error("Pool not found for position");
    const { pool } = poolData;

    console.debug("position details:", {
      tokenId: tokenId.toString(),
      liquidity: details.liquidity.toString(),
      tickLower: details.tickLower,
      tickUpper: details.tickUpper,
      tickSpacingFromPoolKey: details.poolKey.tickSpacing,
      tickSpacingFromPool: pool.tickSpacing,
      fee: details.poolKey.fee,
      hooks: details.poolKey.hooks,
      currency0: details.poolKey.currency0,
      currency1: details.poolKey.currency1,
    });
    if (details.poolKey.tickSpacing !== pool.tickSpacing) {
      console.warn("⚠️ tickSpacing mismatch between position.poolKey and live pool", {
        fromPoolKey: details.poolKey.tickSpacing,
        fromPool: pool.tickSpacing,
      });
    }

    // Validate ticks against spacing and global bounds without invoking nearestUsableTick on raw values
    const spacing = pool.tickSpacing;
    if (!Number.isFinite(spacing) || spacing <= 0) {
      console.error("❌ Invalid tickSpacing from pool", { spacing });
      throw new Error("INVALID_TICK_SPACING");
    }

    const minUsable = Math.ceil(TickMath.MIN_TICK / spacing) * spacing;
    const maxUsable = Math.floor(TickMath.MAX_TICK / spacing) * spacing;
    const isAligned = (t: number) => ((t % spacing) + spacing) % spacing === 0;

    console.debug("tick validation", {
      raw: { lower: details.tickLower, upper: details.tickUpper },
      spacing,
      bounds: { minUsable, maxUsable, global: { min: TickMath.MIN_TICK, max: TickMath.MAX_TICK } },
      alignment: { lowerAligned: isAligned(details.tickLower), upperAligned: isAligned(details.tickUpper) },
    });
    if (details.tickLower >= details.tickUpper) {
      console.error("❌ Decoded ticks invalid order (lower >= upper)", {
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
      });
      throw new Error("DECODE_INVALID_TICK_ORDER");
    }
    if (!isAligned(details.tickLower) || !isAligned(details.tickUpper)) {
      console.error("❌ Decoded ticks not aligned to spacing — refusing to mutate", {
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
        spacing,
      });
      throw new Error("DECODE_MISALIGNED_TICKS");
    }
    if (details.tickLower < TickMath.MIN_TICK || details.tickUpper > TickMath.MAX_TICK) {
      console.error("❌ Decoded ticks outside global bounds", {
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
        minGlobal: TickMath.MIN_TICK,
        maxGlobal: TickMath.MAX_TICK,
      });
      throw new Error("DECODE_TICKS_OUT_OF_BOUNDS");
    }

    // Calculate percent to remove
    const { liquidityToRemove, liquidityPercentage } = calculateLiquidityToRemove(details.liquidity, percentageToRemove);

    console.debug("computed removal:", {
      liquidityToRemove: liquidityToRemove.toString(),
      liquidityPercentage: `${liquidityPercentage.numerator}/${liquidityPercentage.denominator}`,
    });

    // Recreate Position with current liquidity to compute remove calldata
    let position: Position;
    try {
      position = new Position({
        pool: pool as Pool,
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
        liquidity: details.liquidity.toString(),
      });
    } catch (err) {
      console.error("❌ Failed to construct SDK Position:", {
        err,
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
        spacing,
      });
      throw err;
    }

    // Interpret slippageTolerance as fraction (e.g., 0.005 for 0.5%)
    const slipNumerator = Math.max(0, Math.round(slippageTolerance * 10_000));
    const slippagePct = new Percent(slipNumerator, 10_000);
    const block = await client.getBlock();
    const deadline = Number(block.timestamp) + 20 * 60;

    const removeOptions = {
      slippageTolerance: slippagePct,
      deadline: deadline.toString(),
      hookData: "0x",
      tokenId: tokenId.toString(),
      liquidityPercentage,
      burnToken: burnTokenIfEmpty && percentageToRemove === 1.0,
    };

    console.debug("remove options:", {
      slippagePct: `${slippagePct.numerator}/${slippagePct.denominator}`,
      deadline,
      burnToken: removeOptions.burnToken,
    });

    let calldata, value;
    try {
      ({ calldata, value } = V4PositionManager.removeCallParameters(position, removeOptions));
    } catch (err: any) {
      console.error("❌ removeCallParameters failed", {
        message: err?.message,
        cause: err?.cause,
        ticks: { lower: details.tickLower, upper: details.tickUpper },
        spacing,
        bounds: { minUsable, maxUsable },
      });
      throw err;
    }
    console.debug("🧩 calldata", calldata);
    console.debug("💰 value", value);
    console.debug("📦 remove options", removeOptions);

    const txHash = await walletClient.writeContract({
      account,
      address: addresses.positionManager as Address,
      abi: POSITION_MANAGER_ABI,
      functionName: "multicall",
      args: [[calldata as `0x${string}`]],
      value: BigInt(value.toString()),
    });

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    console.debug("✅ Remove success:", txHash);
    console.groupEnd();
    return {
      txHash,
      receipt,
      removedLiquidity: liquidityToRemove,
      percentageRemoved: percentageToRemove,
      tokenBurned: burnTokenIfEmpty && percentageToRemove === 1.0,
    };
  } catch (error) {
    console.error("❌ Error in removeLiquidityFromPosition:", error);
    console.groupEnd();
    throw error;
  }
}

export async function mintPosition(
  client: any,
  walletClient: any,
  chainId: number,
  account: Address,
  fee: number,
  tickSpacing: number,
  hookAddress: Address,
  token0: Token,
  token1: Token,
  amount0: string,
  amount1: string,
  usePermit2: boolean = true
) {
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) {
      throw new Error(`V4 not supported on chain ${chainId}`);
    }
    console.debug("getPositionDetails: using addresses", {
      chainId,
      positionManager: addresses.positionManager,
      stateView: addresses.stateView,
    });

    // Get pool
    const poolData = await getPool(client, chainId, fee, tickSpacing, hookAddress, token0, token1);
    if (!poolData || !poolData.pool) {
      throw new Error("Pool not found");
    }

    const { pool } = poolData;

    // Calculate tick range
    const currentTick = pool.tickCurrent;
    const poolTickSpacing = pool.tickSpacing;
    const tickRangeAmount = poolTickSpacing * 10;
    const tickLower = nearestUsableTick(currentTick - tickRangeAmount, poolTickSpacing);
    const tickUpper = nearestUsableTick(currentTick + tickRangeAmount, poolTickSpacing);

    console.log("🔹 Tick range:", tickLower, "to", tickUpper);

    // Sort amounts by token order
    const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
    const amount0Desired = token0IsA ? amount0 : amount1;
    const amount1Desired = token0IsA ? amount1 : amount0;

    console.log("📊 Creating position with amounts:", {
      amount0Desired,
      amount1Desired,
      tickLower,
      tickUpper
    });

    // Dynamically estimate native gas fees and adjust native amount to use near-full balance
    let adjAmount0 = amount0Desired;
    let adjAmount1 = amount1Desired;
    const hasNative = token0.isNative || token1.isNative;
    if (hasNative) {
      try {
        const balance = await client.getBalance({ address: account });
        // Estimate approval gas (if non-native tokens will be approved)
        let approvalsFee: bigint = 0n;
        const AMAX = AMOUNT_MAX;
        // Simulate approvals that code will execute when usePermit2 is true
        if (usePermit2) {
          if (!token0.isNative) {
            const sim0 = await client.simulateContract({
              account,
              address: token0.address as Address,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [addresses.permit2 as Address, AMAX],
            });
            const gas0 = (sim0.request as any).gas as bigint | undefined;
            const fee0PerGas = ((sim0.request as any).maxFeePerGas as bigint | undefined) ?? (await client.getGasPrice());
            if (gas0) approvalsFee += gas0 * fee0PerGas;
          }
          if (!token1.isNative) {
            const sim1 = await client.simulateContract({
              account,
              address: token1.address as Address,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [addresses.permit2 as Address, AMAX],
            });
            const gas1 = (sim1.request as any).gas as bigint | undefined;
            const fee1PerGas = ((sim1.request as any).maxFeePerGas as bigint | undefined) ?? (await client.getGasPrice());
            if (gas1) approvalsFee += gas1 * fee1PerGas;
          }
        }

        // Build initial position to simulate mint gas
        const prePosition = Position.fromAmounts({
          pool,
          tickLower,
          tickUpper,
          amount0: amount0Desired,
          amount1: amount1Desired,
          useFullPrecision: false,
        });
        const preParams = V4PositionManager.addCallParameters(prePosition, {
          recipient: account,
          slippageTolerance: new Percent(50, 10_000),
          deadline: (Number((await client.getBlock()).timestamp) + 20 * 60).toString(),
          useNative: token0.isNative
            ? Ether.onChain(token0.chainId)
            : token1.isNative
            ? Ether.onChain(token1.chainId)
            : undefined,
          hookData: "0x",
        });
        const { calldata: preCalldata, value: preValue } = preParams;

        // Simulate multicall to estimate gas
        const simMint = await client.simulateContract({
          account,
          address: addresses.positionManager as Address,
          abi: POSITION_MANAGER_ABI,
          functionName: "multicall",
          args: [[preCalldata as `0x${string}`]],
          value: BigInt(preValue.toString()),
        });
        const gasMint = (simMint.request as any).gas as bigint | undefined;
        const mintFeePerGas = ((simMint.request as any).maxFeePerGas as bigint | undefined) ?? (await client.getGasPrice());
        const mintFee = gasMint ? gasMint * mintFeePerGas : 0n;

        // Reserve total fees with 15% buffer
        const totalFees = approvalsFee + mintFee;
        const totalWithBuffer = totalFees + (totalFees * 15n) / 100n;
        const availableNative = balance > totalWithBuffer ? balance - totalWithBuffer : 0n;
        if (availableNative <= 0n) {
          throw new Error("Số dư native không đủ để trả phí gas khi mint vị thế");
        }

        // Adjust native-side desired amount to availableNative
        if (token0.isNative) {
          const desired0Wei = BigInt(adjAmount0);
          adjAmount0 = (availableNative < desired0Wei ? availableNative : desired0Wei).toString();
        } else if (token1.isNative) {
          const desired1Wei = BigInt(adjAmount1);
          adjAmount1 = (availableNative < desired1Wei ? availableNative : desired1Wei).toString();
        }
      } catch (e) {
        console.warn("Native fee estimation for mint failed; continuing with user-entered amounts", e);
      }
    }

    // Create position - use string amounts to satisfy BigintIsh
    const position = Position.fromAmounts({
      pool,
      tickLower,
      tickUpper,
      amount0: adjAmount0,
      amount1: adjAmount1,
      useFullPrecision: false,
    });

    console.log("💧 Liquidity:", position.liquidity.toString());

    // Create mint options
    const slippagePct = new Percent(50, 10_000); // 0.5%
    const block = await client.getBlock();
    const deadline = Number(block.timestamp) + 20 * 60; // +20 minutes

    const mintOptions: MintOptions = {
      recipient: account,
      slippageTolerance: slippagePct,
      deadline: deadline.toString(),
      useNative: token0.isNative
        ? Ether.onChain(token0.chainId)
        : token1.isNative
        ? Ether.onChain(token1.chainId)
        : undefined,
      hookData: "0x",
    };

    // Approve tokens if using Permit2
    if (usePermit2) {
      console.log("🔑 Approving tokens for Permit2...");

      if (!token0.isNative) {
        const hash0 = await walletClient.writeContract({
          account,
          address: token0.address as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [addresses.permit2 as Address, AMOUNT_MAX],
        });
        console.log(`⏳ Waiting for Token0 Approve TX: ${hash0}`);
        await client.waitForTransactionReceipt({ hash: hash0 });
        console.log(`✅ Token0 Approved!`);
      }

      if (!token1.isNative) {
        const hash1 = await walletClient.writeContract({
          account,
          address: token1.address as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [addresses.permit2 as Address, AMOUNT_MAX],
        });
        console.log(`⏳ Waiting for Token1 Approve TX: ${hash1}`);
        await client.waitForTransactionReceipt({ hash: hash1 });
        console.log(`✅ Token1 Approved!`);
      }

      // Get Permit2 signature
      console.log("🔑 Getting Permit2 signature...");
      console.log("WalletClient account:", walletClient.account);
      
      const batchPermit = await gaslessApproval(
        client,
        walletClient,
        chainId,
        account,
        addresses.permit2 as Address,
        addresses.positionManager as Address,
        token0,
        token1
      );
      if (batchPermit) {
        console.log("✅ Permit2 signature obtained");
        mintOptions.batchPermit = batchPermit;
      } else {
        console.log("⚠️ Skipping Permit2 - continuing without batch permit");
      }
    }

    // Generate calldata
    const { calldata, value } = V4PositionManager.addCallParameters(position, mintOptions);
    console.log("🧩 calldata", calldata);
    console.log("💰 value", value);

    // Send transaction
    const txHash = await walletClient.writeContract({
      account,
      address: addresses.positionManager as Address,
      abi: POSITION_MANAGER_ABI,
      functionName: "multicall",
      args: [[calldata as `0x${string}`]],
      value: BigInt(value),
    });

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    console.log("✅ Mint success:", txHash);

    return {
      txHash,
      receipt,
      position,
    };
  } catch (err) {
    console.error("❌ Error in mintPosition:", err);
    throw err;
  }
}

async function gaslessApproval(
  client: any,
  walletClient: any,
  chainId: number,
  userAddress: Address,
  permit2Address: Address,
  positionManagerAddress: Address,
  tokenA: Token,
  tokenB: Token
) {
  try {
    // Check if walletClient has account
    const account = walletClient.account || { address: userAddress };
    if (!account.address) {
      console.warn("⚠️ No account found in walletClient, using userAddress");
    }

    const permitDetails: PermitDetails[] = [];
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    for (const token of [tokenA, tokenB]) {
      if (!token.isNative) {
        const allowanceData = (await client.readContract({
          address: permit2Address,
          abi: PERMIT2_ABI,
          functionName: "allowance",
          args: [userAddress, token.address as Address, positionManagerAddress],
        })) as [bigint, number, number];

        const nonce = allowanceData[2];

        permitDetails.push({
          token: token.address,
          amount: (2n ** 160n - 1n).toString(),
          expiration: deadline.toString(),
          nonce: nonce.toString(),
        });
      }
    }

    if (!permitDetails.length) return null;

    const permitData = {
      details: permitDetails,
      spender: positionManagerAddress,
      sigDeadline: deadline.toString(),
    };

    console.log("📝 Signing permit data with account:", account.address || userAddress);

    const signature = await walletClient.signTypedData({
      account: account.address || userAddress,
      domain: {
        name: "Permit2",
        chainId,
        verifyingContract: permit2Address,
      },
      types: PERMIT2_TYPES,
      primaryType: "PermitBatch",
      message: permitData,
    });

    console.log("🪶 Permit2 Signature OK:", signature);

    return {
      owner: userAddress,
      permitBatch: permitData,
      signature,
    };
  } catch (error) {
    console.error("❌ gaslessApproval failed:", error);
    return null;
  }
}

export async function getUserPositions(
  client: any,
  chainId: number,
  userAddress: Address
): Promise<bigint[]> {
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) {
      throw new Error(`V4 not supported on chain ${chainId}`);
    }

    const balance = await client.readContract({
      address: addresses.positionManager as Address,
      abi: POSITION_MANAGER_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    });

    const balanceNum = Number(balance);
    const tokenIds: bigint[] = [];

    for (let i = 0; i < balanceNum; i++) {
      const tokenId = await client.readContract({
        address: addresses.positionManager as Address,
        abi: POSITION_MANAGER_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [userAddress, BigInt(i)],
      });
      tokenIds.push(tokenId as bigint);
    }

    return tokenIds;
  } catch (error) {
    console.error("❌ Error in getUserPositions:", error);
    return [];
  }
}

export interface V4PositionDetails {
  tokenId: bigint;
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  token0: { address: Address; symbol: string };
  token1: { address: Address; symbol: string };
}

export async function getPositionDetails(
  client: any,
  chainId: number,
  tokenId: bigint
): Promise<V4PositionDetails | null> {
  const cacheKey = `${chainId}-${tokenId.toString()}`;
  const cached = DETAILS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) {
      throw new Error(`V4 not supported on chain ${chainId}`);
    }

    const [poolKey, infoValue] = (await client.readContract({
      address: addresses.positionManager as Address,
      abi: POSITION_MANAGER_ABI,
      functionName: "getPoolAndPositionInfo",
      args: [tokenId],
    })) as [
      { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address },
      bigint
    ];

    // Decode packed ticks from PositionInfo (no liquidity in info)
    const { tickLower, tickUpper } = decodePositionInfo(infoValue);

    // Read liquidity and fetch token metadata concurrently
    const [liquidity, token0Info, token1Info] = await Promise.all([
      client.readContract({
        address: addresses.positionManager as Address,
        abi: POSITION_MANAGER_ABI,
        functionName: "getPositionLiquidity",
        args: [tokenId],
      }) as Promise<bigint>,
      fetchTokenInfo(client, poolKey.currency0),
      fetchTokenInfo(client, poolKey.currency1),
    ]);

    const token0 = new Token(chainId, poolKey.currency0, token0Info.decimals, token0Info.symbol, token0Info.name);
    const token1 = new Token(chainId, poolKey.currency1, token1Info.decimals, token1Info.symbol, token1Info.name);

    // Compute poolId via SDK and get current tick (optional, do not fail hard)
    let currentTick = 0;
    let protocolFee = 0;
    let lpFee = 0;
    try {
      const poolId = Pool.getPoolId(token0, token1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks);
      const slot0 = (await client.readContract({
        address: addresses.stateView as Address,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId as `0x${string}`],
      })) as [bigint, number, number, number];
      currentTick = Number(slot0[1]);
      protocolFee = Number(slot0[2]);
      lpFee = Number(slot0[3]);
    } catch (e: any) {
      console.warn("getPositionDetails: getSlot0 failed, continuing without currentTick", {
        message: e?.message,
      });
    }

    const result = {
      tokenId,
      poolKey,
      liquidity,
      tickLower,
      tickUpper,
      currentTick,
      token0: { address: poolKey.currency0, symbol: token0Info.symbol },
      token1: { address: poolKey.currency1, symbol: token1Info.symbol },
    };

    console.debug("getPositionDetails: result", {
      tokenId: tokenId.toString(),
      token0: result.token0.symbol,
      token1: result.token1.symbol,
      fee: result.poolKey.fee,
      tickBounds: [result.tickLower, result.tickUpper],
      currentTick: result.currentTick,
      protocolFee,
      lpFee,
    });

    DETAILS_CACHE.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  } catch (error) {
    console.error("❌ Error in getPositionDetails:", error);
    return null;
  }
}

/**
 * Estimate token amounts received when removing a percentage of liquidity
 */
export async function estimateRemoveAmounts(
  client: any,
  chainId: number,
  tokenId: bigint,
  percentageToRemove: number, // 0.25 = 25%, 1.0 = 100%
  slippageTolerance: number = 0.005 // 0.5%
): Promise<{
  token0: { symbol: string; address: Address; estimate: string; minimum: string };
  token1: { symbol: string; address: Address; estimate: string; minimum: string };
  inRange: boolean;
  oneSided: boolean;
  percentageRemoved: number;
} | null> {
  try {
    const details = await getPositionDetails(client, chainId, tokenId);
    if (!details) return null;

    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) throw new Error(`V4 not supported on chain ${chainId}`);

    // Build token objects with decimals (concurrent fetch)
    const [token0Info, token1Info] = await Promise.all([
      fetchTokenInfo(client, details.token0.address),
      fetchTokenInfo(client, details.token1.address),
    ]);
    const token0 = new Token(chainId, details.token0.address, token0Info.decimals, token0Info.symbol, token0Info.name);
    const token1 = new Token(chainId, details.token1.address, token1Info.decimals, token1Info.symbol, token1Info.name);

    // Get live pool for current tick/price
    const { pool } = await getPool(
      client,
      chainId,
      details.poolKey.fee,
      details.poolKey.tickSpacing,
      details.poolKey.hooks as Address,
      token0,
      token1
    );
    if (!pool) throw new Error("Pool not found for position");

    // Compute partial liquidity to burn (use BPS to avoid float rounding)
    const percentBps = Math.max(0, Math.min(10000, Math.round(percentageToRemove * 10000)));
    const liquidityPartial = (details.liquidity * BigInt(percentBps)) / 10000n;

    // Construct a Position for the partial liquidity
    const partialPosition = new Position({
      pool: pool as Pool,
      tickLower: details.tickLower,
      tickUpper: details.tickUpper,
      liquidity: liquidityPartial.toString(),
    });

    // Estimated amounts at current price (human-friendly via CurrencyAmount)
    const est0 = partialPosition.amount0;
    const est1 = partialPosition.amount1;

    // Minimum amounts using SDK's burnAmountsWithSlippage for accuracy
    const slipBps = Math.max(0, Math.round(slippageTolerance * 10000));
    const burnMin = partialPosition.burnAmountsWithSlippage(new Percent(slipBps, 10000));
    // Convert JSBI to string to avoid cross-package JSBI type mismatch
    const min0 = CurrencyAmount.fromRawAmount(token0, burnMin.amount0.toString());
    const min1 = CurrencyAmount.fromRawAmount(token1, burnMin.amount1.toString());

    const inRange = details.currentTick >= details.tickLower && details.currentTick <= details.tickUpper;
    const oneSided = burnMin.amount0.toString() === "0" || burnMin.amount1.toString() === "0";

    return {
      token0: {
        symbol: token0.symbol ?? details.token0.symbol,
        address: details.token0.address,
        estimate: est0.toSignificant(6),
        minimum: min0.toSignificant(6),
      },
      token1: {
        symbol: token1.symbol ?? details.token1.symbol,
        address: details.token1.address,
        estimate: est1.toSignificant(6),
        minimum: min1.toSignificant(6),
      },
      inRange,
      oneSided,
      percentageRemoved: percentageToRemove,
    };
  } catch (error) {
    console.warn("estimateRemoveAmounts: failed to estimate", error);
    return null;
  }
}

/**
 * Estimate full-position token amounts equivalent at current price.
 * Convenience wrapper for percentageToRemove = 1.0
 */
export async function estimatePositionAmounts(
  client: any,
  chainId: number,
  tokenId: bigint,
  slippageTolerance: number = 0.005 // 0.5%
): Promise<{
  token0: { symbol: string; address: Address; estimate: string; minimum: string };
  token1: { symbol: string; address: Address; estimate: string; minimum: string };
  inRange: boolean;
  oneSided: boolean;
} | null> {
  const res = await estimateRemoveAmounts(client, chainId, tokenId, 1.0, slippageTolerance);
  if (!res) return null;
  const { token0, token1, inRange, oneSided } = res;
  return { token0, token1, inRange, oneSided };
}

/**
 * Estimate unclaimed fees via static call simulation of collect.
 * Uses PositionManager.multicall with collect calldata and decodes returned amounts.
 */
export async function estimateUnclaimedFees(
  client: any,
  chainId: number,
  tokenId: bigint,
  account?: Address
): Promise<{
  token0: { symbol: string; address: Address; amount: string };
  token1: { symbol: string; address: Address; amount: string };
} | null> {
  const cacheKey = `${chainId}-${tokenId.toString()}`;
  const cached = FEES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) throw new Error(`V4 not supported on chain ${chainId}`);

    console.groupCollapsed("🔎 estimateUnclaimedFees/start");
    console.debug("chainId:", chainId, "tokenId:", tokenId.toString());
    console.debug("using off-chain StateView computation; no owner/approve required");

    const details = await getPositionDetails(client, chainId, tokenId);
    if (!details) return null;

    // Build tokens for decimals/symbol and compute poolId
    const [token0Info, token1Info] = await Promise.all([
      fetchTokenInfo(client, details.token0.address),
      fetchTokenInfo(client, details.token1.address),
    ]);

    const token0 = new Token(chainId, details.token0.address, token0Info.decimals, token0Info.symbol, token0Info.name);
    const token1 = new Token(chainId, details.token1.address, token1Info.decimals, token1Info.symbol, token1Info.name);

    const poolId = Pool.getPoolId(token0, token1, details.poolKey.fee, details.poolKey.tickSpacing, details.poolKey.hooks) as `0x${string}`;

    // Derive salt from tokenId and set owner to PositionManager per Uniswap v4
    const salt = (`0x${tokenId.toString(16).padStart(64, "0")}`) as `0x${string}`;
    const owner = addresses.positionManager as Address;

    // Read last fee growth from StateView (position info)
    let feeGrowthInside0LastX128: bigint = 0n;
    let feeGrowthInside1LastX128: bigint = 0n;
    try {
      const posInfo = (await client.readContract({
        address: addresses.stateView as Address,
        abi: STATE_VIEW_ABI,
        functionName: "getPositionInfo",
        args: [poolId, owner, details.tickLower, details.tickUpper, salt],
      })) as [bigint, bigint, bigint];
      feeGrowthInside0LastX128 = posInfo[1];
      feeGrowthInside1LastX128 = posInfo[2];
      console.debug("position last fee growth:", {
        feeGrowthInside0LastX128: feeGrowthInside0LastX128.toString(),
        feeGrowthInside1LastX128: feeGrowthInside1LastX128.toString(),
      });
    } catch (e: any) {
      console.warn("estimateUnclaimedFees: getPositionInfo failed; defaulting last growth to 0", e?.message);
    }

    // Read current fee growth inside bounds
    const [feeGrowthInside0X128, feeGrowthInside1X128] = (await client.readContract({
      address: addresses.stateView as Address,
      abi: STATE_VIEW_ABI,
      functionName: "getFeeGrowthInside",
      args: [poolId, details.tickLower, details.tickUpper],
    })) as [bigint, bigint];

    // Compute unclaimed amounts = (current - last) * liquidity / Q128
    const Q128 = 2n ** 128n;
    const delta0 = feeGrowthInside0X128 >= feeGrowthInside0LastX128 ? (feeGrowthInside0X128 - feeGrowthInside0LastX128) : 0n;
    const delta1 = feeGrowthInside1X128 >= feeGrowthInside1LastX128 ? (feeGrowthInside1X128 - feeGrowthInside1LastX128) : 0n;
    const raw0 = (delta0 * details.liquidity) / Q128;
    const raw1 = (delta1 * details.liquidity) / Q128;
    console.debug("computed raw fees:", { raw0: raw0.toString(), raw1: raw1.toString() });

    // Format to significant strings using decimals
    const amt0 = CurrencyAmount.fromRawAmount(token0, raw0.toString()).toSignificant(6);
    const amt1 = CurrencyAmount.fromRawAmount(token1, raw1.toString()).toSignificant(6);

    const result = {
      token0: { symbol: token0.symbol ?? token0Info.symbol, address: details.token0.address, amount: amt0 },
      token1: { symbol: token1.symbol ?? token1Info.symbol, address: details.token1.address, amount: amt1 },
    };
    console.debug("estimateUnclaimedFees: computed amounts", {
      tokenId: tokenId.toString(),
      token0: result.token0.amount,
      token1: result.token1.amount,
    });
    FEES_CACHE.set(cacheKey, { value: result, ts: Date.now() });
    console.groupEnd();
    return result;
  } catch (error) {
    console.warn("estimateUnclaimedFees: computation failed", error);
    console.groupEnd();
    return null;
  }
}

/**
 * Claim fees from a V4 position via PositionManager.multicall collect
 */
export async function collectFeesFromPosition(
  client: any,
  walletClient: any,
  chainId: number,
  account: Address,
  tokenId: bigint,
  recipient?: Address
) {
  try {
    console.groupCollapsed("🔎 collectFeesFromPosition/start");
    console.debug("params:", { chainId, account, tokenId: tokenId?.toString(), recipient });
    const addresses = getUniswapV4Addresses(chainId);
    if (!addresses) throw new Error(`V4 not supported on chain ${chainId}`);

    // Guard against missing tokenId to avoid runtime TypeError
    if (tokenId === undefined || tokenId === null) {
      throw new TypeError("collectFeesFromPosition: tokenId is required");
    }

    // Verify ownership: ensure the connected wallet owns this position tokenId
    try {
      const balance = (await client.readContract({
        address: addresses.positionManager as Address,
        abi: POSITION_MANAGER_ABI,
        functionName: "balanceOf",
        args: [account],
      })) as bigint;

      let owns = false;
      for (let i = 0n; i < balance; i++) {
        const id = (await client.readContract({
          address: addresses.positionManager as Address,
          abi: POSITION_MANAGER_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [account, i],
        })) as bigint;
        if (id === tokenId) {
          owns = true;
          break;
        }
      }

      if (!owns) {
        throw new Error("You do not own this position tokenId; cannot collect fees.");
      }
    } catch (e: any) {
      // If enumerable lookup fails, continue; some deployments may not support enumeration fully
      console.warn("collectFeesFromPosition: ownership check failed or unsupported", e?.message);
    }

    // Fetch detailed position info to construct SDK Position
    const details = await getPositionDetails(client, chainId, tokenId);
    if (!details) throw new Error("Position details not found");

    // Optionally log fee growth state to correlate expected fees
    try {
      const token0Info = await fetchTokenInfo(client, details.token0.address);
      const token1Info = await fetchTokenInfo(client, details.token1.address);
      const token0 = new Token(chainId, details.token0.address, token0Info.decimals, token0Info.symbol, token0Info.name);
      const token1 = new Token(chainId, details.token1.address, token1Info.decimals, token1Info.symbol, token1Info.name);

      const { pool } = await getPool(
        client,
        chainId,
        details.poolKey.fee,
        details.poolKey.tickSpacing,
        details.poolKey.hooks as Address,
        token0,
        token1
      );
      if (!pool) throw new Error("Pool not found for position");

      // Pre-collect diagnostics: fee growth and stored position info
      try {
        const addresses = getUniswapV4Addresses(chainId);
        const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
        const currency0 = token0IsA ? token0 : token1;
        const currency1 = token0IsA ? token1 : token0;
        const poolId = Pool.getPoolId(currency0, currency1, details.poolKey.fee, details.poolKey.tickSpacing, details.poolKey.hooks);
        const salt = `0x${tokenId.toString(16).padStart(64, "0")}`;

        const [stored, current] = await Promise.all([
          client.readContract({
            address: addresses.stateView as Address,
            abi: STATE_VIEW_ABI,
            functionName: "getPositionInfo",
            args: [poolId, addresses.positionManager as Address, details.tickLower, details.tickUpper, salt],
          }) as Promise<[bigint, bigint, bigint]>,
          client.readContract({
            address: addresses.stateView as Address,
            abi: STATE_VIEW_ABI,
            functionName: "getFeeGrowthInside",
            args: [poolId, details.tickLower, details.tickUpper],
          }) as Promise<[bigint, bigint]>,
        ]);
        const [liquidityStored, fee0Last, fee1Last] = stored;
        const [fee0X128, fee1X128] = current;
        const Q128 = 2n ** 128n;
        const delta0 = fee0X128 >= fee0Last ? fee0X128 - fee0Last : 0n;
        const delta1 = fee1X128 >= fee1Last ? fee1X128 - fee1Last : 0n;
        const raw0 = (delta0 * liquidityStored) / Q128;
        const raw1 = (delta1 * liquidityStored) / Q128;
        console.debug("pre-collect diagnostics:", {
          poolId,
          tickLower: details.tickLower,
          tickUpper: details.tickUpper,
          liquidityStored: liquidityStored.toString(),
          feeGrowthInside0LastX128: fee0Last.toString(),
          feeGrowthInside1LastX128: fee1Last.toString(),
          feeGrowthInside0X128: fee0X128.toString(),
          feeGrowthInside1X128: fee1X128.toString(),
          delta0: delta0.toString(),
          delta1: delta1.toString(),
          expectedRaw0: raw0.toString(),
          expectedRaw1: raw1.toString(),
        });
      } catch (diagErr: any) {
        console.warn("pre-collect diagnostics failed:", diagErr?.message || String(diagErr));
      }

      // Construct Position via SDK (full liquidity)
      const sdkPosition = new Position({
        pool,
        tickLower: details.tickLower,
        tickUpper: details.tickUpper,
        liquidity: details.liquidity.toString(),
      });

      // Build collect options per Uniswap v4 guide
      const collectOptions = {
        tokenId: tokenId.toString(),
        recipient: (recipient ?? account) as Address,
        slippageTolerance: new Percent(50, 10_000), // 0.5%
        deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes
        hookData: "0x",
      } as const;

      const { calldata, value } = V4PositionManager.collectCallParameters(sdkPosition, collectOptions);
      console.debug("collectCallParameters:", { calldata, value });

      // Simulate multicall to catch and surface revert reasons before sending
      let simulation;
      try {
        simulation = await client.simulateContract({
          account,
          address: addresses.positionManager as Address,
          abi: POSITION_MANAGER_ABI,
          functionName: "multicall",
          args: [[calldata as `0x${string}`]],
          value: BigInt(value),
        });
        console.debug("multicall(simulate) OK:", {
          request: simulation?.request,
          tokenId: tokenId.toString(),
          recipient: collectOptions.recipient,
          slippageBps: 50,
          deadline: collectOptions.deadline,
        });
      } catch (err) {
        if (err instanceof BaseError) {
          const revertError = err.walk((e) => e instanceof ContractFunctionRevertedError);
          if (revertError instanceof ContractFunctionRevertedError) {
            console.error("multicall(simulate) reverted:", {
              errorName: revertError.data?.errorName,
              decodedArgs: revertError.data?.args,
              abiItem: revertError.data?.abiItem,
            });
          }
        }
        console.error("multicall(simulate) error:", (err as any)?.shortMessage || (err as any)?.message || String(err));
        throw err;
      }

  const txHash = await walletClient.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  console.debug("✅ Collect fees success:", txHash);
  console.groupEnd();
  return { txHash, receipt };
    } catch (inner) {
      throw inner;
    }
  } catch (error) {
    // Improve error reporting to help diagnose common failures
    const msg = (error as any)?.shortMessage || (error as any)?.message || String(error);
    console.error("❌ Error in collectFeesFromPosition:", msg);
    console.groupEnd();
    throw error;
  }
}

/**
 * Verify collected fees by decoding ERC20 Transfer logs in the receipt.
 * Sums amounts transferred to recipient for token0 and token1.
 */
export async function verifyFeeCollection(
  client: any,
  chainId: number,
  txHash: `0x${string}`,
  recipient: Address,
  token0Address: Address,
  token1Address: Address
): Promise<{
  token0: { address: Address; symbol: string; amount: string };
  token1: { address: Address; symbol: string; amount: string };
}> {
  try {
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // keccak256("Transfer(address,address,uint256)")

    let amt0 = 0n;
    let amt1 = 0n;

    for (const log of receipt.logs || []) {
      if (!log || !log.topics || log.topics.length < 3) continue;
      const isToken0 = log.address.toLowerCase() === token0Address.toLowerCase();
      const isToken1 = log.address.toLowerCase() === token1Address.toLowerCase();
      if (!isToken0 && !isToken1) continue;
      if (log.topics[0].toLowerCase() !== transferTopic) continue;
      // topics[2] = indexed to address (padded)
      const toTopic = log.topics[2].toLowerCase();
      const padRecipient = `0x${recipient.toLowerCase().replace("0x", "").padStart(64, "0")}`;
      if (toTopic !== padRecipient) continue;
      // data: uint256 value
      const value = BigInt(log.data as `0x${string}`);
      if (isToken0) amt0 += value;
      if (isToken1) amt1 += value;
    }

    // Format with decimals
    const [t0, t1] = await Promise.all([
      fetchTokenInfo(client, token0Address),
      fetchTokenInfo(client, token1Address),
    ]);
    const token0 = new Token(chainId, token0Address, t0.decimals, t0.symbol, t0.name);
    const token1 = new Token(chainId, token1Address, t1.decimals, t1.symbol, t1.name);

    const amount0 = CurrencyAmount.fromRawAmount(token0, amt0.toString()).toSignificant(6);
    const amount1 = CurrencyAmount.fromRawAmount(token1, amt1.toString()).toSignificant(6);

    return {
      token0: { address: token0Address, symbol: token0.symbol ?? t0.symbol, amount: amount0 },
      token1: { address: token1Address, symbol: token1.symbol ?? t1.symbol, amount: amount1 },
    };
  } catch (error) {
    console.warn("verifyFeeCollection failed:", (error as any)?.message || String(error));
    // Fallback to zeros
    return {
      token0: { address: token0Address, symbol: "", amount: "0" },
      token1: { address: token1Address, symbol: "", amount: "0" },
    };
  }
}
