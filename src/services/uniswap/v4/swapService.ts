import { Address, decodeErrorResult } from "viem";
import { Token } from "@uniswap/sdk-core";
import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { encodeAbiParameters } from "viem";
import { getUniswapV4Addresses, ERC20_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from "@/config/uniswapV4";
import { ZERO_ADDRESS, fetchTokenInfo, isNativeETH } from "./helpers";
import { getPool } from "./poolService";
import { quoteExactInputSingle, estimateExactInput } from "./quoteService";

interface SwapParams {
  publicClient: any;
  walletClient: any;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountInHuman: number; // human units
  tickSpacing: number;
  fee?: number; // optional override
  slippageBps?: number; // optional, default 100 (1%)
  account?: Address; // optional, prefer explicit account from dApp
  hooks?: Address; // optional hook address for poolKey
}

export async function swapExactInSingle(params: SwapParams) {
  console.groupCollapsed("🔎 V4Swap/swapExactInSingle");
  console.debug("params:", params);

  const { publicClient, walletClient, chainId, tokenIn, tokenOut, amountInHuman, tickSpacing, fee, slippageBps = 100 } = params;
  if (!publicClient || !walletClient) throw new Error("Missing clients");

  const addresses = getUniswapV4Addresses(chainId);
  if (!addresses?.universalRouter) throw new Error("Universal Router not configured for chain");

  const [tokenInInfo, tokenOutInfo] = await Promise.all([
    fetchTokenInfo(publicClient, tokenIn),
    fetchTokenInfo(publicClient, tokenOut),
  ]);

  const tokenA = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const tokenB = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);

  const token0IsA = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const currency0 = token0IsA ? tokenA : tokenB;
  const currency1 = token0IsA ? tokenB : tokenA;
  const zeroForOne = tokenA.address.toLowerCase() === currency0.address.toLowerCase();

  const inputCurrency = zeroForOne ? currency0.address : currency1.address;
  const outputCurrency = zeroForOne ? currency1.address : currency0.address;

  const amountInWei = BigInt(Math.round(amountInHuman * Math.pow(10, tokenA.decimals)));
  if (amountInWei <= 0n) {
    console.warn("swapExactInSingle: amountInWei computed as 0; aborting swap");
    console.groupEnd();
    throw new Error("Amount too small to swap");
  }
  const hooks = (params.hooks ?? ZERO_ADDRESS) as Address;
  console.groupCollapsed("🔎 V4Swap/swapExactInSingle");
  console.debug("chainId:", chainId);
  console.debug("addresses:", addresses);
  console.debug("tokenA:", tokenA.address, tokenA.symbol, tokenA.decimals);
  console.debug("tokenB:", tokenB.address, tokenB.symbol, tokenB.decimals);
  console.debug("token0IsA:", token0IsA, "zeroForOne:", zeroForOne);
  console.debug("inputCurrency:", inputCurrency, "outputCurrency:", outputCurrency);
  console.debug("amountIn(human):", amountInHuman, "amountInWei:", amountInWei.toString());
  // Resolve poolKey by probing tickSpacing candidates if needed to avoid swap reverts on non-existent pools
  const TICK_TO_FEE: Record<number, number> = { 10: 500, 60: 3000, 200: 10000 };
  const tickCandidates = Array.from(new Set([tickSpacing, 60, 10, 200].filter((t) => typeof t === "number"))) as number[];
  const feeCandidates = Array.from(new Set([fee, 500, 3000, 10000].filter((f) => typeof f === "number"))) as number[];
  let resolvedTick = tickCandidates[0] as number;
  let resolvedFee = (fee ?? TICK_TO_FEE[resolvedTick] ?? 3000) as number;
  try {
    const check = await getPool(publicClient, chainId, resolvedFee, resolvedTick, hooks, currency0, currency1);
    if (!check?.pool || !check?.liquidity || BigInt(check.liquidity) === 0n) {
      let found = false;
      for (const t of tickCandidates) {
        for (const f of feeCandidates) {
          const alt = await getPool(publicClient, chainId, f, t, hooks, currency0, currency1);
          if (alt?.pool && alt?.liquidity && BigInt(alt.liquidity) > 0n) {
            resolvedTick = t;
            resolvedFee = f;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  } catch (e) {
    // If pool state view fails, continue with provided params
    console.warn("pool state view failed, proceeding with provided tick/fee:", e);
  }
  // Final check: if still no pool/liquidity, fail early to avoid router revert
  try {
    const finalPool = await getPool(publicClient, chainId, resolvedFee, resolvedTick, hooks, currency0, currency1);
    if (!finalPool?.pool || !finalPool?.liquidity || BigInt(finalPool.liquidity) === 0n) {
      console.warn("swapExactInSingle: ❌ no pool/liquidity for chosen tick/fee; aborting swap");
      console.groupEnd();
      throw new Error("No liquid pool available for selected pair");
    }
  } catch (e) {
    console.warn("swapExactInSingle: pool final check failed; aborting", e);
    console.groupEnd();
    throw new Error("Pool state unavailable");
  }
  const poolKey = { currency0: currency0.address as Address, currency1: currency1.address as Address, fee: resolvedFee, tickSpacing: resolvedTick, hooks };
  console.debug("resolvedTick:", resolvedTick, "resolvedFee:", resolvedFee);
  console.debug("poolKey:", poolKey);

  // Compute amountOutMinimum from quote and user-selected slippage
  let amountOutMinimum = "0";
  try {
    const fromQuoter = await quoteExactInputSingle({
      client: publicClient,
      chainId,
      tokenIn,
      tokenOut,
      amount: amountInHuman,
      tickSpacing: resolvedTick,
      fee: resolvedFee,
      hooks,
    });
    if (fromQuoter?.amountOut && fromQuoter.rate && fromQuoter.rate > 0) {
      const slipMult = 1 - (slippageBps ?? 100) / 10_000;
      const minOutHuman = Math.max(0, fromQuoter.amountOut * slipMult);
      const minOutWei = BigInt(Math.floor(minOutHuman * Math.pow(10, tokenOutInfo.decimals)));
      amountOutMinimum = minOutWei.toString();
    } else {
      // If Quoter fails, avoid over-constraining with spot-price estimate; set min to 0
      console.warn("swapExactInSingle: Quoter unavailable; using amountOutMinimum = 0 to avoid revert");
    }
  } catch {}

  // Approvals via Permit2 if ERC20 input
  let payer: Address | undefined = params.account;
  if (!payer) {
    try {
      const addrs = await walletClient.getAddresses?.();
      payer = (addrs && addrs[0]) as Address;
    } catch (e) {
      // ignore and rely on explicit account fallback
    }
  }
  if (!payer) throw new Error("No connected account");
  const isNativeInput = isNativeETH(inputCurrency as `0x${string}`);
  console.debug("payer:", payer, "isNativeInput:", isNativeInput);

  if (!isNativeInput) {
    // Read ERC20 allowance to Permit2 and Permit2 allowance to Router concurrently
    const [allowanceErc20, routerAllowanceRaw] = await Promise.all([
      publicClient.readContract({ address: inputCurrency as Address, abi: ERC20_ABI, functionName: "allowance", args: [payer, addresses.permit2 as Address] }),
      publicClient.readContract({ address: addresses.permit2 as Address, abi: PERMIT2_ABI, functionName: "allowance", args: [payer, inputCurrency as Address, addresses.universalRouter as Address] }) as any,
    ]);
    const [routerAllowance] = routerAllowanceRaw as any;

    console.debug("ERC20 allowance (payer -> Permit2):", (allowanceErc20 as bigint).toString());
    if ((allowanceErc20 as bigint) < amountInWei) {
      console.log("🔑 Approving ERC20 -> Permit2...");
      await walletClient.writeContract({ account: payer, address: inputCurrency as Address, abi: ERC20_ABI, functionName: "approve", args: [addresses.permit2 as Address, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")] });
      console.log("✅ ERC20 approved");
    }

    console.debug("Permit2 allowance (payer -> Router):", BigInt(routerAllowance).toString());
    if (BigInt(routerAllowance) < amountInWei) {
      const expiration = Math.floor(Date.now() / 1000) + 60 * 60; // 1 year
      console.log("🔑 Approving Permit2 -> Universal Router...");
      await walletClient.writeContract({ account: payer, address: addresses.permit2 as Address, abi: PERMIT2_ABI, functionName: "approve", args: [inputCurrency as Address, addresses.universalRouter as Address, BigInt("0xffffffffffffffffffffffffffffffffffffffff"), expiration] });
      console.log("✅ Permit2 approved");
    }
  }

  // Build V4Planner actions
  const swapConfig: SwapExactInSingle = { poolKey, zeroForOne, amountIn: amountInWei.toString(), amountOutMinimum, hookData: "0x" };
  const v4Planner = new V4Planner();
  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
  v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, amountInWei.toString()]);
  v4Planner.addAction(Actions.TAKE_ALL, [outputCurrency, '0']);
  const encodedActions = v4Planner.finalize() as `0x${string}`;
  console.debug("amountOutMinimum(wei):", amountOutMinimum);
  console.debug("swapConfig:", swapConfig);
  console.debug("encodedActions length:", encodedActions.length, "encodedActions head:", encodedActions.slice(0, 66));

  // Build RoutePlanner commands + inputs
  // Build Universal Router commands and inputs manually to avoid JSBI import issues
  // Opcodes: 0x02 = PERMIT2_TRANSFER_FROM, 0x10 = V4_SWAP
  let commands = "0x" as `0x${string}`;
  const inputs: `0x${string}`[] = [];

  // Do NOT pre-transfer via PERMIT2_TRANSFER_FROM.
  // V4_SWAP + SETTLE_ALL will pull from the sender (payer) via Permit2.

  commands = (commands + "10") as `0x${string}`; // V4_SWAP
  inputs.push(encodedActions);
  console.debug("commands:", commands);
  console.debug("inputs count:", inputs.length);
  inputs.forEach((inp, i) => console.debug(`inputs[${i}] length:`, inp.length, "head:", inp.slice(0, 66)));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
  const txValue = isNativeInput ? amountInWei : 0n;

  // Simulate & send
  try {
    const { request } = await publicClient.simulateContract({
      account: payer,
      address: addresses.universalRouter as Address,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [commands, inputs, deadline],
      value: txValue,
    });
    console.debug("simulate request:", { account: (request as any).account, gas: (request as any).gas?.toString?.(), value: (request as any).value?.toString?.() });
    const hash = await walletClient.writeContract({ ...request, account: payer });
    console.debug("tx hash:", hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.groupEnd();
    return receipt;
  } catch (err: any) {
    console.error("❌ Router execute failed:", err?.shortMessage || err?.message || err);
    const data: string | undefined = err?.data || err?.cause?.data;
    let userMessage = "Swap failed";
    if (data && typeof data === "string" && data.startsWith("0x")) {
      try {
        const decoded = decodeErrorResult({ abi: UNIVERSAL_ROUTER_ABI as any, data: data as `0x${string}` });
        console.error("🧩 Decoded router error:", decoded.errorName, decoded.args);
        // Build user-friendly message from decoded router error
        if (decoded?.errorName) {
          const cmdIndex = decoded?.args?.[0]?.toString?.();
          userMessage = cmdIndex !== undefined
            ? `Router error: ${decoded.errorName} (command ${cmdIndex})`
            : `Router error: ${decoded.errorName}`;
        }

        // If the router wrapped an inner failure, attempt to decode the nested message too
        if (decoded.errorName === "ExecutionFailed" && decoded.args?.[1]) {
          const innerData = decoded.args[1] as `0x${string}`;
          if (typeof innerData === "string" && innerData.startsWith("0x")) {
            try {
              const innerDecoded = decodeErrorResult({ abi: UNIVERSAL_ROUTER_ABI as any, data: innerData });
              console.error("🧩 Inner error:", innerDecoded.errorName, innerDecoded.args);
              if (innerDecoded?.errorName) {
                userMessage = `${userMessage}; Inner: ${innerDecoded.errorName}`;
              }
            } catch (innerErr) {
              console.error("🧩 Inner revert signature:", innerData.slice(0, 10));
              userMessage = `${userMessage}; Inner signature: ${innerData.slice(0, 10)}`;
            }
          }
        }
      } catch (e) {
        console.error("🧩 Failed to decode revert bytes; signature:", data.slice(0, 10));
        userMessage = `Router reverted with signature ${data.slice(0, 10)} (unknown in ABI)`;
      }
    }
    console.groupEnd();
    // Throw a concise, user-facing message so UI can display meaningful errors
    const wrapped = Object.assign(new Error(userMessage), { cause: err });
    throw wrapped;
  }
}