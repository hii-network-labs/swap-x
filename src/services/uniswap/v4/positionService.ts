import { Address } from "viem";
import { Token, Percent, Ether } from "@uniswap/sdk-core";
import { nearestUsableTick, TickMath } from "@uniswap/v3-sdk";
import { Position, MintOptions, V4PositionManager, PermitDetails } from "@uniswap/v4-sdk";
import {
  getUniswapV4Addresses,
  POSITION_MANAGER_ABI,
  PERMIT2_ABI,
  PERMIT2_TYPES,
  ERC20_ABI,
} from "@/config/uniswapV4";
import { getPool } from "./poolService";
import { ZERO_ADDRESS, isNativeETH } from "./helpers";

const AMOUNT_MAX = 2n ** 256n - 1n;

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

    // Create position
    const position = Position.fromAmounts({
      pool,
      tickLower,
      tickUpper,
      amount0: amount0Desired,
      amount1: amount1Desired,
      useFullPrecision: true,
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
        mintOptions.batchPermit = batchPermit;
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

    const account = walletClient.account;
    if (!account) throw new Error("No account found");

    const signature = await walletClient.signTypedData({
      account,
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
