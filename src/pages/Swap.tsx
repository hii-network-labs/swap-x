import { useMemo, useState, useEffect, useRef, Suspense, lazy } from "react";
const SwapCardLazy = lazy(() => import("@/components/Swap/SwapCard").then(m => ({ default: m.SwapCard })));
const PriceChartLazy = lazy(() => import("@/components/Swap/PriceChart").then(m => ({ default: m.PriceChart })));
import { Token } from "@/components/Swap/TokenSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, TrendingUp } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { toast } from "sonner";

const Swap = () => {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);

  const location = useLocation();
  const { initialFrom, initialTo } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      initialFrom: params.get("from") || undefined,
      initialTo: params.get("to") || undefined,
    };
  }, [location.search]);

  const { currentNetwork, walletAddress } = useNetwork();
  const ORDER_SERVER = (import.meta.env.VITE_ORDER_SERVER as string | undefined) || "http://localhost:3000";
  console.log("ORDER_SERVER:", ORDER_SERVER);
  const pairKey = `${fromToken?.address || ""}-${toToken?.address || ""}`;
  const { pools } = useSubgraphPools();
  const decimalsMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of pools) {
      m[p.token0.id.toLowerCase()] = Number(p.token0.decimals || "18");
      m[p.token1.id.toLowerCase()] = Number(p.token1.decimals || "18");
    }
    return m;
  }, [pools]);
  const symbolMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of pools) {
      m[p.token0.id.toLowerCase()] = String(p.token0.symbol || "");
      m[p.token1.id.toLowerCase()] = String(p.token1.symbol || "");
    }
    return m;
  }, [pools]);
  const [isLimitMode, setIsLimitMode] = useState(false);
  const [obSort, setObSort] = useState(true);
  const fromDecimals = fromToken ? (decimalsMap[fromToken.address.toLowerCase()] ?? (["USDC","USDT"].includes(fromToken.symbol) ? 6 : 18)) : 18;
  const toDecimals = toToken ? (decimalsMap[toToken.address.toLowerCase()] ?? (["USDC","USDT"].includes(toToken.symbol) ? 6 : 18)) : 18;

  type OrderDto = {
    id?: string;
    status?: string;
    maker?: string;
    inputToken?: string;
    outputToken?: string;
    inputAmount?: string | number;
    minOutputAmount?: string | number;
    uiPrice?: string | number; // NEW: Direct UI price
    side?: string; // NEW: 'buy' or 'sell'
    desiredPrice?: string | number;
    price?: string | number;
    createdAt?: string;
    updatedAt?: string;
  };
  type PaginatedResponse<T> = { data: T[]; meta: { total: number; page: number; limit: number; totalPages: number } };
  

  const { data: myOrdersResp } = useQuery<PaginatedResponse<OrderDto>>({
    queryKey: ["my-orders", currentNetwork?.chainId, walletAddress],
    enabled: Boolean(currentNetwork?.chainId && walletAddress && isLimitMode),
    refetchInterval: 5000,
    queryFn: async (): Promise<PaginatedResponse<OrderDto>> => {
      const url = `${ORDER_SERVER}/orders?maker=${walletAddress}&page=1&limit=100&sortBy=updatedAt&sortOrder=DESC`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Failed to load your orders");
      return resp.json();
    },
    staleTime: 3000,
  });

  const { data: myOrdersNotify } = useQuery<PaginatedResponse<OrderDto>>({
    queryKey: ["my-orders-notify", currentNetwork?.chainId, walletAddress],
    enabled: Boolean(currentNetwork?.chainId && walletAddress),
    refetchInterval: 5000,
    queryFn: async (): Promise<PaginatedResponse<OrderDto>> => {
      const url = `${ORDER_SERVER}/orders?maker=${walletAddress}&page=1&limit=100&sortBy=updatedAt&sortOrder=DESC`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Failed to load your orders for notify");
      return resp.json();
    },
    staleTime: 3000,
  });

  const prevStatusesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const list = Array.isArray(myOrdersNotify?.data) ? myOrdersNotify!.data : [];
    const nextMap: Record<string, string> = {};
    for (const o of list) {
      const id = String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.price}-${o.desiredPrice}-${o.updatedAt}`);
      const status = String(o.status || (o as any).state || "").toLowerCase();
      nextMap[id] = status;
      const prev = prevStatusesRef.current[id];
      if (prev && prev !== status) {
        const STABLE = new Set(["USDT","USDC","HNC"]);
        const inAddr = String(o.inputToken || "").toLowerCase();
        const outAddr = String(o.outputToken || "").toLowerCase();
        const sIn = symbolMap[inAddr] || "";
        const sOut = symbolMap[outAddr] || "";
        const anchorAddr = STABLE.has(sIn) ? outAddr : STABLE.has(sOut) ? inAddr : [inAddr, outAddr].sort()[0];
        const anchorSym = symbolMap[anchorAddr] || "TOKEN";
        const side = inAddr === anchorAddr ? "SELL" : "BUY";
        const fDec = decimalsMap[inAddr] ?? 18;
        const tDec = decimalsMap[outAddr] ?? 18;
        const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
        const outMinRaw = typeof (o as any).minOutputAmount === 'string' ? parseFloat((o as any).minOutputAmount) : Number((o as any).minOutputAmount ?? 0);
        const priceDerived = (inAmtRaw > 0 && outMinRaw > 0)
          ? (outMinRaw / Math.pow(10, tDec)) / (inAmtRaw / Math.pow(10, fDec))
          : NaN;
        const priceNum = Number(o.price ?? o.desiredPrice ?? priceDerived ?? 0);
        const sizeHuman = inAddr === anchorAddr
          ? (inAmtRaw / Math.pow(10, fDec))
          : (outMinRaw / Math.pow(10, tDec));
        const ts = o.updatedAt || o.createdAt || undefined;
        const timeStr = ts ? (() => { const d = new Date(ts); const hh = String(d.getHours()).padStart(2, "0"); const mm = String(d.getMinutes()).padStart(2, "0"); const ss = String(d.getSeconds()).padStart(2, "0"); const DD = String(d.getDate()).padStart(2, "0"); const MM = String(d.getMonth() + 1).padStart(2, "0"); const YYYY = String(d.getFullYear()); return `${hh}:${mm}:${ss} ${DD}/${MM}/${YYYY}`; })() : "";
        if (["filled","executed"].includes(status)) {
          toast.success(`${side} ${anchorSym} at ${Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(6) : '-'} · size ${Number.isFinite(sizeHuman) ? sizeHuman.toFixed(6) : '-'} · ${timeStr}`);
        } else if (["canceled","cancelled"].includes(status)) {
          toast.info(`${side} ${anchorSym} canceled · size ${Number.isFinite(sizeHuman) ? sizeHuman.toFixed(6) : '-'} · ${timeStr}`);
        } else if (["expired"].includes(status)) {
          toast.warning?.(`${side} ${anchorSym} expired · ${timeStr}`);
        } else {
          toast(`${side} ${anchorSym} status: ${status} · ${timeStr}`);
        }
      }
    }
    prevStatusesRef.current = nextMap;
  }, [myOrdersNotify?.data]);

  const fallbackPending = Array.isArray((myOrdersResp as any)?.data)
    ? (myOrdersResp!.data as any[]).find((o: any) => {
        const s = String(o.status || o.state || "").toLowerCase();
        return s === "pending" || s === "open";
      })
    : undefined;
  const defaultPair = useMemo(() => {
    const STABLE = new Set(["USDT","USDC"]);
    const baseCand = pools.flatMap((p) => [p.token0, p.token1]).filter((t) => ["HNC","WHNC","WETH","WBNB"].includes(String(t?.symbol))).map((t) => t?.id?.toLowerCase()).filter(Boolean) as string[];
    const stableCand = pools.flatMap((p) => [p.token0, p.token1]).filter((t) => STABLE.has(String(t?.symbol))).map((t) => t?.id?.toLowerCase()).filter(Boolean) as string[];
    const base = baseCand[0];
    const stable = stableCand[0];
    return { fromAddr: base || "", toAddr: stable || "" };
  }, [pools]);
  const pairFromAddr = fromToken?.address || fallbackPending?.inputToken || defaultPair.fromAddr;
  const pairToAddr = toToken?.address || fallbackPending?.outputToken || defaultPair.toAddr;
  const effectivePairKey = `${pairFromAddr || ""}-${pairToAddr || ""}`;
  useEffect(() => {
    if (!isLimitMode) return;
    if (fromToken && toToken) return;
    const fromAddr = pairFromAddr?.toLowerCase();
    const toAddr = pairToAddr?.toLowerCase();
    if (!fromAddr || !toAddr) return;
    const p = pools.find((x) => {
      const a0 = x.token0.id.toLowerCase();
      const a1 = x.token1.id.toLowerCase();
      return (a0 === fromAddr && a1 === toAddr) || (a0 === toAddr && a1 === fromAddr);
    });
    if (!p) return;
    const makeToken = (id: string, symbol: string): Token => ({ address: id, symbol, name: symbol, logo: "", coingeckoId: "" });
    const fromSym = symbolMap[fromAddr] || p.token0.symbol;
    const toSym = symbolMap[toAddr] || p.token1.symbol;
    setFromToken(makeToken(fromAddr, fromSym));
    setToToken(makeToken(toAddr, toSym));
  }, [isLimitMode, pairFromAddr, pairToAddr, pools]);

  const { data: asksResp, isFetching: asksFetching, isLoading: asksLoading } = useQuery<PaginatedResponse<OrderDto>>({
    queryKey: ["orders-asks", currentNetwork?.chainId, effectivePairKey],
    enabled: Boolean(currentNetwork?.chainId && pairFromAddr && pairToAddr && isLimitMode),
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<PaginatedResponse<OrderDto>> => {
      const url = `${ORDER_SERVER}/orders?status=PENDING&inputToken=${pairFromAddr}&outputToken=${pairToAddr}&page=1&limit=100&sortBy=createdAt&sortOrder=DESC`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
        return resp.json();
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("Abort") || msg.includes("aborted") || err?.name === "AbortError") {
          return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
        }
        return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
      }
    },
    staleTime: 3000,
  });
  const { data: bidsResp, isFetching: bidsFetching, isLoading: bidsLoading } = useQuery<PaginatedResponse<OrderDto>>({
    queryKey: ["orders-bids", currentNetwork?.chainId, effectivePairKey],
    enabled: Boolean(currentNetwork?.chainId && pairFromAddr && pairToAddr && isLimitMode),
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<PaginatedResponse<OrderDto>> => {
      const url = `${ORDER_SERVER}/orders?status=PENDING&inputToken=${pairToAddr}&outputToken=${pairFromAddr}&page=1&limit=100&sortBy=createdAt&sortOrder=DESC`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
        return resp.json();
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("Abort") || msg.includes("aborted") || err?.name === "AbortError") {
          return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
        }
        return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
      }
    },
    staleTime: 3000,
  });

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        {/* Desktop Grid Layout */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-6 items-start">
          <Suspense fallback={<Card className="bg-card/80 border-glass p-4"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></Card>}>
          <PriceChartLazy 
            key={`${fromToken?.address || fromToken?.symbol || 'from-default'}-${toToken?.address || toToken?.symbol || 'to-default'}`}
            fromToken={fromToken} 
            toToken={toToken} 
            onSelectFromToken={setFromToken}
            onSelectToToken={setToToken}
          />
          </Suspense>
          <div className="flex justify-center lg:justify-start">
            <Suspense fallback={<Card className="bg-card/80 border-glass p-4 w-full max-w-xl"><Skeleton className="h-6 w-32 mb-3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-10 w-full mt-3" /></Card>}>
            <SwapCardLazy 
              initialFromAddress={initialFrom}
              initialToAddress={initialTo}
              selectedFromToken={fromToken}
              selectedToToken={toToken}
              onSelectFromToken={setFromToken}
              onSelectToToken={setToToken}
              onTokensChange={(from, to) => {
                setFromToken(from);
                setToToken(to);
              }}
              onModeChange={(m) => setIsLimitMode(m === "limit")} 
            />
            </Suspense>
          </div>
        </div>
        {/* Bottom Row: Order Book | Your Orders */}
        {isLimitMode && (
        <div className="mt-6 hidden lg:grid lg:grid-cols-2 gap-6">
          <Card className="bg-card/80 backdrop-blur-xl border-glass">
            <div className="p-4 border-b border-glass flex items-center justify-between">
              <div className="font-semibold">Order Book</div>
              <div className="text-xs text-muted-foreground">{fromToken?.symbol} / {toToken?.symbol}</div>
            </div>
            <div className="p-4">
              {(() => {
                const sFrom = symbolMap[String(pairFromAddr || '').toLowerCase()] || fromToken?.symbol || '';
                const sTo = symbolMap[String(pairToAddr || '').toLowerCase()] || toToken?.symbol || '';
                const STABLE = new Set(['USDT','USDC','HNC']);
                const anchorAddr = STABLE.has(sFrom) ? String(pairToAddr || '') : STABLE.has(sTo) ? String(pairFromAddr || '') : [String(pairFromAddr || ''), String(pairToAddr || '')].sort()[0];
                const anchorSym = symbolMap[String(anchorAddr).toLowerCase()] || 'TOKEN';
                const anchorDec = decimalsMap[String(anchorAddr).toLowerCase()] ?? 18;
                const allRaw = [
                  ...(Array.isArray(asksResp?.data) ? asksResp!.data : []),
                  ...(Array.isArray(bidsResp?.data) ? bidsResp!.data : []),
                ];
                const asksRaw = allRaw.filter((o) => String(o.inputToken || '').toLowerCase() === String(anchorAddr).toLowerCase());
                const bidsRaw = allRaw.filter((o) => String(o.outputToken || '').toLowerCase() === String(anchorAddr).toLowerCase());
                const fDec = (pairFromAddr ? (decimalsMap[(pairFromAddr || '').toLowerCase()] ?? 18) : fromDecimals);
                const tDec = (pairToAddr ? (decimalsMap[(pairToAddr || '').toLowerCase()] ?? 18) : toDecimals);
                const asks = asksRaw.map((o) => {
                  // Use uiPrice if available (new orders), otherwise fallback to calculated
                  const uiPriceNum = o.uiPrice ? (typeof o.uiPrice === 'string' ? parseFloat(o.uiPrice) : Number(o.uiPrice)) : NaN;
                  if (Number.isFinite(uiPriceNum) && uiPriceNum > 0) {
                    const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                    return {
                      id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.uiPrice}-${o.createdAt}`),
                      price: uiPriceNum,
                      size: inAmtRaw / Math.pow(10, anchorDec),
                    };
                  }
                  // Fallback for legacy orders without uiPrice
                  const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                  const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                  const priceDerived = (inAmtRaw > 0 && outMinRaw > 0)
                    ? (outMinRaw / Math.pow(10, tDec)) / (inAmtRaw / Math.pow(10, fDec))
                    : NaN;
                  return {
                    id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.price}-${o.desiredPrice}-${o.createdAt}`),
                    price: Number(o.price ?? o.desiredPrice ?? priceDerived ?? 0),
                    size: inAmtRaw / Math.pow(10, anchorDec),
                  };
                }).filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);
                const bids = bidsRaw.map((o) => {
                  // Use uiPrice if available (new orders), otherwise fallback to calculated
                  const uiPriceNum = o.uiPrice ? (typeof o.uiPrice === 'string' ? parseFloat(o.uiPrice) : Number(o.uiPrice)) : NaN;
                  if (Number.isFinite(uiPriceNum) && uiPriceNum > 0) {
                    const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                    return {
                      id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.uiPrice}-${o.createdAt}`),
                      price: uiPriceNum,
                      size: outMinRaw / Math.pow(10, anchorDec),
                    };
                  }
                  // Fallback for legacy orders without uiPrice
                  const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                  const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                  const priceDerived = (inAmtRaw > 0 && outMinRaw > 0)
                    ? (outMinRaw / Math.pow(10, tDec)) / (inAmtRaw / Math.pow(10, fDec))
                    : NaN;
                  return {
                    id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.price}-${o.desiredPrice}-${o.createdAt}`),
                    price: Number((o as any).uiPrice ?? o.price ?? o.desiredPrice ?? priceDerived ?? 0),
                    size: outMinRaw / Math.pow(10, anchorDec),
                  };
                }).filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);
                
                const asksSorted = [...asks].sort((a, b) => a.price - b.price);
                const bidsSorted = [...bids].sort((a, b) => b.price - a.price);
                const asksView = obSort ? asksSorted : asks;
                const bidsView = obSort ? bidsSorted : bids;
                const groupByPriceAsc = (arr: { id: string; price: number; size: number }[]) => {
                  const map: Record<string, { id: string; price: number; size: number }> = {};
                  for (const r of arr) {
                    const k = r.price.toFixed(6);
                    if (map[k]) {
                      map[k].size += r.size;
                    } else {
                      map[k] = { id: k, price: Number(k), size: r.size };
                    }
                  }
                  return Object.values(map).sort((a, b) => a.price - b.price);
                };
                const groupByPriceDesc = (arr: { id: string; price: number; size: number }[]) => {
                  const map: Record<string, { id: string; price: number; size: number }> = {};
                  for (const r of arr) {
                    const k = r.price.toFixed(6);
                    if (map[k]) {
                      map[k].size += r.size;
                    } else {
                      map[k] = { id: k, price: Number(k), size: r.size };
                    }
                  }
                  return Object.values(map).sort((a, b) => b.price - a.price);
                };
                const asksGrouped = groupByPriceAsc(asksView);
                const bidsGrouped = groupByPriceDesc(bidsView);
                const askSizes = asksGrouped.map((r) => r.size);
                const bidSizes = bidsGrouped.map((r) => r.size);
                const maxAsk = askSizes.length ? Math.max(...askSizes) : 0;
                const maxBid = bidSizes.length ? Math.max(...bidSizes) : 0;
                const bestAsk = asksGrouped.length ? asksGrouped[0].price : NaN;
                const bestBid = bidsGrouped.length ? bidsGrouped[0].price : NaN;
                const spread = Number.isFinite(bestAsk) && Number.isFinite(bestBid) ? Math.max(0, bestAsk - bestBid) : NaN;
                const mid = Number.isFinite(bestAsk) && Number.isFinite(bestBid) ? (bestAsk + bestBid) / 2 : NaN;
                const spreadPct = Number.isFinite(spread) && Number.isFinite(mid) && mid > 0 ? (spread / mid) * 100 : NaN;
                const cumulativeAsks = [] as number[];
                let accA = 0;
                for (const r of asksGrouped) { accA += r.size; cumulativeAsks.push(accA); }
                const cumulativeBids = [] as number[];
                let accB = 0;
                for (const r of bidsGrouped) { accB += r.size; cumulativeBids.push(accB); }
                const maxAskTotal = cumulativeAsks.length ? Math.max(...cumulativeAsks) : 0;
                const maxBidTotal = cumulativeBids.length ? Math.max(...cumulativeBids) : 0;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 text-xs text-muted-foreground px-2">
                      <div>Price</div>
                      <div className="text-right">Size ({anchorSym})</div>
                      <div className="text-right">Total ({anchorSym})</div>
                    </div>
                    <ScrollArea className="h-72 rounded-md border border-glass">
                      <div className="p-1">
                        {asksGrouped.length ? (
                          asksGrouped.map((row, i) => {
                            const price = row.price;
                            const size = row.size;
                            const total = cumulativeAsks[i] || size;
                            const pct = maxAsk > 0 ? Math.min(100, (size / maxAsk) * 100) : 0;
                            const sizePct = maxAsk > 0 ? Math.min(100, (size / maxAsk) * 100) : 0;
                            const totalPct = maxAskTotal > 0 ? Math.min(100, (total / maxAskTotal) * 100) : 0;
                            return (
                              <div key={`ask-${row.id}`} className="relative px-2 py-1">
                                <div className="absolute inset-y-0 left-0 bg-red-900/20 transition-all duration-300 ease-out" style={{ width: `${totalPct}%` }} />
                                <div className="absolute inset-y-0 left-0 bg-red-900/30 transition-all duration-300 ease-out" style={{ width: `${sizePct}%` }} />
                                <div className="relative grid grid-cols-3 text-sm">
                                  <div className="text-red-400">{price.toFixed(6)}</div>
                                  <div className="text-right text-muted-foreground">{size.toFixed(6)}</div>
                                  <div className="text-right text-muted-foreground">{total.toFixed(6)}</div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          asksLoading ? (
                            <div className="space-y-1">
                              <Skeleton className="h-6 w-full" />
                              <Skeleton className="h-6 w-full" />
                              <Skeleton className="h-6 w-full" />
                            </div>
                          ) : (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No asks</div>
                          )
                        )}
                        <div className="px-2 py-1 grid grid-cols-3 text-xs text-muted-foreground border-y border-glass my-1 items-center">
                          <div className="flex items-center gap-2">
                            <button className="px-2 py-1 border rounded" onClick={() => setObSort((v) => !v)}>{obSort ? "Sorted" : "Raw"}</button>
                          </div>
                          <div className="text-center">Anchor {anchorSym}</div>
                          <div className="text-right">{Number.isFinite(mid) ? `Mid ${mid.toFixed(6)}` : "Mid -"}</div>
                        </div>
                        {bidsGrouped.length ? (
                          bidsGrouped.map((row, i) => {
                            const price = row.price;
                            const size = row.size;
                            const total = cumulativeBids[i] || size;
                            const pct = maxBid > 0 ? Math.min(100, (size / maxBid) * 100) : 0;
                            const sizePct = maxBid > 0 ? Math.min(100, (size / maxBid) * 100) : 0;
                            const totalPct = maxBidTotal > 0 ? Math.min(100, (total / maxBidTotal) * 100) : 0;
                            return (
                              <div key={`bid-${row.id}`} className="relative px-2 py-1">
                                <div className="absolute inset-y-0 left-0 bg-green-900/20 transition-all duration-300 ease-out" style={{ width: `${totalPct}%` }} />
                                <div className="absolute inset-y-0 left-0 bg-green-900/30 transition-all duration-300 ease-out" style={{ width: `${sizePct}%` }} />
                                <div className="relative grid grid-cols-3 text-sm">
                                  <div className="text-green-400">{price.toFixed(6)}</div>
                                  <div className="text-right text-muted-foreground">{size.toFixed(6)}</div>
                                  <div className="text-right text-muted-foreground">{total.toFixed(6)}</div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          bidsLoading ? (
                            <div className="space-y-1">
                              <Skeleton className="h-6 w-full" />
                              <Skeleton className="h-6 w-full" />
                              <Skeleton className="h-6 w-full" />
                            </div>
                          ) : (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No bids</div>
                          )
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                );
              })()}
            </div>
          </Card>

          <Card className="bg-card/80 backdrop-blur-xl border-glass">
            <div className="p-4 border-b border-glass flex items-center justify-between">
              <div className="font-semibold">Your Orders</div>
              <div className="text-xs text-muted-foreground">{walletAddress ? walletAddress.slice(0, 6) + "…" + walletAddress.slice(-4) : "Not connected"}</div>
            </div>
            <div className="p-4">
              <Tabs defaultValue="open" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3 bg-purple-900/10 p-1 h-9 rounded-lg border border-purple-500/20">
                  <TabsTrigger value="open" className="text-xs h-7 rounded-md data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 transition-all">Open Orders</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs h-7 rounded-md data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 transition-all">History</TabsTrigger>
                </TabsList>
                <TabsContent value="open">
                  <div className="h-64 overflow-auto rounded-md border border-glass">
                    <div className="min-w-[700px] sm:min-w-[800px]">
                      {/* Header */}
                      <div className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-muted-foreground border-b border-glass sticky top-0 bg-card">
                        <div>Action</div>
                        <div>Token</div>
                        <div className="text-right">Price</div>
                        <div className="text-right">Size</div>
                        <div className="text-center">Status</div>
                        <div className="text-right">Time</div>
                      </div>
                      {/* Data */}
                      <div className="p-1 space-y-1">
                      {Array.isArray(myOrdersResp?.data) && myOrdersResp!.data.filter((o) => {
                        const s = String(o.status || (o as any).state || "open").toLowerCase();
                        return s === "open" || s === "pending";
                      }).length > 0 ? (
                        myOrdersResp!.data.filter((o) => {
                          const s = String(o.status || (o as any).state || "open").toLowerCase();
                          return s === "open" || s === "pending";
                        }).map((ord, i) => {
                          const status = ord.status || (ord as any).state || "open";
                          const inAddr = String(ord.inputToken || "").toLowerCase();
                          const outAddr = String(ord.outputToken || "").toLowerCase();
                          const dec = decimalsMap[inAddr] ?? 18;
                          const rawAmt = typeof ord.inputAmount === "string" ? parseFloat(ord.inputAmount) : Number(ord.inputAmount || 0);
                          const amountHuman = Number.isFinite(rawAmt) ? rawAmt / Math.pow(10, dec) : 0;
                          const sIn = symbolMap[inAddr] || "";
                          const sOut = symbolMap[outAddr] || "";
                          const STABLE = new Set(["USDT","USDC","HNC"]);
                          const anchorAddr = STABLE.has(sIn) ? outAddr : STABLE.has(sOut) ? inAddr : [inAddr, outAddr].sort()[0];
                          const anchorSym = symbolMap[anchorAddr] || "TOKEN";
                          const side = inAddr === anchorAddr ? "sell" : "buy";
                          const priceNum = Number((ord as any).uiPrice ?? ord.price ?? ord.desiredPrice ?? 0);
                          const created = ord.createdAt ? new Date(ord.createdAt) : undefined;
                          const createdStr = created ? (() => { const d = created; const hh = String(d.getHours()).padStart(2, "0"); const mm = String(d.getMinutes()).padStart(2, "0"); const ss = String(d.getSeconds()).padStart(2, "0"); const DD = String(d.getDate()).padStart(2, "0"); const MM = String(d.getMonth() + 1).padStart(2, "0"); const YYYY = String(d.getFullYear()); return `${hh}:${mm}:${ss} ${DD}/${MM}/${YYYY}`; })() : "-";
                          return (
                            <div key={`open-${i}`} className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 hover:bg-muted/20 rounded items-center">
                              <div>
                                <span className={side === "buy" ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{side.toUpperCase()}</span>
                              </div>
                              <div className="text-muted-foreground truncate">{anchorSym}</div>
                              <div className="text-right tabular-nums text-sm">{Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(6) : "-"}</div>
                              <div className="text-right tabular-nums text-sm text-muted-foreground">{amountHuman.toFixed(4)}</div>
                              <div className="flex justify-center">
                                <span className="px-2 py-0.5 rounded bg-muted/40 border border-glass text-xs uppercase">{String(status)}</span>
                              </div>
                              <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">{createdStr}</div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-muted-foreground p-2">No open orders</div>
                      )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="history">
                  <div className="h-64 overflow-auto rounded-md border border-glass">
                    <div className="min-w-[700px] sm:min-w-[800px]">
                      {/* Header */}
                      <div className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-muted-foreground border-b border-glass sticky top-0 bg-card">
                        <div>Action</div>
                        <div>Token</div>
                        <div className="text-right">Price</div>
                        <div className="text-right">Size</div>
                        <div className="text-center">Status</div>
                        <div className="text-right">Time</div>
                      </div>
                      {/* Data */}
                      <div className="p-1 space-y-1">
                      {Array.isArray(myOrdersResp?.data) && myOrdersResp!.data.filter((o) => {
                        const s = String(o.status || (o as any).state || "open").toLowerCase();
                        return s === "filled" || s === "executed" || s === "cancelled" || s === "canceled" || s === "expired";
                      }).length > 0 ? (
                        myOrdersResp!.data.filter((o) => {
                          const s = String(o.status || (o as any).state || "open").toLowerCase();
                          return s === "filled" || s === "executed" || s === "cancelled" || s === "canceled" || s === "expired";
                        }).map((ord, i) => {
                          const status = ord.status || (ord as any).state || "filled";
                          const inAddr = String(ord.inputToken || "").toLowerCase();
                          const outAddr = String(ord.outputToken || "").toLowerCase();
                          const dec = decimalsMap[inAddr] ?? 18;
                          const rawAmt = typeof ord.inputAmount === "string" ? parseFloat(ord.inputAmount) : Number(ord.inputAmount || 0);
                          const amountHuman = Number.isFinite(rawAmt) ? rawAmt / Math.pow(10, dec) : 0;
                          const sIn = symbolMap[inAddr] || "";
                          const sOut = symbolMap[outAddr] || "";
                          const STABLE = new Set(["USDT","USDC","HNC"]);
                          const anchorAddr = STABLE.has(sIn) ? outAddr : STABLE.has(sOut) ? inAddr : [inAddr, outAddr].sort()[0];
                          const anchorSym = symbolMap[anchorAddr] || "TOKEN";
                          const side = inAddr === anchorAddr ? "sell" : "buy";
                          const priceNum = Number((ord as any).uiPrice ?? ord.price ?? ord.desiredPrice ?? 0);
                          const updated = ord.updatedAt ? new Date(ord.updatedAt) : undefined;
                          const updatedStr = updated ? (() => { const d = updated; const hh = String(d.getHours()).padStart(2, "0"); const mm = String(d.getMinutes()).padStart(2, "0"); const ss = String(d.getSeconds()).padStart(2, "0"); const DD = String(d.getDate()).padStart(2, "0"); const MM = String(d.getMonth() + 1).padStart(2, "0"); const YYYY = String(d.getFullYear()); return `${hh}:${mm}:${ss} ${DD}/${MM}/${YYYY}`; })() : "-";
                          return (
                            <div key={`hist-${i}`} className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 hover:bg-muted/20 rounded items-center">
                              <div>
                                <span className={side === "buy" ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>{side.toUpperCase()}</span>
                              </div>
                              <div className="text-muted-foreground truncate">{anchorSym}</div>
                              <div className="text-right tabular-nums text-sm">{Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(6) : "-"}</div>
                              <div className="text-right tabular-nums text-sm text-muted-foreground">{amountHuman.toFixed(4)}</div>
                              <div className="flex justify-center">
                                <span className="px-2 py-0.5 rounded bg-muted/40 border border-glass text-xs uppercase">{String(status)}</span>
                              </div>
                              <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">{updatedStr}</div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-muted-foreground p-2">No history</div>
                      )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </Card>
        </div>
        )}

        {/* Mobile/Tablet Layout: Chart above Swap */}
        <div className="lg:hidden space-y-4">
          <div className="animate-fade-in">
            <Suspense fallback={<Card className="bg-card/80 border-glass p-4"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-48 w-full" /></Card>}>
              <PriceChartLazy 
                key={`${fromToken?.address || fromToken?.symbol || 'from-default'}-${toToken?.address || toToken?.symbol || 'to-default'}`}
                fromToken={fromToken} 
                toToken={toToken} 
                onSelectFromToken={setFromToken}
                onSelectToToken={setToToken}
              />
            </Suspense>
          </div>

          <div className="flex justify-center animate-fade-in">
            <Suspense fallback={<Card className="bg-card/80 border-glass p-4 w-full max-w-xl"><Skeleton className="h-6 w-32 mb-3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-10 w-full mt-3" /></Card>}>
              <SwapCardLazy 
                initialFromAddress={initialFrom}
                initialToAddress={initialTo}
                selectedFromToken={fromToken}
                selectedToToken={toToken}
                onSelectFromToken={setFromToken}
                onSelectToToken={setToToken}
                onTokensChange={(from, to) => {
                  setFromToken(from);
                  setToToken(to);
                }}
                onModeChange={(m) => setIsLimitMode(m === "limit")} 
              />
            </Suspense>
          </div>

          {isLimitMode && (
            <Card className="bg-card/80 backdrop-blur-xl border-glass">
              <div className="p-4 border-b border-glass flex items-center justify-between">
                <div className="font-semibold">Market</div>
                <div className="text-xs text-muted-foreground">{fromToken?.symbol} / {toToken?.symbol}</div>
              </div>
              <div className="p-4">
                <Tabs defaultValue="book" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3 bg-card/60">
                    <TabsTrigger value="book">Order Book</TabsTrigger>
                    <TabsTrigger value="orders">Your Orders</TabsTrigger>
                  </TabsList>
                  <TabsContent value="book">
                    {(() => {
                      const sFrom = symbolMap[String(pairFromAddr || '').toLowerCase()] || fromToken?.symbol || '';
                      const sTo = symbolMap[String(pairToAddr || '').toLowerCase()] || toToken?.symbol || '';
                      const STABLE = new Set(['USDT','USDC','HNC']);
                      const anchorAddr = STABLE.has(sFrom) ? String(pairToAddr || '') : STABLE.has(sTo) ? String(pairFromAddr || '') : [String(pairFromAddr || ''), String(pairToAddr || '')].sort()[0];
                      const anchorSym = symbolMap[String(anchorAddr).toLowerCase()] || 'TOKEN';
                      const anchorDec = decimalsMap[String(anchorAddr).toLowerCase()] ?? 18;
                      const allRaw = [
                        ...(Array.isArray(asksResp?.data) ? asksResp!.data : []),
                        ...(Array.isArray(bidsResp?.data) ? bidsResp!.data : []),
                      ];
                      const asksRaw = allRaw.filter((o) => String(o.inputToken || '').toLowerCase() === String(anchorAddr).toLowerCase());
                      const bidsRaw = allRaw.filter((o) => String(o.outputToken || '').toLowerCase() === String(anchorAddr).toLowerCase());
                      const fDec = (pairFromAddr ? (decimalsMap[(pairFromAddr || '').toLowerCase()] ?? 18) : fromDecimals);
                      const tDec = (pairToAddr ? (decimalsMap[(pairToAddr || '').toLowerCase()] ?? 18) : toDecimals);
                      const asks = asksRaw.map((o) => {
                        const uiPriceNum = o.uiPrice ? (typeof o.uiPrice === 'string' ? parseFloat(o.uiPrice) : Number(o.uiPrice)) : NaN;
                        if (Number.isFinite(uiPriceNum) && uiPriceNum > 0) {
                          const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                          return { id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.uiPrice}-${o.createdAt}`), price: uiPriceNum, size: inAmtRaw / Math.pow(10, anchorDec) };
                        }
                        const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                        const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                        const priceDerived = (inAmtRaw > 0 && outMinRaw > 0)
                          ? (outMinRaw / Math.pow(10, tDec)) / (inAmtRaw / Math.pow(10, fDec))
                          : NaN;
                        return { id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.price}-${o.desiredPrice}-${o.createdAt}`), price: Number(o.price ?? o.desiredPrice ?? priceDerived ?? 0), size: inAmtRaw / Math.pow(10, anchorDec) };
                      }).filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);
                      const bids = bidsRaw.map((o) => {
                        const uiPriceNum = o.uiPrice ? (typeof o.uiPrice === 'string' ? parseFloat(o.uiPrice) : Number(o.uiPrice)) : NaN;
                        if (Number.isFinite(uiPriceNum) && uiPriceNum > 0) {
                          const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                          return { id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.uiPrice}-${o.createdAt}`), price: uiPriceNum, size: outMinRaw / Math.pow(10, anchorDec) };
                        }
                        const inAmtRaw = typeof o.inputAmount === 'string' ? parseFloat(o.inputAmount) : Number(o.inputAmount ?? 0);
                        const outMinRaw = typeof o.minOutputAmount === 'string' ? parseFloat(o.minOutputAmount) : Number(o.minOutputAmount ?? 0);
                        const priceDerived = (inAmtRaw > 0 && outMinRaw > 0)
                          ? (outMinRaw / Math.pow(10, tDec)) / (inAmtRaw / Math.pow(10, fDec))
                          : NaN;
                        return { id: String(o.id || `${o.inputToken}-${o.outputToken}-${o.inputAmount}-${o.price}-${o.desiredPrice}-${o.createdAt}`), price: Number((o as any).uiPrice ?? o.price ?? o.desiredPrice ?? priceDerived ?? 0), size: outMinRaw / Math.pow(10, anchorDec) };
                      }).filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);
                      
                      const asksSorted = [...asks].sort((a, b) => a.price - b.price);
                      const bidsSorted = [...bids].sort((a, b) => b.price - a.price);
                      const asksView = obSort ? asksSorted : asks;
                      const bidsView = obSort ? bidsSorted : bids;
                      const groupByPriceAsc = (arr: { id: string; price: number; size: number }[]) => {
                        const map: Record<string, { id: string; price: number; size: number }> = {};
                        for (const r of arr) {
                          const k = r.price.toFixed(6);
                          if (map[k]) {
                            map[k].size += r.size;
                          } else {
                            map[k] = { id: k, price: Number(k), size: r.size };
                          }
                        }
                        return Object.values(map).sort((a, b) => a.price - b.price);
                      };
                      const groupByPriceDesc = (arr: { id: string; price: number; size: number }[]) => {
                        const map: Record<string, { id: string; price: number; size: number }> = {};
                        for (const r of arr) {
                          const k = r.price.toFixed(6);
                          if (map[k]) {
                            map[k].size += r.size;
                          } else {
                            map[k] = { id: k, price: Number(k), size: r.size };
                          }
                        }
                        return Object.values(map).sort((a, b) => b.price - a.price);
                      };
                      const asksGrouped = groupByPriceAsc(asksView);
                      const bidsGrouped = groupByPriceDesc(bidsView);
                      const askSizes = asksGrouped.map((r) => r.size);
                      const bidSizes = bidsGrouped.map((r) => r.size);
                      const maxAsk = askSizes.length ? Math.max(...askSizes) : 0;
                      const maxBid = bidSizes.length ? Math.max(...bidSizes) : 0;
                      const bestAsk = asksGrouped.length ? asksGrouped[0].price : NaN;
                      const bestBid = bidsGrouped.length ? bidsGrouped[0].price : NaN;
                      const mid = Number.isFinite(bestAsk) && Number.isFinite(bestBid) ? (bestAsk + bestBid) / 2 : NaN;
                      const cumulativeAsks: number[] = [];
                      let accA = 0; for (const r of asksGrouped) { accA += r.size; cumulativeAsks.push(accA); }
                      const cumulativeBids: number[] = [];
                      let accB = 0; for (const r of bidsGrouped) { accB += r.size; cumulativeBids.push(accB); }
                      const maxAskTotal = cumulativeAsks.length ? Math.max(...cumulativeAsks) : 0;
                      const maxBidTotal = cumulativeBids.length ? Math.max(...cumulativeBids) : 0;
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 text-xs text-muted-foreground px-2">
                            <div>Price</div>
                            <div className="text-right">Size ({anchorSym})</div>
                            <div className="text-right">Total ({anchorSym})</div>
                          </div>
                          <ScrollArea className="h-72 rounded-md border border-glass">
                            <div className="p-1">
                        {asksGrouped.length ? (
                          asksGrouped.map((row, i) => {
                                  const price = row.price;
                                  const size = row.size;
                                  const total = cumulativeAsks[i] || size;
                                  const sizePct = maxAsk > 0 ? Math.min(100, (size / maxAsk) * 100) : 0;
                                  const totalPct = maxAskTotal > 0 ? Math.min(100, (total / maxAskTotal) * 100) : 0;
                                  return (
                                    <div key={`ask-mobile-${row.id}`} className="relative px-2 py-1">
                                      <div className="absolute inset-y-0 left-0 bg-red-900/20 transition-all duration-300 ease-out" style={{ width: `${totalPct}%` }} />
                                      <div className="absolute inset-y-0 left-0 bg-red-900/30 transition-all duration-300 ease-out" style={{ width: `${sizePct}%` }} />
                                      <div className="relative grid grid-cols-3 text-sm">
                                        <div className="text-red-400">{price.toFixed(6)}</div>
                                        <div className="text-right text-muted-foreground">{size.toFixed(6)}</div>
                                        <div className="text-right text-muted-foreground">{total.toFixed(6)}</div>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                asksLoading ? (
                                  <div className="space-y-1">
                                    <Skeleton className="h-6 w-full" />
                                    <Skeleton className="h-6 w-full" />
                                    <Skeleton className="h-6 w-full" />
                                  </div>
                                ) : (
                                  <div className="px-2 py-1 text-xs text-muted-foreground">No asks</div>
                                )
                              )}
                              <div className="px-2 py-1 grid grid-cols-3 text-xs text-muted-foreground border-y border-glass my-1 items-center">
                                <div className="flex items-center gap-2">
                                  <button className="px-2 py-1 border rounded" onClick={() => setObSort((v) => !v)}>{obSort ? 'Sorted' : 'Raw'}</button>
                                </div>
                                <div className="text-center">Anchor {anchorSym}</div>
                                <div className="text-right">{Number.isFinite(mid) ? `Mid ${mid.toFixed(6)}` : 'Mid -'}</div>
                              </div>
                        {bidsGrouped.length ? (
                          bidsGrouped.map((row, i) => {
                                  const price = row.price;
                                  const size = row.size;
                                  const total = cumulativeBids[i] || size;
                                  const sizePct = maxBid > 0 ? Math.min(100, (size / maxBid) * 100) : 0;
                                  const totalPct = maxBidTotal > 0 ? Math.min(100, (total / maxBidTotal) * 100) : 0;
                                  return (
                                    <div key={`bid-mobile-${row.id}`} className="relative px-2 py-1">
                                      <div className="absolute inset-y-0 left-0 bg-green-900/20 transition-all duration-300 ease-out" style={{ width: `${totalPct}%` }} />
                                      <div className="absolute inset-y-0 left-0 bg-green-900/30 transition-all duration-300 ease-out" style={{ width: `${sizePct}%` }} />
                                      <div className="relative grid grid-cols-3 text-sm">
                                        <div className="text-green-400">{price.toFixed(6)}</div>
                                        <div className="text-right text-muted-foreground">{size.toFixed(6)}</div>
                                        <div className="text-right text-muted-foreground">{total.toFixed(6)}</div>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                bidsLoading ? (
                                  <div className="space-y-1">
                                    <Skeleton className="h-6 w-full" />
                                    <Skeleton className="h-6 w-full" />
                                    <Skeleton className="h-6 w-full" />
                                  </div>
                                ) : (
                                  <div className="px-2 py-1 text-xs text-muted-foreground">No bids</div>
                                )
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      );
                    })()}
                  </TabsContent>
                  <TabsContent value="orders">
                    <Tabs defaultValue="open" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-3 bg-purple-900/10 p-1 h-9 rounded-lg border border-purple-500/20">
                        <TabsTrigger value="open" className="text-xs h-7 rounded-md data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 transition-all">Open Orders</TabsTrigger>
                        <TabsTrigger value="history" className="text-xs h-7 rounded-md data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 transition-all">History</TabsTrigger>
                      </TabsList>
                      <TabsContent value="open">
                        <div className="h-64 overflow-auto rounded-md border border-glass">
                          <div className="min-w-[700px] sm:min-w-[800px]">
                            <div className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-muted-foreground border-b border-glass sticky top-0 bg-card">
                              <div>Action</div>
                              <div>Token</div>
                              <div className="text-right">Price</div>
                              <div className="text-right">Size</div>
                              <div className="text-center">Status</div>
                              <div className="text-right">Time</div>
                            </div>
                            <div className="p-1 space-y-1">
                              {Array.isArray(myOrdersResp?.data) && myOrdersResp!.data.filter((o) => {
                                const s = String(o.status || (o as any).state || 'open').toLowerCase();
                                return s === 'open' || s === 'pending';
                              }).length > 0 ? (
                                myOrdersResp!.data.filter((o) => {
                                  const s = String(o.status || (o as any).state || 'open').toLowerCase();
                                  return s === 'open' || s === 'pending';
                                }).map((ord, i) => {
                                  const status = ord.status || (ord as any).state || 'open';
                                  const inAddr = String(ord.inputToken || '').toLowerCase();
                                  const outAddr = String(ord.outputToken || '').toLowerCase();
                                  const dec = decimalsMap[inAddr] ?? 18;
                                  const rawAmt = typeof ord.inputAmount === 'string' ? parseFloat(ord.inputAmount) : Number(ord.inputAmount || 0);
                                  const amountHuman = Number.isFinite(rawAmt) ? rawAmt / Math.pow(10, dec) : 0;
                                  const sIn = symbolMap[inAddr] || '';
                                  const sOut = symbolMap[outAddr] || '';
                                  const STABLE = new Set(['USDT','USDC','HNC']);
                                  const anchorAddr = STABLE.has(sIn) ? outAddr : STABLE.has(sOut) ? inAddr : [inAddr, outAddr].sort()[0];
                                  const anchorSym = symbolMap[anchorAddr] || 'TOKEN';
                                  const side = inAddr === anchorAddr ? 'sell' : 'buy';
                                  const priceNum = Number((ord as any).uiPrice ?? ord.price ?? ord.desiredPrice ?? 0);
                                  const created = ord.createdAt ? new Date(ord.createdAt) : undefined;
                                  const createdStr = created ? (() => { const d = created; const hh = String(d.getHours()).padStart(2, '0'); const mm = String(d.getMinutes()).padStart(2, '0'); const ss = String(d.getSeconds()).padStart(2, '0'); const DD = String(d.getDate()).padStart(2, '0'); const MM = String(d.getMonth() + 1).padStart(2, '0'); const YYYY = String(d.getFullYear()); return `${hh}:${mm}:${ss} ${DD}/${MM}/${YYYY}`; })() : '-';
                                  return (
                                    <div key={`open-mobile-${i}`} className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 hover:bg-muted/20 rounded items-center">
                                      <div>
                                        <span className={side === 'buy' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{side.toUpperCase()}</span>
                                      </div>
                                      <div className="text-muted-foreground truncate">{anchorSym}</div>
                                      <div className="text-right tabular-nums text-sm">{Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(6) : '-'}</div>
                                      <div className="text-right tabular-nums text-sm text-muted-foreground">{amountHuman.toFixed(4)}</div>
                                      <div className="flex justify-center">
                                        <span className="px-2 py-0.5 rounded bg-muted/40 border border-glass text-xs uppercase">{String(status)}</span>
                                      </div>
                                      <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">{createdStr}</div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-xs text-muted-foreground p-2">No open orders</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                      <TabsContent value="history">
                        <div className="h-64 overflow-auto rounded-md border border-glass">
                          <div className="min-w-[700px] sm:min-w-[800px]">
                            <div className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-muted-foreground border-b border-glass sticky top-0 bg-card">
                              <div>Action</div>
                              <div>Token</div>
                              <div className="text-right">Price</div>
                              <div className="text-right">Size</div>
                              <div className="text-center">Status</div>
                              <div className="text-right">Time</div>
                            </div>
                            <div className="p-1 space-y-1">
                              {Array.isArray(myOrdersResp?.data) && myOrdersResp!.data.filter((o) => {
                                const s = String(o.status || (o as any).state || 'open').toLowerCase();
                                return s === 'filled' || s === 'executed' || s === 'cancelled' || s === 'canceled' || s === 'expired';
                              }).length > 0 ? (
                                myOrdersResp!.data.filter((o) => {
                                  const s = String(o.status || (o as any).state || 'open').toLowerCase();
                                  return s === 'filled' || s === 'executed' || s === 'cancelled' || s === 'canceled' || s === 'expired';
                                }).map((ord, i) => {
                                  const status = ord.status || (ord as any).state || 'filled';
                                  const inAddr = String(ord.inputToken || '').toLowerCase();
                                  const outAddr = String(ord.outputToken || '').toLowerCase();
                                  const dec = decimalsMap[inAddr] ?? 18;
                                  const rawAmt = typeof ord.inputAmount === 'string' ? parseFloat(ord.inputAmount) : Number(ord.inputAmount || 0);
                                  const amountHuman = Number.isFinite(rawAmt) ? rawAmt / Math.pow(10, dec) : 0;
                                  const sIn = symbolMap[inAddr] || '';
                                  const sOut = symbolMap[outAddr] || '';
                                  const STABLE = new Set(['USDT','USDC','HNC']);
                                  const anchorAddr = STABLE.has(sIn) ? outAddr : STABLE.has(sOut) ? inAddr : [inAddr, outAddr].sort()[0];
                                  const anchorSym = symbolMap[anchorAddr] || 'TOKEN';
                                  const side = inAddr === anchorAddr ? 'sell' : 'buy';
                                  const priceNum = Number((ord as any).uiPrice ?? ord.price ?? ord.desiredPrice ?? 0);
                                  const updated = ord.updatedAt ? new Date(ord.updatedAt) : undefined;
                                  const updatedStr = updated ? (() => { const d = updated; const hh = String(d.getHours()).padStart(2, '0'); const mm = String(d.getMinutes()).padStart(2, '0'); const ss = String(d.getSeconds()).padStart(2, '0'); const DD = String(d.getDate()).padStart(2, '0'); const MM = String(d.getMonth() + 1).padStart(2, '0'); const YYYY = String(d.getFullYear()); return `${hh}:${mm}:${ss} ${DD}/${MM}/${YYYY}`; })() : '-';
                                  return (
                                    <div key={`hist-mobile-${i}`} className="grid grid-cols-[80px_80px_110px_100px_100px_160px] gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 hover:bg-muted/20 rounded items-center">
                                      <div>
                                        <span className={side === 'buy' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{side.toUpperCase()}</span>
                                      </div>
                                      <div className="text-muted-foreground truncate">{anchorSym}</div>
                                      <div className="text-right tabular-nums text-sm">{Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(6) : '-'}</div>
                                      <div className="text-right tabular-nums text-sm text-muted-foreground">{amountHuman.toFixed(4)}</div>
                                      <div className="flex justify-center">
                                        <span className="px-2 py-0.5 rounded bg-muted/40 border border-glass text-xs uppercase">{String(status)}</span>
                                      </div>
                                      <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">{updatedStr}</div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-xs text-muted-foreground p-2">No history</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Swap;
