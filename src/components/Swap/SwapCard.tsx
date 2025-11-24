import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { TokenSelector, Token } from "./TokenSelector";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { SlippageSettings } from "./SlippageSettings";
import { SwapConfirmDialog } from "./SwapConfirmDialog";
import { toast } from "sonner";
import { TxStatusDialog } from "@/components/ui/TxStatusDialog";
import { useQuery } from "@tanstack/react-query";
import { saveTransaction } from "@/types/transaction";
import { useV4Provider } from "@/hooks/useV4Provider";
import { useNetwork } from "@/contexts/NetworkContext";
import { estimateExactInput, estimateExactOutput, quoteExactInputSingle, quoteExactOutputSingle } from "@/services/uniswap/v4/quoteService";
import { swapExactInSingle, createLimitOrder } from "@/services/uniswap/v4/swapService";
import { getTokenBalance, getNativeBalance } from "@/utils/erc20";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ZERO_ADDRESS } from "@/services/uniswap/v4/helpers";

interface TokenPrice {
  usd: number;
}

const fetchTokenPrices = async (tokenIds: string[]): Promise<Record<string, TokenPrice>> => {
  const ids = tokenIds.join(',');
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
  );
  if (!response.ok) throw new Error('Failed to fetch prices');
  return response.json();
};

interface SwapCardProps {
  onTokensChange?: (fromToken: Token | null, toToken: Token | null) => void;
  initialFromAddress?: string;
  initialToAddress?: string;
  selectedFromToken?: Token | null;
  selectedToToken?: Token | null;
  onSelectFromToken?: (token: Token) => void;
  onSelectToToken?: (token: Token) => void;
}

export const SwapCard = ({ onTokensChange, initialFromAddress, initialToAddress, selectedFromToken, selectedToToken, onSelectFromToken, onSelectToToken }: SwapCardProps) => {
  // Internal state (used only if controlled props are not provided)
  const [fromTokenState, setFromTokenState] = useState<Token | null>(null);
  const [toTokenState, setToTokenState] = useState<Token | null>(null);
  // Derived tokens based on controlled vs uncontrolled mode
  const fromToken = selectedFromToken ?? fromTokenState;
  const toToken = selectedToToken ?? toTokenState;
  const setFromToken = onSelectFromToken ?? setFromTokenState;
  const setToToken = onSelectToToken ?? setToTokenState;
  const { publicClient, walletClient } = useV4Provider();
  const { currentNetwork, walletAddress, balancesRefreshKey, setBalancesRefreshKey } = useNetwork();

  useEffect(() => {
    onTokensChange?.(fromToken, toToken);
  }, [fromToken, toToken, onTokensChange]);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isFromInput, setIsFromInput] = useState(true);
  const [mode, setMode] = useState<"swap" | "limit">("swap");
  const [desiredPrice, setDesiredPrice] = useState<string>("");
  const [limitTTL, setLimitTTL] = useState<number>(3600);
  const [onchainRate, setOnchainRate] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [slippage, setSlippage] = useState(0.5);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<"loading" | "success" | "error">("loading");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [fromBalance, setFromBalance] = useState<string | null>(null);
  const [toBalance, setToBalance] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [insufficientWarning, setInsufficientWarning] = useState<string | null>(null);
  const [activePercent, setActivePercent] = useState<number | null>(null);
  const [activeDesired, setActiveDesired] = useState<null | 'market' | 1 | 5 | 10>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  // Load pools to build token universe and adjacency mapping
  const { pools } = useSubgraphPools();
  const allTokens: Token[] = (() => {
    const map = new Map<string, Token>();
    for (const p of pools) {
      if (p.token0?.id && p.token0?.symbol) {
        const addr = p.token0.id.toLowerCase();
        const isHii = currentNetwork.chainId === 22469;
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const symbol = isZero && isHii ? "HNC" : p.token0.symbol;
        const name = isZero && isHii ? "HNC" : (p.token0.name || p.token0.symbol);
        if (!map.has(addr)) {
          map.set(addr, {
            symbol,
            name,
            logo: symbol.substring(0, 1),
            address: addr,
            coingeckoId: "",
          });
        }
      }
      if (p.token1?.id && p.token1?.symbol) {
        const addr = p.token1.id.toLowerCase();
        const isHii = currentNetwork.chainId === 22469;
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const symbol = isZero && isHii ? "HNC" : p.token1.symbol;
        const name = isZero && isHii ? "HNC" : (p.token1.name || p.token1.symbol);
        if (!map.has(addr)) {
          map.set(addr, {
            symbol,
            name,
            logo: symbol.substring(0, 1),
            address: addr,
            coingeckoId: "",
          });
        }
      }
    }
    // Bổ sung native HNC cho Hii nếu chưa có trong danh sách
    if (currentNetwork.chainId === 22469) {
      const zero = ZERO_ADDRESS.toLowerCase();
      if (!map.has(zero)) {
        map.set(zero, {
          symbol: "HNC",
          name: "HNC",
          logo: "H",
          address: zero,
          coingeckoId: "",
        });
      }
    }
    return Array.from(map.values());
  })();

  const adjacency: Record<string, Set<string>> = (() => {
    const adj: Record<string, Set<string>> = {};
    for (const p of pools) {
      const a = p.token0?.id?.toLowerCase();
      const b = p.token1?.id?.toLowerCase();
      const liq = parseFloat(p.liquidity || "0");
      // Chỉ thêm cặp vào adjacency nếu có thanh khoản > 0
      if (!a || !b || !(Number.isFinite(liq) && liq > 0)) continue;
      if (!adj[a]) adj[a] = new Set<string>();
      if (!adj[b]) adj[b] = new Set<string>();
      adj[a].add(b);
      adj[b].add(a);
    }
    return adj;
  })();

  const allowedToAddresses = fromToken ? Array.from(adjacency[fromToken.address?.toLowerCase()] || []) : [];

  // Candidate pools for current token pair (order-insensitive)
  const poolCandidates = pools
    .filter((p) => {
      const a = p.token0?.id?.toLowerCase();
      const b = p.token1?.id?.toLowerCase();
      const fromAddr = fromToken?.address?.toLowerCase();
      const toAddr = toToken?.address?.toLowerCase();
      if (!a || !b || !fromAddr || !toAddr) return false;
      return (a === fromAddr && b === toAddr) || (a === toAddr && b === fromAddr);
    })
    .map((p) => ({
      id: p.id,
      fee: p.feeTier ? parseInt(p.feeTier) : undefined,
      tickSpacing: parseInt(p.tickSpacing),
      hooks: (p.hooks ?? undefined) as `0x${string}` | undefined,
      liquidity: parseFloat(p.liquidity || "0"),
    }))
    .sort((a, b) => (b.liquidity - a.liquidity));

  // Chỉ giữ những pool có thanh khoản > 0 để cho phép chọn fee tier
  const liquidPools = poolCandidates.filter((c) => Number.isFinite(c.liquidity) && c.liquidity > 0);

  // Default select the highest-liquidity pool when tokens change
  useEffect(() => {
    if (liquidPools.length > 0) {
      setSelectedPoolId((prev) => {
        const exists = liquidPools.find((c) => c.id === prev);
        return exists ? prev : liquidPools[0].id;
      });
    } else {
      setSelectedPoolId(null);
    }
  }, [fromToken?.address, toToken?.address, pools.length]);

  // Fetch prices for selected tokens
  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['tokenPrices', fromToken?.coingeckoId, toToken?.coingeckoId],
    queryFn: () => {
      const ids = [fromToken?.coingeckoId, toToken?.coingeckoId].filter(Boolean);
      if (ids.length === 0) return {};
      return fetchTokenPrices(ids as string[]);
    },
    enabled: !!(fromToken && toToken),
    refetchInterval: 15000, // Refetch every 15 seconds
  });

  // Initialize tokens from provided addresses (if any)
  useEffect(() => {
    const addrToToken = (addr?: string | null): Token | null => {
      if (!addr) return null;
      const lower = addr.toLowerCase();
      return allTokens.find((t) => t.address?.toLowerCase() === lower) || null;
    };
    const initFrom = addrToToken(initialFromAddress);
    const initTo = addrToToken(initialToAddress);
    if (!selectedFromToken && initFrom && (!fromToken || fromToken.address.toLowerCase() !== initFrom.address.toLowerCase())) {
      setFromToken(initFrom);
    }
    if (!selectedToToken && initTo && (!toToken || toToken.address.toLowerCase() !== initTo.address.toLowerCase())) {
      setToToken(initTo);
    }
  }, [initialFromAddress, initialToAddress, allTokens, selectedFromToken, selectedToToken]);

  // Countdown timer for price refresh
  useEffect(() => {
    if (!fromToken || !toToken) return;
    
    setCountdown(15);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 15;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [prices, fromToken, toToken]);

  // Calculate exchange rate
  const exchangeRate = 
    onchainRate ?? (
      fromToken && toToken && prices?.[fromToken.coingeckoId]?.usd && prices?.[toToken.coingeckoId]?.usd
        ? prices[fromToken.coingeckoId].usd / prices[toToken.coingeckoId].usd
        : null
    );

  const baseRate = (() => {
    if (!exchangeRate || !(Number.isFinite(exchangeRate) && exchangeRate > 0)) return null;
    return exchangeRate;
  })();

  const fetchMarketRate = async (): Promise<number | null> => {
    const rateCandidate = Number(exchangeRate);
    if (Number.isFinite(rateCandidate) && rateCandidate > 0) return rateCandidate;
    if (!publicClient || !currentNetwork || !fromToken || !toToken) return null;
    const fromAddr = fromToken.address as `0x${string}`;
    const toAddr = toToken.address as `0x${string}`;
    const selected = selectedPoolId ? liquidPools.find((c) => c.id === selectedPoolId) : undefined;
    const tickSpacing = selected?.tickSpacing ?? liquidPools[0]?.tickSpacing ?? undefined;
    const feeTier = selected?.fee ?? liquidPools[0]?.fee ?? undefined;
    const hooks = selected?.hooks ?? liquidPools[0]?.hooks ?? undefined;
    try {
      const res = await quoteExactInputSingle({
        client: publicClient,
        chainId: currentNetwork.chainId,
        tokenIn: fromAddr,
        tokenOut: toAddr,
        amount: 1,
        tickSpacing,
        fee: feeTier,
        hooks,
      });
      if (res?.rate && res.rate > 0) return res.rate;
      const est = await estimateExactInput({
        client: publicClient,
        chainId: currentNetwork.chainId,
        tokenIn: fromAddr,
        tokenOut: toAddr,
        amount: 1,
        tickSpacing,
        fee: feeTier,
        hooks,
      });
      if (est?.rate && est.rate > 0) return est.rate;
    } catch (e) {
      console.warn(e);
    }
    try {
      const matches = pools
        .filter((p) => {
          const a0 = p.token0?.id?.toLowerCase();
          const a1 = p.token1?.id?.toLowerCase();
          return a0 && a1 && ((a0 === fromAddr.toLowerCase() && a1 === toAddr.toLowerCase()) || (a0 === toAddr.toLowerCase() && a1 === fromAddr.toLowerCase()));
        })
        .map((p) => ({
          p,
          liq: Number(p.liquidity || "0"),
        }))
        .sort((x, y) => y.liq - x.liq);
      const top = matches[0]?.p;
      if (top && top.tick != null) {
        const d0 = Number(top.token0?.decimals || "18");
        const d1 = Number(top.token1?.decimals || "18");
        const tick = Number(top.tick);
        const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1); // token1 per token0
        const a0 = top.token0?.id?.toLowerCase();
        const isFromToken0 = a0 === fromAddr.toLowerCase();
        const rate = isFromToken0 ? ratio : (1 / ratio);
        if (Number.isFinite(rate) && rate > 0) return rate;
      }
    } catch (e) {
      console.warn("subgraph rate fallback failed", e);
    }
    return null;
  };

  const setDesiredToMarket = async () => {
    const mr = await fetchMarketRate();
    if (Number.isFinite(mr) && (mr as number) > 0) {
      setDesiredPrice((mr as number).toFixed(6));
      setActiveDesired('market');
    }
  };

  const applyDesiredPercent = async (percentDelta: number) => {
    const mr = await fetchMarketRate();
    const base = Number.isFinite(mr) && (mr as number) > 0
      ? (mr as number)
      : (Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : NaN);
    if (!Number.isFinite(base) || base <= 0) return;
    const next = base * (1 + percentDelta / 100);
    setDesiredPrice(next.toFixed(6));
    if (percentDelta === 1) setActiveDesired(1);
    else if (percentDelta === 5) setActiveDesired(5);
    else if (percentDelta === 10) setActiveDesired(10);
  };

  useEffect(() => {
    const detectDesiredActive = async () => {
      const dp = parseFloat(desiredPrice || "");
      if (!(Number.isFinite(dp) && dp > 0) || !fromToken || !toToken) {
        setActiveDesired(null);
        return;
      }
      let base = baseRate ?? NaN;
      if (!Number.isFinite(base) || (base as number) <= 0) {
        const mr = await fetchMarketRate();
        base = mr ?? NaN;
      }
      if (!Number.isFinite(base) || (base as number) <= 0) {
        setActiveDesired(null);
        return;
      }
      const b = base as number;
      const candidates: { key: 'market' | 1 | 5 | 10; value: number }[] = [
        { key: 'market', value: b },
        { key: 1, value: b * 1.01 },
        { key: 5, value: b * 1.05 },
        { key: 10, value: b * 1.10 },
      ];
      for (const c of candidates) {
        const tol = Math.max(1e-6, c.value * 0.005);
        if (Math.abs(dp - c.value) <= tol) {
          setActiveDesired(c.key);
          return;
        }
      }
      setActiveDesired(null);
    };
    detectDesiredActive();
  }, [desiredPrice, fromToken?.address, toToken?.address, baseRate]);

  useEffect(() => {
    if (mode === "limit" && !desiredPrice && baseRate && Number.isFinite(baseRate) && baseRate > 0) {
      setDesiredPrice(baseRate.toFixed(6));
    }
  }, [mode, baseRate]);

  useEffect(() => {
    if (mode === "limit") {
      setIsFromInput(true);
    }
  }, [mode, fromToken?.address, toToken?.address]);

  // Auto-calculate output amount
  // Quote using on-chain pool price when possible
  useEffect(() => {
    const runQuote = async () => {
      // Allow fallback estimation even without network/provider
      if (!fromToken || !toToken) return;
      const fromAddr = fromToken.address as `0x${string}`;
      const toAddr = toToken.address as `0x${string}`;

      // Limit mode: derive amounts based on Desired price or infer Desired price from amounts
      if (mode === "limit") {
        try {
          setQuoting(true);
          const dpNum = parseFloat(desiredPrice || "");
          const rateN = Number.isFinite(dpNum) && dpNum > 0 ? dpNum : undefined;

          if (isFromInput && fromAmount && rateN && rateN > 0) {
            const amt = parseFloat(fromAmount);
            if (Number.isFinite(amt) && amt > 0) {
              const calc = amt * rateN;
              setToAmount(calc.toFixed(6));
            }
          } else if (!isFromInput && toAmount && rateN && rateN > 0) {
            const amt = parseFloat(toAmount);
            if (Number.isFinite(amt) && amt > 0) {
              const calc = amt / rateN;
              setFromAmount(calc.toFixed(6));
            }
          }
        } finally {
          setQuoting(false);
        }
        return;
      }

      // If no client/network, perform Coingecko-based fallback when possible
      if (!publicClient || !currentNetwork) {
        try {
          setQuoting(true);
          if (isFromInput && fromAmount) {
            const amt = parseFloat(fromAmount);
            if (Number.isFinite(amt) && amt > 0 && exchangeRate && exchangeRate > 0) {
              const calc = amt * exchangeRate;
              setToAmount(calc.toFixed(6));
            }
          } else if (!isFromInput && toAmount) {
            const amt = parseFloat(toAmount);
            if (Number.isFinite(amt) && amt > 0 && exchangeRate && exchangeRate > 0) {
              const calc = amt / exchangeRate;
              setFromAmount(calc.toFixed(6));
            }
          }
        } finally {
          setQuoting(false);
        }
        return;
      }
      

      // Find tickSpacing from pools data (first matching pool), default 60
      const selected = selectedPoolId ? liquidPools.find((c) => c.id === selectedPoolId) : undefined;
      const tickSpacing = selected?.tickSpacing ?? liquidPools[0]?.tickSpacing ?? undefined;
      const feeTier = selected?.fee ?? liquidPools[0]?.fee ?? undefined;
      const hooks = selected?.hooks ?? liquidPools[0]?.hooks ?? undefined;

      console.groupCollapsed("🔎 SwapCard/runQuote");
      console.debug("network:", currentNetwork?.name, currentNetwork?.chainId);
      console.debug("from:", fromToken.symbol, fromAddr, "to:", toToken.symbol, toAddr);
      console.debug("isFromInput:", isFromInput, "fromAmount:", fromAmount, "toAmount:", toAmount);
      console.debug("poolCandidates:", poolCandidates.map(c => ({ id: c.id, fee: c.fee, tickSpacing: c.tickSpacing, liquidity: c.liquidity })));
      console.debug("liquidPools:", liquidPools.map(c => ({ id: c.id, fee: c.fee, tickSpacing: c.tickSpacing, liquidity: c.liquidity })));
      console.debug("selectedPoolId:", selectedPoolId, "tickSpacing:", tickSpacing, "fee:", feeTier, "hooks:", hooks);

      try {
        setQuoting(true);
        if (isFromInput && fromAmount) {
          const amt = parseFloat(fromAmount);
          if (!Number.isFinite(amt) || amt <= 0) {
            console.debug("runQuote: skip invalid fromAmount", fromAmount);
            return;
          }
          // Prefer Quoter if available and hooks are not present
          const res = (await quoteExactInputSingle({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: amt,
            tickSpacing,
            fee: feeTier,
            hooks,
          })) || (await estimateExactInput({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: amt,
            tickSpacing,
            fee: feeTier,
            hooks,
          }));
          console.debug("quoteExactInputSingle/estimateExactInput result:", res);
          if (hooks && hooks !== "0x0000000000000000000000000000000000000000") {
            console.debug("Quoter skipped due to hooks; using state-view estimate.");
          }
          if (res) {
            setOnchainRate(res.rate);
            setToAmount(res.amountOut!.toFixed(6));
            console.debug("✅ setToAmount from on-chain:", res.amountOut!.toFixed(6), "rate:", res.rate);
          } else if (exchangeRate) {
            // Fallback to Coingecko-derived rate if on-chain quote unavailable
            const calc = parseFloat(fromAmount) * exchangeRate;
            if (isFinite(calc)) setToAmount(calc.toFixed(6));
            console.debug("⚠️ Fallback Coingecko setToAmount:", calc.toFixed(6), "exchangeRate:", exchangeRate);
          } else {
            console.warn("❌ No quote and no exchangeRate fallback available");
          }
        } else if (!isFromInput && toAmount) {
          const amt = parseFloat(toAmount);
          if (!Number.isFinite(amt) || amt <= 0) {
            console.debug("runQuote: skip invalid toAmount", toAmount);
            return;
          }
          const res = (await quoteExactOutputSingle({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: amt,
            tickSpacing,
            fee: feeTier,
            hooks,
          })) || (await estimateExactOutput({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: amt,
            tickSpacing,
          }));
          console.debug("quoteExactOutputSingle/estimateExactOutput result:", res);
          if (hooks && hooks !== "0x0000000000000000000000000000000000000000") {
            console.debug("Quoter skipped due to hooks; using state-view estimate for exact output.");
          }
          if (res) {
            setOnchainRate(res.rate);
            setFromAmount(res.amountIn!.toFixed(6));
             console.debug("✅ setFromAmount from on-chain:", res.amountIn!.toFixed(6), "rate:", res.rate);
          } else if (exchangeRate && exchangeRate > 0) {
            // Fallback using reverse of Coingecko rate
            const calc = parseFloat(toAmount) / exchangeRate;
            if (isFinite(calc)) setFromAmount(calc.toFixed(6));
            console.debug("⚠️ Fallback Coingecko setFromAmount:", calc.toFixed(6), "exchangeRate:", exchangeRate);
          } else {
            console.warn("❌ No quote and no exchangeRate fallback available for exact output");
          }
        }
      } catch (e) {
        // Fallback: keep Coingecko-based exchangeRate
        console.error("❌ runQuote error:", e);
        // Nếu quoter lỗi, thử estimate từ stateView trước khi fallback Coingecko
        try {
          if (isFromInput && fromAmount) {
            const est = await estimateExactInput({
              client: publicClient,
              chainId: currentNetwork.chainId,
              tokenIn: fromAddr,
              tokenOut: toAddr,
              amount: parseFloat(fromAmount),
              tickSpacing,
              fee: feeTier,
              hooks,
            });
            console.debug("estimateExactInput in catch:", est);
            if (est) {
              setOnchainRate(est.rate);
              setToAmount(est.amountOut!.toFixed(6));
            } else if (exchangeRate) {
              const calc = parseFloat(fromAmount) * exchangeRate;
              if (isFinite(calc)) setToAmount(calc.toFixed(6));
            }
          } else if (!isFromInput && toAmount) {
            const est = await estimateExactOutput({
              client: publicClient,
              chainId: currentNetwork.chainId,
              tokenIn: fromAddr,
              tokenOut: toAddr,
              amount: parseFloat(toAmount),
              tickSpacing,
              fee: feeTier,
              hooks,
            });
            console.debug("estimateExactOutput in catch:", est);
            if (est) {
              setOnchainRate(est.rate);
              setFromAmount(est.amountIn!.toFixed(6));
            } else if (exchangeRate && exchangeRate > 0) {
              const calc = parseFloat(toAmount) / exchangeRate;
              if (isFinite(calc)) setFromAmount(calc.toFixed(6));
            }
          }
        } catch (inner) {
          console.warn("Fallback estimation also failed:", inner);
          setOnchainRate(null);
        }
      } finally {
        setQuoting(false);
        console.groupEnd();
      }
    };

    const timeout = setTimeout(() => {
      runQuote();
    }, 300);
    return () => clearTimeout(timeout);
  }, [publicClient, currentNetwork, pools, fromToken, toToken, isFromInput, fromAmount, toAmount, exchangeRate, desiredPrice]);

  // Load wallet balances for selected tokens
  useEffect(() => {
    const loadBalances = async () => {
      if (!currentNetwork?.rpcUrl || !walletAddress) {
        setFromBalance(null);
        setToBalance(null);
        return;
      }

      setLoadingBalances(true);
      try {
        const [fb, tb] = await Promise.all([
          fromToken
            ? (fromToken.address === "0x0000000000000000000000000000000000000000"
                ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
                : getTokenBalance(fromToken.address, walletAddress, currentNetwork.rpcUrl))
            : Promise.resolve(null),
          toToken
            ? (toToken.address === "0x0000000000000000000000000000000000000000"
                ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
                : getTokenBalance(toToken.address, walletAddress, currentNetwork.rpcUrl))
            : Promise.resolve(null),
        ]);
        setFromBalance(fb);
        setToBalance(tb);
      } catch (e) {
        setFromBalance(null);
        setToBalance(null);
      } finally {
        setLoadingBalances(false);
      }
    };

    loadBalances();
  }, [fromToken, toToken, walletAddress, currentNetwork?.rpcUrl, balancesRefreshKey]);

  const formatBalance = (balance: string | null): string => {
    if (!balance) return "0.00";
    const num = parseFloat(balance);
    if (!isFinite(num)) return "0.00";
    if (num === 0) return "0.00";
    if (num < 0.0001) return "< 0.0001";
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toFixed(2);
  };

  // Helper: xác định token native theo địa chỉ zero
  const isNativeAddress = (addr?: string) => addr?.toLowerCase() === "0x0000000000000000000000000000000000000000";

  // Ước lượng phí gas cần dự trữ khi người dùng chọn 100% native
  const DEFAULT_SWAP_GAS_UNITS = 250000;
  const GAS_BUFFER_MULTIPLIER = 1.2; // thêm buffer để tránh thiếu phí

  const estimateNativeGasReserve = async (): Promise<number> => {
    try {
      if (!publicClient) return 0.02; // fallback ~0.02 native (tùy mạng)
      const gasPriceWei = Number(await publicClient.getGasPrice());
      const feeWei = gasPriceWei * DEFAULT_SWAP_GAS_UNITS * GAS_BUFFER_MULTIPLIER;
      return feeWei / 1e18; // chuyển về đơn vị native
    } catch {
      return 0.02;
    }
  };

  // Insufficient balance/fee warning (English)
  useEffect(() => {
    const checkInsufficient = async () => {
      setInsufficientWarning(null);
      if (!walletAddress || !fromToken) return;
      const amt = parseFloat(fromAmount || "0");
      if (!Number.isFinite(amt) || amt <= 0) return;
      const balNum = parseFloat(fromBalance || "0");
      if (!Number.isFinite(balNum)) return;

      const isNative = isNativeAddress(fromToken.address);
      if (!isNative) {
        if (amt > balNum) setInsufficientWarning("Insufficient balance for the entered amount.");
        return;
      }
      // Native: reserve gas fee
      try {
        const reserve = await estimateNativeGasReserve();
        const maxSpendable = Math.max(0, balNum - reserve);
        if (maxSpendable <= 0) {
          setInsufficientWarning("Insufficient native balance to cover gas fees.");
          return;
        }
        if (amt > maxSpendable) {
          setInsufficientWarning(`Amount exceeds balance after reserving gas (~${reserve.toFixed(4)}).`);
        }
      } catch {
        // nếu ước lượng lỗi, không chặn mà để service tự điều chỉnh
      }
    };
    checkInsufficient();
  }, [walletAddress, fromToken?.address, fromAmount, fromBalance]);

  // Detect active percent selection based on current amount and balance
  useEffect(() => {
    const detectActive = async () => {
      setActivePercent(null);
      if (!walletAddress || !fromToken || !fromBalance) return;
      const amt = parseFloat(fromAmount || "0");
      if (!Number.isFinite(amt) || amt <= 0) return;
      const bal = parseFloat(fromBalance);
      if (!Number.isFinite(bal) || bal <= 0) return;
      const isNative = isNativeAddress(fromToken.address);
      let available = bal;
      if (isNative) {
        try {
          const reserve = await estimateNativeGasReserve();
          available = Math.max(0, bal - reserve);
        } catch (e) {
          console.warn(e);
        }
      }
      const options = [0.25, 0.5, 0.75, 1];
      for (const p of options) {
        const raw = bal * p;
        const target = isNative ? Math.min(raw, available) : raw;
        const tolerance = Math.max(1e-6, target * 0.005); // 0.5% tolerance
        if (Math.abs(amt - target) <= tolerance) {
          setActivePercent(p);
          return;
        }
      }
    };
    detectActive();
  }, [walletAddress, fromToken?.address, fromBalance, fromAmount]);

  // Áp dụng chọn nhanh phần trăm số dư cho fromAmount
  const applyFromQuickSelect = async (percent: number) => {
    if (!walletAddress || !fromToken) {
      toast.error("Please connect your wallet and select a token.");
      return;
    }
    if (!fromBalance) {
      toast.error("Failed to load balance.");
      return;
    }
    const bal = parseFloat(fromBalance);
    if (!(Number.isFinite(bal) && bal > 0)) {
      toast.error("Insufficient balance.");
      return;
    }
    const isNative = isNativeAddress(fromToken.address);
    const gasReserve = isNative ? await estimateNativeGasReserve() : 0;
    const spendable = isNative ? Math.max(0, bal - gasReserve) : bal;
    const amount = Math.min(bal * percent, spendable);
    if (isNative && amount <= 0) {
      setInsufficientWarning("Insufficient native balance to cover gas fees.");
    }
    setIsFromInput(true);
    // Always show the computed amount, even if it's 0
    setFromAmount(amount > 0 ? amount.toFixed(6) : "0");
    setActivePercent(percent);
  };

  // Chuẩn hóa chuỗi số thập phân: thay ',' bằng '.', loại bỏ ký tự không hợp lệ
  const sanitizeDecimalInput = (value: string) => {
    if (!value) return "";
    let v = value.replace(/,/g, ".");
    v = v.replace(/[^\d.]/g, "");
    const parts = v.split(".");
    if (parts.length > 2) {
      v = parts[0] + "." + parts.slice(1).join("");
    }
    return v;
  };

  const handleFromAmountChange = (value: string) => {
    setIsFromInput(true);
    const sanitized = sanitizeDecimalInput(value);
    setFromAmount(sanitized);
  };

  const handleToAmountChange = (value: string) => {
    setIsFromInput(false);
    const sanitized = sanitizeDecimalInput(value);
    setToAmount(sanitized);
  };

  const handleDesiredPriceChange = (value: string) => {
    const sanitized = sanitizeDecimalInput(value);
    setDesiredPrice(sanitized);
  };

  const handleSwap = () => {
    if (!walletAddress) {
      toast.error("Please connect your wallet to perform a swap.");
      return;
    }
    if (!fromToken || !toToken || !fromAmount) {
      toast.error("Please fill in all swap details.");
      return;
    }
    if (mode === "swap") {
      setShowConfirmDialog(true);
    } else {
      handlePlaceLimitOrder();
    }
  };

  const handleConfirmSwap = async () => {
    if (!fromToken || !toToken || !fromAmount || !publicClient || !walletClient || !currentNetwork) return;
    try {
      setShowConfirmDialog(false);
      setTxStatus("loading");
      setTxHash(undefined);
      setTxDialogOpen(true);

      // Determine tickSpacing from subgraph pools
      const fromAddr = fromToken.address as `0x${string}`;
      const toAddr = toToken.address as `0x${string}`;
      const selected = selectedPoolId ? liquidPools.find((c) => c.id === selectedPoolId) : undefined;
      const tickSpacing = selected?.tickSpacing ?? liquidPools[0]?.tickSpacing ?? undefined;
      const feeTier = selected?.fee ?? liquidPools[0]?.fee ?? undefined;
      const hooks = selected?.hooks ?? liquidPools[0]?.hooks ?? undefined;

      const receipt = await swapExactInSingle({
        publicClient,
        walletClient,
        chainId: currentNetwork.chainId,
        tokenIn: fromAddr,
        tokenOut: toAddr,
        amountInHuman: parseFloat(fromAmount),
        tickSpacing,
        fee: feeTier,
        hooks,
        account: walletAddress as `0x${string}`,
      });

      const fromPrice = prices?.[fromToken.coingeckoId]?.usd || 0;
      const valueUsd = parseFloat(fromAmount) * fromPrice;

      const hash = (typeof receipt === "object" && receipt && "transactionHash" in receipt)
        ? (receipt as { transactionHash?: string }).transactionHash
        : undefined;

      saveTransaction({
        fromToken: { symbol: fromToken.symbol, logo: fromToken.logo, amount: fromAmount },
        toToken: { symbol: toToken.symbol, logo: toToken.logo, amount: toAmount ?? "" },
        exchangeRate: onchainRate ?? exchangeRate ?? 0,
        slippage,
        valueUsd,
        txHash: hash,
      });

      setTxHash(hash);
      setTxStatus("success");
      toast.success(`Swap completed! Tx: ${hash ?? ""}`);
      // Reload balances after successful swap
      setBalancesRefreshKey((k) => k + 1);
      setFromAmount("");
      setToAmount("");
    } catch (err: unknown) {
      const e = err as { reason?: string; message?: string };
      console.error("❌ Swap failed:", e?.reason || e?.message || err);
      setTxStatus("error");
      toast.error(e?.reason || e?.message || "Swap failed");
    }
  };

  const handlePlaceLimitOrder = async () => {
    if (!fromToken || !toToken || !fromAmount || !publicClient || !walletClient || !currentNetwork || !walletAddress) return;
    const dp = parseFloat(desiredPrice || "");
    if (!(Number.isFinite(dp) && dp > 0)) {
      toast.error("Please enter a valid desired price.");
      return;
    }
    try {
      console.groupCollapsed("🟦 UI/LimitOrder/handlePlaceLimitOrder");
      console.debug("network:", { name: currentNetwork?.name, chainId: currentNetwork?.chainId });
      console.debug("tokens:", { from: fromToken.symbol, to: toToken.symbol, fromAddr: fromToken.address, toAddr: toToken.address });
      console.debug("inputs:", { fromAmount, desiredPrice: dp });
      setTxStatus("loading");
      setTxHash(undefined);
      try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch {}
      setTxDialogOpen(true);

      const fromAddr = fromToken.address as `0x${string}`;
      const toAddr = toToken.address as `0x${string}`;
      const selected = selectedPoolId ? liquidPools.find((c) => c.id === selectedPoolId) : undefined;
      const tickSpacing = selected?.tickSpacing ?? liquidPools[0]?.tickSpacing ?? undefined;
      const feeTier = selected?.fee ?? liquidPools[0]?.fee ?? undefined;
      const hooks = selected?.hooks ?? liquidPools[0]?.hooks ?? undefined;

      const normalizedDesired = dp;
      console.debug("pool candidates:", { selectedPoolId, tickSpacing, feeTier, hooks });
      const { order, signature } = await createLimitOrder({
        publicClient,
        walletClient,
        chainId: currentNetwork.chainId,
        tokenIn: fromAddr,
        tokenOut: toAddr,
        amountInHuman: parseFloat(fromAmount),
        desiredPrice: normalizedDesired,
        tickSpacing: tickSpacing!,
        fee: feeTier,
        hooks,
        ttlSeconds: limitTTL,
        account: walletAddress as `0x${string}`,
        recipient: walletAddress as `0x${string}`,
      });
      console.debug("✅ Limit order signed:", { order, signature });

      const fromPrice = prices?.[fromToken.coingeckoId]?.usd || 0;
      const valueUsd = parseFloat(fromAmount) * fromPrice;
      saveTransaction({
        fromToken: { symbol: fromToken.symbol, logo: fromToken.logo, amount: fromAmount },
        toToken: { symbol: toToken.symbol, logo: toToken.logo, amount: toAmount ?? "" },
        exchangeRate: normalizedDesired,
        slippage: 0,
        valueUsd,
        txHash: undefined,
      });

      setTxStatus("success");
      toast.success("Limit order created and signed");
      console.groupEnd();
      setBalancesRefreshKey((k) => k + 1);
      setFromAmount("");
      setToAmount("");
    } catch (err: unknown) {
      const e = err as { reason?: string; message?: string };
      console.error("❌ Limit order failed:", e?.reason || e?.message || err);
      setTxStatus("error");
      toast.error(e?.reason || e?.message || "Failed to create limit order");
      console.groupEnd();
    }
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setIsFromInput(!isFromInput);
  };

  return (
    <>
      <Card className="w-full p-4 bg-card/80 backdrop-blur-xl border-glass shadow-glow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant={mode === "swap" ? "default" : "outline"} size="sm" onClick={() => setMode("swap")}>Swap</Button>
          <Button variant={mode === "limit" ? "default" : "outline"} size="sm" onClick={() => setMode("limit")}>Limit</Button>
        </div>
        <div className="flex items-center gap-2">
          {fromToken && toToken && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${pricesLoading ? 'animate-spin' : ''}`} />
              {countdown}s
            </span>
          )}
          <SlippageSettings slippage={slippage} onSlippageChange={setSlippage} />
        </div>
      </div>
      {!walletAddress && (
        <div className="mb-3 p-3 rounded-xl bg-amber-100/10 border border-amber-200/50 text-amber-600 dark:text-amber-400 text-sm">
          Please connect your wallet to perform swaps.
        </div>
      )}

      {/* Fee tier selector: chỉ hiển thị nếu có ít nhất một pool có thanh khoản */}
      {fromToken && toToken && liquidPools.length > 0 && (
        <div className="mb-3">
          <div className="text-sm text-muted-foreground mb-1">Fee Tier</div>
          <Select value={selectedPoolId ?? undefined} onValueChange={(v) => setSelectedPoolId(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {liquidPools.map((c) => {
                const pct = c.fee ? (c.fee / 10_000).toFixed(2) + "%" : (c.tickSpacing / 10).toFixed(2) + "%";
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {pct}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "limit" && (
        <div className="mt-2 p-3 bg-muted/30 rounded-xl border border-glass space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Desired price</span>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="0.0"
                value={desiredPrice}
                onChange={(e) => handleDesiredPriceChange(e.target.value)}
                inputMode="decimal"
                step="any"
                className="w-40"
              />
              {fromToken && toToken ? (
                <span className="text-sm text-muted-foreground">
                  {`${toToken.symbol} per ${fromToken.symbol}`}
                </span>
              ) : (
                <div className="px-2 py-1 rounded-lg bg-amber-100/10 border border-amber-200/50 text-amber-600 dark:text-amber-400 text-xs inline-flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Select a token pair
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {(() => {
                const d = parseFloat(desiredPrice || "");
                if (Number.isFinite(d) && d > 0) {
                  return (
                    <>
                      <span className="mr-3">Desired: 1 {fromToken?.symbol || "FROM"} = {d.toFixed(6)} {toToken?.symbol || "TO"}</span>
                      <span>Inv: 1 {toToken?.symbol || "TO"} = {(1 / d).toFixed(6)} {fromToken?.symbol || "FROM"}</span>
                    </>
                  );
                }
                if (Number.isFinite(exchangeRate) && exchangeRate > 0) {
                  return (
                    <>
                      <span className="mr-3">Market: 1 {fromToken?.symbol || "FROM"} = {exchangeRate.toFixed(6)} {toToken?.symbol || "TO"}</span>
                      <span>Inv: 1 {toToken?.symbol || "TO"} = {(1 / exchangeRate).toFixed(6)} {fromToken?.symbol || "FROM"}</span>
                    </>
                  );
                }
                return null;
              })()}
            </div>
          </div>
          <TooltipProvider>
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={activeDesired==='market' ? 'default' : 'outline'} size="sm" onClick={setDesiredToMarket} disabled={!fromToken || !toToken}>Market</Button>
                </TooltipTrigger>
                <TooltipContent>Set desired price to market rate</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={activeDesired===1 ? 'default' : 'outline'} size="sm" onClick={() => void applyDesiredPercent(1)} disabled={!fromToken || !toToken}>+1%</Button>
                </TooltipTrigger>
                <TooltipContent>Increase desired price by 1%</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={activeDesired===5 ? 'default' : 'outline'} size="sm" onClick={() => void applyDesiredPercent(5)} disabled={!fromToken || !toToken}>+5%</Button>
                </TooltipTrigger>
                <TooltipContent>Increase desired price by 5%</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={activeDesired===10 ? 'default' : 'outline'} size="sm" onClick={() => void applyDesiredPercent(10)} disabled={!fromToken || !toToken}>+10%</Button>
                </TooltipTrigger>
                <TooltipContent>Increase desired price by 10%</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      <div className="space-y-2">
        {/* From Token */}
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{mode === "swap" ? "You pay" : "You will pay"}</span>
            <span className="text-sm text-muted-foreground">
              {fromToken && prices?.[fromToken.coingeckoId]?.usd && fromAmount
                ? `~$${(parseFloat(fromAmount) * (prices[fromToken.coingeckoId].usd || 0)).toFixed(2)}`
                : loadingBalances
                  ? 'Loading...'
                  : walletAddress
                    ? `Balance: ${formatBalance(fromBalance)}`
                    : 'Connect wallet to see balance'}
            </span>
          </div>
          {insufficientWarning && (
            <div className="mb-2 p-2 rounded-lg bg-amber-100/10 border border-amber-200/50 text-amber-600 dark:text-amber-400 text-xs">
              {insufficientWarning}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              inputMode="decimal"
              step="any"
              className="border-0 bg-transparent text-3xl font-semibold p-0 h-12 focus-visible:ring-0"
            />
            <TokenSelector selectedToken={fromToken} onSelectToken={setFromToken} tokens={allTokens} />
          </div>
          {/* Show loading on OUTPUT side: when editing 'toAmount' (isFromInput === false), from box is output */}
          {quoting && !isFromInput && (
            <div className="absolute inset-0 rounded-2xl bg-background/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Estimating...
              </div>
            </div>
          )}
          {walletAddress && fromBalance && (
            <div className="mt-2 flex justify-end gap-2">
              <Button variant={activePercent===0.25?"default":"outline"} size="sm" onClick={() => applyFromQuickSelect(0.25)}>25%</Button>
              <Button variant={activePercent===0.5?"default":"outline"} size="sm" onClick={() => applyFromQuickSelect(0.5)}>50%</Button>
              <Button variant={activePercent===0.75?"default":"outline"} size="sm" onClick={() => applyFromQuickSelect(0.75)}>75%</Button>
              <Button variant={activePercent===1?"default":"outline"} size="sm" onClick={() => applyFromQuickSelect(1)}>100%</Button>
            </div>
          )}
          {fromToken && prices?.[fromToken.coingeckoId]?.usd && (
            <div className="mt-2 text-xs text-muted-foreground">
              ${prices[fromToken.coingeckoId].usd.toFixed(2)} / {fromToken.symbol}
            </div>
          )}
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={switchTokens}
            disabled={!fromToken || !toToken}
            className="h-10 w-10 rounded-xl bg-card border border-glass hover:bg-muted/50 transition-all hover:rotate-180 disabled:opacity-50"
          >
            <ArrowUpDown className="h-5 w-5" />
          </Button>
        </div>

        {/* To Token */}
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">You receive</span>
            <span className="text-sm text-muted-foreground">
              {toToken && prices?.[toToken.coingeckoId]?.usd && toAmount
                ? `~$${(parseFloat(toAmount) * (prices[toToken.coingeckoId].usd || 0)).toFixed(2)}`
                : loadingBalances
                  ? 'Loading...'
                  : walletAddress
                    ? `Balance: ${formatBalance(toBalance)}`
                    : 'Connect wallet to see balance'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder="0.0"
              value={toAmount}
              onChange={(e) => handleToAmountChange(e.target.value)}
              inputMode="decimal"
              step="any"
              className="border-0 bg-transparent text-3xl font-semibold p-0 h-12 focus-visible:ring-0"
            />
            <TokenSelector selectedToken={toToken} onSelectToken={setToToken} tokens={allTokens} allowedAddresses={allowedToAddresses} />
          </div>
          {/* Show loading on OUTPUT side: when editing 'fromAmount' (isFromInput === true), to box is output */}
          {quoting && isFromInput && (
            <div className="absolute inset-0 rounded-2xl bg-background/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Estimating...
              </div>
            </div>
          )}
          {toToken && prices?.[toToken.coingeckoId]?.usd && (
            <div className="mt-2 text-xs text-muted-foreground">
              ${prices[toToken.coingeckoId].usd.toFixed(2)} / {toToken.symbol}
            </div>
          )}
        </div>
      </div>

      {mode === "swap" && fromToken && toToken && exchangeRate && (fromAmount || toAmount) && (
        <div className="mt-4 p-3 bg-muted/30 rounded-xl border border-glass space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Exchange rate</span>
            <span className="font-medium">
              1 {fromToken.symbol} = {exchangeRate.toFixed(6)} {toToken.symbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Inverse rate</span>
            <span className="font-medium">
              1 {toToken.symbol} = {(1 / exchangeRate).toFixed(6)} {fromToken.symbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Slippage tolerance</span>
            <span className="font-medium">{slippage}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Minimum received</span>
            <span className="font-medium">
              {(parseFloat(toAmount) * (1 - slippage / 100)).toFixed(6)} {toToken.symbol}
            </span>
          </div>
        </div>
      )}


      <Button 
        onClick={handleSwap}
        disabled={
          !walletAddress ||
          !fromToken ||
          !toToken ||
          (mode === "swap"
            ? (isFromInput
                ? !(Number.isFinite(parseFloat(fromAmount || "")) && parseFloat(fromAmount || "") > 0)
                : !(Number.isFinite(parseFloat(toAmount || "")) && parseFloat(toAmount || "") > 0)
              )
            : !(Number.isFinite(parseFloat(fromAmount || "")) && parseFloat(fromAmount || "") > 0 && Number.isFinite(parseFloat(desiredPrice || "")) && parseFloat(desiredPrice || "") > 0)
          ) ||
          pricesLoading ||
          quoting ||
          !!insufficientWarning
        }
        className="w-full mt-4 h-14 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {mode === "swap"
          ? (quoting
              ? 'Estimating...'
              : pricesLoading
                ? 'Loading price...'
                : (!walletAddress ? 'Connect wallet to swap' : 'Swap'))
          : (!walletAddress ? 'Connect wallet to place order' : 'Place Limit Order')}
      </Button>
    </Card>

    {fromToken && toToken && exchangeRate && showConfirmDialog && (
      <SwapConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmSwap}
        fromToken={fromToken}
        toToken={toToken}
        fromAmount={fromAmount}
        toAmount={toAmount}
        exchangeRate={exchangeRate}
        slippage={slippage}
        priceUsd={{
          from: prices?.[fromToken.coingeckoId]?.usd || 0,
          to: prices?.[toToken.coingeckoId]?.usd || 0,
        }}
      />
    )}

    <TxStatusDialog
      open={txDialogOpen}
      onOpenChange={setTxDialogOpen}
      status={txStatus}
      chainId={currentNetwork?.chainId}
      txHash={txHash}
    />
    </>
  );
};
