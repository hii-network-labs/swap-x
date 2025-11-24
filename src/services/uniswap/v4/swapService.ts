import { Address, decodeErrorResult, keccak256 } from "viem";
import { Token } from "@uniswap/sdk-core";
import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { encodeAbiParameters } from "viem";
import { getUniswapV4Addresses, ERC20_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from "@/config/uniswapV4";
import { ZERO_ADDRESS, fetchTokenInfo, isNativeETH } from "./helpers";
import { getPool } from "./poolService";
import { quoteExactInputSingle, estimateExactInput } from "./quoteService";
import { BigNumber } from "ethers";
// removed unused imports to avoid Vite resolution errors

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
  // If input is native, estimate fees and adjust amount to use near-full balance
  let finalAmountWei = amountInWei;
  if (isNativeInput) {
    try {
      const balance = await publicClient.getBalance({ address: payer });
      // First simulation with user-entered amount to get gas estimate
      const { request: simReq1 } = await publicClient.simulateContract({
        account: payer,
        address: addresses.universalRouter as Address,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [commands, inputs, deadline],
        value: amountInWei,
      });
      const gas1 = (simReq1 as any).gas as bigint | undefined;
      const maxFeePerGas = ((simReq1 as any).maxFeePerGas as bigint | undefined) ?? undefined;
      const gasPrice = maxFeePerGas ?? (await publicClient.getGasPrice());
      const feeEstimate = gas1 ? gas1 * gasPrice : 0n;
      // Add 15% safety buffer
      const feeWithBuffer = feeEstimate + (feeEstimate * 15n) / 100n;
      const available = balance > feeWithBuffer ? balance - feeWithBuffer : 0n;
      if (available <= 0n) {
        console.groupEnd();
        throw Object.assign(new Error("Số dư native không đủ để trả phí gas"), { cause: new Error("Insufficient native for gas") });
      }
      finalAmountWei = available < amountInWei ? available : amountInWei;
      // Recompute minOut for reduced amount
      if (finalAmountWei !== amountInWei) {
        try {
          const fromQuoter2 = await quoteExactInputSingle({
            client: publicClient,
            chainId,
            tokenIn,
            tokenOut,
            amount: Number(finalAmountWei) / Math.pow(10, tokenA.decimals),
            tickSpacing: resolvedTick,
            fee: resolvedFee,
            hooks,
          });
          if (fromQuoter2?.amountOut && fromQuoter2.rate && fromQuoter2.rate > 0) {
            const slipMult = 1 - (slippageBps ?? 100) / 10_000;
            const minOutHuman2 = Math.max(0, fromQuoter2.amountOut * slipMult);
            const minOutWei2 = BigInt(Math.floor(minOutHuman2 * Math.pow(10, tokenOutInfo.decimals)));
            amountOutMinimum = minOutWei2.toString();
          } else {
            amountOutMinimum = "0";
          }
        } catch {}
      }
      // Rebuild actions with adjusted amount
      const swapCfg2: SwapExactInSingle = { poolKey, zeroForOne, amountIn: finalAmountWei.toString(), amountOutMinimum, hookData: "0x" };
      const planner2 = new V4Planner();
      planner2.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapCfg2]);
      planner2.addAction(Actions.SETTLE_ALL, [inputCurrency, finalAmountWei.toString()]);
      planner2.addAction(Actions.TAKE_ALL, [outputCurrency, '0']);
      const encoded2 = planner2.finalize() as `0x${string}`;
      commands = ("0x" + "10") as `0x${string}`;
      inputs.splice(0, inputs.length, encoded2);
    } catch (e) {
      console.warn("native fee estimation failed; proceeding with entered amount", e);
    }
  }

  const txValue = isNativeInput ? finalAmountWei : 0n;

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

interface LimitOrderParams {
  publicClient: any;
  walletClient: any;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountInHuman: number;
  desiredPrice: number;
  tickSpacing: number;
  fee?: number;
  recipient?: Address;
  hooks?: Address;
  ttlSeconds?: number;
  account?: Address;
}

export async function createLimitOrder(params: LimitOrderParams) {
  const { publicClient, walletClient, chainId, tokenIn, tokenOut, amountInHuman, desiredPrice, tickSpacing, fee, recipient, hooks = ZERO_ADDRESS as Address, ttlSeconds = 3600 } = params;
  if (!publicClient || !walletClient) {
    console.log("Step 0: Missing clients", { publicClient: !!publicClient, walletClient: !!walletClient });
    throw new Error("Missing clients");
  }
  const addresses = getUniswapV4Addresses(chainId);
  if (!addresses?.universalRouter) {
    console.log("Step 0: Universal Router not configured", { chainId, addresses });
    throw new Error("Universal Router not configured for chain");
  }
  console.group("🟦 Service/LimitOrder/createLimitOrder");
  console.log("Step 0: Input params", { chainId, tokenIn, tokenOut, amountInHuman, desiredPrice, tickSpacing, fee, recipient, hooks, ttlSeconds });

  console.log("Step 1: Fetch token info/start");
  let tokenInInfo, tokenOutInfo;
  try {
    [tokenInInfo, tokenOutInfo] = await Promise.all([
      fetchTokenInfo(publicClient, tokenIn),
      fetchTokenInfo(publicClient, tokenOut),
    ]);
    console.log("Step 1: Fetch token info/success", { tokenInInfo, tokenOutInfo });
  } catch (e) {
    console.log("Step 1: Fetch token info/failed", e);
    console.groupEnd();
    throw e;
  }
  console.log("Step 2: Construct token objects/start");
  const tokenA = new Token(chainId, tokenIn, tokenInInfo.decimals, tokenInInfo.symbol, tokenInInfo.name);
  const tokenB = new Token(chainId, tokenOut, tokenOutInfo.decimals, tokenOutInfo.symbol, tokenOutInfo.name);
  const token0IsA = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const currency0 = token0IsA ? tokenA : tokenB;
  const currency1 = token0IsA ? tokenB : tokenA;
  const zeroForOne = tokenA.address.toLowerCase() === currency0.address.toLowerCase();
  console.log("Step 2: Construct token objects/success", { tokenA: tokenA.address, tokenB: tokenB.address, token0IsA, zeroForOne });

  console.log("Step 3: Resolve directions/start");
  const inputCurrency = zeroForOne ? currency0.address : currency1.address;
  const outputCurrency = zeroForOne ? currency1.address : currency0.address;
  console.log("Step 3: Resolve directions/success", { inputCurrency, outputCurrency });
  console.log("Step 4: Compute amountInWei/start");
  const amountInWei = BigInt(Math.round(amountInHuman * Math.pow(10, tokenA.decimals)));
  if (amountInWei <= 0n) {
    console.log("Step 4: Compute amountInWei/failed", { amountInHuman, decimals: tokenA.decimals });
    console.groupEnd();
    throw new Error("Amount too small");
  }
  console.log("Step 4: Compute amountInWei/success", { amountInWei: amountInWei.toString() });

  console.log("Step 5: Resolve payer/start");
  let payer: Address | undefined = params.account;
  if (!payer) {
    try {
      const addrs = await walletClient.getAddresses?.();
      payer = (addrs && addrs[0]) as Address;
      console.log("Step 5: Resolve payer/success", { payer });
    } catch (e) {
      console.log("Step 5: Resolve payer/failed", e);
    }
  }
  if (!payer) {
    console.groupEnd();
    throw new Error("No connected account");
  }

  const isNativeInput = isNativeETH(inputCurrency as `0x${string}`);
  console.log("Step 6: Allowance checks/start", { isNativeInput });
  if (!isNativeInput) {
    try {
      const [allowanceErc20, routerAllowanceRaw] = await Promise.all([
        publicClient.readContract({ address: inputCurrency as Address, abi: ERC20_ABI, functionName: "allowance", args: [payer, addresses.permit2 as Address] }),
        publicClient.readContract({ address: addresses.permit2 as Address, abi: PERMIT2_ABI, functionName: "allowance", args: [payer, inputCurrency as Address, addresses.universalRouter as Address] }) as any,
      ]);
      const [routerAllowance] = routerAllowanceRaw as any;
      console.log("Step 6: Allowance checks/read", { erc20: (allowanceErc20 as bigint).toString(), permit2: BigInt(routerAllowance).toString() });
      if ((allowanceErc20 as bigint) < amountInWei) {
        console.log("Step 6: Approve ERC20 -> Permit2/start");
        await walletClient.writeContract({ account: payer, address: inputCurrency as Address, abi: ERC20_ABI, functionName: "approve", args: [addresses.permit2 as Address, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")] });
        console.log("Step 6: Approve ERC20 -> Permit2/success");
      }
      if (BigInt(routerAllowance) < amountInWei) {
        const expiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
        console.log("Step 6: Approve Permit2 -> Router/start");
        await walletClient.writeContract({ account: payer, address: addresses.permit2 as Address, abi: PERMIT2_ABI, functionName: "approve", args: [inputCurrency as Address, addresses.universalRouter as Address, BigInt("0xffffffffffffffffffffffffffffffffffffffff"), expiration] });
        console.log("Step 6: Approve Permit2 -> Router/success");
      }
      console.log("Step 6: Allowance checks/success");
    } catch (e) {
      console.log("Step 6: Allowance checks/failed", e);
      console.groupEnd();
      throw e;
    }
  } else {
    console.log("Step 6: Skipped (native input)");
  }

  console.log("Step 7: Resolve poolKey/start");
  const TICK_TO_FEE: Record<number, number> = { 10: 500, 60: 3000, 200: 10000 };
  const resolvedTick = tickSpacing;
  const resolvedFee = (fee ?? TICK_TO_FEE[resolvedTick] ?? 3000) as number;
  const poolKey = { currency0: currency0.address as Address, currency1: currency1.address as Address, fee: resolvedFee, tickSpacing: resolvedTick, hooks };
  console.log("Step 7: Resolve poolKey/success", { poolKey });

  console.log("Step 8: Compute amountOutMinimum/start");
  const desiredOutHuman = amountInHuman * desiredPrice;
  const amountOutMinimum = BigInt(Math.floor(desiredOutHuman * Math.pow(10, tokenB.decimals))).toString();
  console.log("Step 8: Compute amountOutMinimum/success", { desiredOutHuman, amountOutMinimum });

  console.log("Step 9: Build V4 actions/start");
  const swapConfig: SwapExactInSingle = { poolKey, zeroForOne, amountIn: amountInWei.toString(), amountOutMinimum, hookData: "0x" };
  const v4Planner = new V4Planner();
  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
  v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, amountInWei.toString()]);
  v4Planner.addAction(Actions.TAKE, [outputCurrency, recipient ?? payer, "0"]);
  const encodedActions = v4Planner.finalize() as `0x${string}`;
  console.log("Step 9: Build V4 actions/success", { encodedActionsLen: encodedActions.length, head: encodedActions.slice(0, 66) });

  console.log("Step 10: Build UR commands/start");
  let commands = "0x" as `0x${string}`;
  const inputs: `0x${string}`[] = [];
  commands = (commands + "10") as `0x${string}`;
  inputs.push(encodedActions);
  console.log("Step 10: Build UR commands/success", { commands, inputsCount: inputs.length });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);

  // Build RelayOrder using SDK
  console.log("Step 11: Build RelayOrder with SDK/start");
  
  // Build RelayOrder (manual) and sign EIP-712
  console.log("Step 11: Construct RelayOrder/start");
  const RELAY_ORDER_REACTOR = (addresses as any).relayOrderReactor || (addresses.universalRouter as Address);
  const FILLER_FEE_BPS = 200; // 2%
  const now = BigInt(Math.floor(Date.now() / 1000));
  const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
  const fillerFeeAmount = (amountInWei * BigInt(FILLER_FEE_BPS)) / 10_000n;
  const nonce = now * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));

  const relayOrder = {
    reactor: RELAY_ORDER_REACTOR,
    swapper: payer,
    nonce,
    deadline: deadlineTs,
    input: {
      token: inputCurrency as Address,
      amount: amountInWei,
      recipient: addresses.universalRouter as Address,
    },
    fee: {
      token: inputCurrency as Address,
      startAmount: fillerFeeAmount,
      endAmount: fillerFeeAmount,
      startTime: now,
      endTime: deadlineTs,
    },
    universalRouterCalldata: encodedActions as `0x${string}`,
  } as const;
  console.log("Step 11: Construct RelayOrder/success", {
    reactor: relayOrder.reactor,
    swapper: relayOrder.swapper,
    nonce: relayOrder.nonce.toString(),
    deadline: relayOrder.deadline.toString(),
    inputAmount: relayOrder.input.amount.toString(),
    feeStart: relayOrder.fee.startAmount.toString(),
  });

  console.log("Step 12: Sign RelayOrder/start");
  const domain = { name: "RelayOrder", chainId, verifyingContract: relayOrder.reactor } as const;
  const types = {
    Input: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    Fee: [
      { name: "token", type: "address" },
      { name: "startAmount", type: "uint256" },
      { name: "endAmount", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
    ],
    RelayOrder: [
      { name: "reactor", type: "address" },
      { name: "swapper", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "input", type: "Input" },
      { name: "fee", type: "Fee" },
      { name: "universalRouterCalldata", type: "bytes" },
    ],
  } as const;
  const message = {
    reactor: relayOrder.reactor,
    swapper: relayOrder.swapper,
    nonce: relayOrder.nonce,
    deadline: relayOrder.deadline,
    input: relayOrder.input,
    fee: relayOrder.fee,
    universalRouterCalldata: relayOrder.universalRouterCalldata,
  } as const;
  let signature: `0x${string}` | undefined;
  try {
    signature = await walletClient.signTypedData?.({ account: payer, domain, types, primaryType: "RelayOrder", message });
    console.log("Step 12: Sign RelayOrder/success", { signatureLen: signature?.length });
  } catch (sigErr) {
    console.log("Step 12: Sign RelayOrder/failed", sigErr);
    console.groupEnd();
    throw sigErr;
  }

  console.log("Step 13: Submit RelayOrder/start");
  const orderPayload = {
    reactor: message.reactor,
    swapper: message.swapper,
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    input: { token: message.input.token, amount: message.input.amount.toString(), recipient: message.input.recipient },
    fee: { token: message.fee.token, startAmount: message.fee.startAmount.toString(), endAmount: message.fee.endAmount.toString(), startTime: message.fee.startTime.toString(), endTime: message.fee.endTime.toString() },
    universalRouterCalldata: message.universalRouterCalldata,
  };
  try {
    const resp = await fetch("http://localhost:3000/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: orderPayload, signature }) });
    console.log("Step 13: Response status", resp.status);
    if (!resp.ok) {
      let msg = `Order submit failed (${resp.status})`;
      try {
        const data = await resp.json();
        console.log("Step 13: Error body", data);
        msg = (data?.message as string) || msg;
      } catch {}
      throw new Error(msg);
    }
    const ok = await resp.json();
    console.log("Step 13: Success body", ok);
    console.groupEnd();
    return { order: orderPayload, signature };
  } catch (e) {
    console.log("Step 13: Submit RelayOrder/failed", e);
    console.groupEnd();
    throw e instanceof Error ? e : new Error(String(e));
  }
}
