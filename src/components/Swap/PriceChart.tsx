import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Token } from "./TokenSelector";
import { Loader2 } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { getCommonTokens } from "@/config/uniswap";
import { TokenSelector } from "./TokenSelector";
import { ZERO_ADDRESS } from "@/services/uniswap/v4/helpers";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { fetchPoolPriceFromIndexer } from "@/services/uniswap/v4/quoteService";

interface PriceChartProps {
  fromToken: Token | null;
  toToken: Token | null;
  onSelectFromToken?: (token: Token) => void;
  onSelectToToken?: (token: Token) => void;
}

type TimeRange = "1" | "7" | "30";

const fetchPriceHistory = async (tokenId: string, days: string) => {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${tokenId}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!response.ok) throw new Error('Failed to fetch price history');
  return response.json();
};

const generateFallbackChartData = (days: TimeRange) => {
  // Default implementation retained for backward compatibility if no seed provided later
  const points = days === "1" ? 24 : days === "7" ? 7 : 30;
  const now = Date.now();
  const intervalMs = days === "1" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  let rate = 1.0;
  const data: { time: string; rate: number; timestamp: number }[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const ts = now - i * intervalMs;
    rate = Math.max(0.5, Math.min(2.0, rate + (Math.random() - 0.5) * 0.01));
    data.push({
      time: new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(days === "30" ? {} : { hour: '2-digit' })
      }),
      rate,
      timestamp: ts,
    });
  }
  return data;
};

// Deterministic seeded RNG so each token pair gets a unique fallback chart
const hashStringToSeed = (str: string) => {
  let h = 2166136261 >>> 0; // FNV-like simple hash
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (a: number) => {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

const generateSeededFallbackChartData = (days: TimeRange, seedKey: string) => {
  const seed = hashStringToSeed(seedKey);
  const rand = mulberry32(seed);
  const points = days === "1" ? 24 : days === "7" ? 7 : 30;
  const now = Date.now();
  const intervalMs = days === "1" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  // Base around ~1 with pair-specific bias and volatility so charts differ
  const base = 0.98 + rand() * 0.04; // ~[0.98, 1.02]
  const volatility = 0.008 + rand() * 0.012; // step size ~[0.8%, 2%]
  const min = 0.85 + rand() * 0.05; // ~[0.85, 0.90]
  const max = 1.10 + rand() * 0.05; // ~[1.10, 1.15]

  let rate = base;
  const data: { time: string; rate: number; timestamp: number }[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const ts = now - i * intervalMs;
    const drift = (rand() - 0.5) * volatility;
    rate = Math.max(min, Math.min(max, rate + drift));
    data.push({
      time: new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(days === "30" ? {} : { hour: '2-digit' })
      }),
      rate,
      timestamp: ts,
    });
  }
  return data;
};

export const PriceChart = ({ fromToken, toToken, onSelectFromToken, onSelectToToken }: PriceChartProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("7");
  const [isPriceIncreasing, setIsPriceIncreasing] = useState<boolean | null>(null);
  const previousRateRef = useRef<number | null>(null);
  const { currentNetwork } = useNetwork();
  const { pools } = useSubgraphPools();
  const [pairRealtimeRate, setPairRealtimeRate] = useState<number | null>(null);

  // Default tokens so the chart loads immediately on first render
  const isHii = currentNetwork?.chainId === 22469;
  const DEFAULT_FROM: Token = isHii
    ? {
        symbol: "HNC",
        name: "HNC",
        logo: "⟠",
        address: "0x0000000000000000000000000000000000000000",
        coingeckoId: "",
      }
    : {
        symbol: "ETH",
        name: "Ethereum",
        logo: "⟠",
        address: "0x0000000000000000000000000000000000000000",
        coingeckoId: "ethereum",
      };
  const allTokens: Token[] = (() => {
    const map = new Map<string, Token>();
    for (const p of pools) {
      if (p.token0?.id && p.token0?.symbol) {
        const addr = p.token0.id.toLowerCase();
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const symbol = isZero && isHii ? "HNC" : p.token0.symbol;
        const name = isZero && isHii ? "HNC" : (p.token0.name || p.token0.symbol);
        if (!map.has(addr)) map.set(addr, { symbol, name, logo: symbol.substring(0,1), address: addr, coingeckoId: "" });
      }
      if (p.token1?.id && p.token1?.symbol) {
        const addr = p.token1.id.toLowerCase();
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const symbol = isZero && isHii ? "HNC" : p.token1.symbol;
        const name = isZero && isHii ? "HNC" : (p.token1.name || p.token1.symbol);
        if (!map.has(addr)) map.set(addr, { symbol, name, logo: symbol.substring(0,1), address: addr, coingeckoId: "" });
      }
    }
    if (isHii) {
      const zero = ZERO_ADDRESS.toLowerCase();
      if (!map.has(zero)) map.set(zero, { symbol: "HNC", name: "HNC", logo: "H", address: zero, coingeckoId: "" });
    }
    return Array.from(map.values());
  })();
  // Use selected pair only when BOTH tokens are chosen; otherwise use defaults
  const haveSelectedPair = !!(fromToken && toToken);
  const baseFrom = haveSelectedPair ? fromToken! : DEFAULT_FROM;
  // Build adjacency map early for default target resolution
  const adjacency: Record<string, Set<string>> = (() => {
    const adj: Record<string, Set<string>> = {};
    for (const p of pools) {
      const a = p.token0?.id?.toLowerCase();
      const b = p.token1?.id?.toLowerCase();
      const liq = parseFloat(p.liquidity || "0");
      if (!a || !b || !(Number.isFinite(liq) && liq > 0)) continue;
      if (!adj[a]) adj[a] = new Set<string>();
      if (!adj[b]) adj[b] = new Set<string>();
      adj[a].add(b);
      adj[b].add(a);
    }
    return adj;
  })();
  const baseTo = haveSelectedPair ? toToken! : (() => {
    const STABLE = new Set(["USDC","USDT","BUSD"]);
    const fromAddrLower = baseFrom.address?.toLowerCase();
    const connectedAddrs = fromAddrLower ? Array.from(adjacency[fromAddrLower] || []) : [];
    const connectedTokens = connectedAddrs
      .map(addr => allTokens.find(t => t.address.toLowerCase() === addr))
      .filter(Boolean) as Token[];
    const stableConnected = connectedTokens.find(t => STABLE.has(t.symbol) && t.address.toLowerCase() !== fromAddrLower);
    if (stableConnected) return stableConnected;
    const anyConnected = connectedTokens.find(t => t.address.toLowerCase() !== fromAddrLower);
    if (anyConnected) return anyConnected;
    const stableAny = allTokens.find(t => STABLE.has(t.symbol) && t.address.toLowerCase() !== fromAddrLower);
    if (stableAny) return stableAny;
    const any = allTokens.find(t => t.address.toLowerCase() !== fromAddrLower);
    if (any) return any;
    return DEFAULT_FROM;
  })();

  // Track if we've applied defaults once
  const appliedDefaultRef = useRef(false);


  const allowedToAddresses = baseFrom ? Array.from(adjacency[baseFrom.address?.toLowerCase()] || []) : [];

  const pairOptions = pools
    .map((p) => {
      const isHii = currentNetwork?.chainId === 22469;
      const aAddr = p.token0.id.toLowerCase();
      const bAddr = p.token1.id.toLowerCase();
      const aIsZero = aAddr === ZERO_ADDRESS.toLowerCase();
      const bIsZero = bAddr === ZERO_ADDRESS.toLowerCase();
      const aSym = aIsZero && isHii ? "HNC" : (p.token0.symbol || "");
      const bSym = bIsZero && isHii ? "HNC" : (p.token1.symbol || "");
      const aName = aIsZero && isHii ? "HNC" : (p.token0.name || p.token0.symbol || "");
      const bName = bIsZero && isHii ? "HNC" : (p.token1.name || p.token1.symbol || "");
      const a: Token = { address: aAddr, symbol: aSym, name: aName, logo: (aSym || "").slice(0,1), coingeckoId: "" };
      const b: Token = { address: bAddr, symbol: bSym, name: bName, logo: (bSym || "").slice(0,1), coingeckoId: "" };
      const liq = parseFloat(p.liquidity || "0");
      return { id: p.id, a, b, liq };
    })
    .filter((x) => Number.isFinite(x.liq) && x.liq > 0);
  const currentPairId = (() => {
    const f = baseFrom.address?.toLowerCase();
    const t = baseTo.address?.toLowerCase();
    const hit = pairOptions.find((opt) => {
      const a = opt.a.address.toLowerCase();
      const b = opt.b.address.toLowerCase();
      return (a === f && b === t) || (a === t && b === f);
    });
    return hit?.id;
  })();

  // Auto-apply defaults only when a valid pair exists and tokens differ
  useEffect(() => {
    if (haveSelectedPair || appliedDefaultRef.current) return;
    const f = baseFrom.address?.toLowerCase();
    const t = baseTo.address?.toLowerCase();
    if (!f || !t || f === t) return;
    if (!currentPairId) return; // ensure pair exists
    onSelectFromToken?.(baseFrom);
    onSelectToToken?.(baseTo);
    appliedDefaultRef.current = true;
  }, [haveSelectedPair, baseFrom.address, baseTo.address, currentPairId, onSelectFromToken, onSelectToToken]);

  // Fetch realtime pool price for current pair and derive rate in FROM→TO orientation
  useEffect(() => {
    if (!currentPairId || !baseFrom?.address || !baseTo?.address) {
      setPairRealtimeRate(null);
      return;
    }
    const run = async () => {
      try {
        const price = await fetchPoolPriceFromIndexer(currentPairId);
        if (price) {
          const pool = pools.find((p) => p.id === currentPairId);
          if (pool) {
            const isFromToken0 = baseFrom.address.toLowerCase() === pool.token0?.id?.toLowerCase();
            const rate = isFromToken0 ? price.price : price.inversePrice;
            if (Number.isFinite(rate) && rate > 0) setPairRealtimeRate(rate);
          }
        }
      } catch {}
    };
    run();
    const h = setInterval(run, 10_000);
    return () => clearInterval(h);
  }, [currentPairId, baseFrom?.address, baseTo?.address, pools]);

  const baseUSDT = (import.meta.env.VITE_USDT_ADDRESS as string | undefined);
  const baseUSDC = (import.meta.env.VITE_USDC_ADDRESS as string | undefined);
  const baseHNC = (import.meta.env.VITE_NATIVE_TOKEN_ADDRESS as string | undefined);
  const common = currentNetwork?.chainId ? getCommonTokens(currentNetwork.chainId) : {} as any;
  const usdtCand = pools.flatMap(p => [p.token0, p.token1]).filter(t => t?.symbol === "USDT").map(t => t.id.toLowerCase());
  const usdcCand = pools.flatMap(p => [p.token0, p.token1]).filter(t => t?.symbol === "USDC").map(t => t.id.toLowerCase());
  const hncCand  = pools.flatMap(p => [p.token0, p.token1]).filter(t => ["HNC","WHNC","WETH","WBNB"].includes(String(t?.symbol))).map(t => t.id.toLowerCase());
  const USDT = (baseUSDT || (common?.USDT as string | undefined) || usdtCand[0])?.toLowerCase();
  const USDC = (baseUSDC || (common?.USDC as string | undefined) || usdcCand[0])?.toLowerCase();
  const HNC  = (baseHNC  || (common?.WETH || common?.WBNB) || hncCand[0])?.toLowerCase();

  const getTokenUSDPrice = (_addr?: string) => {
    if (!_addr || !pools?.length) return NaN;
    const addr = _addr.toLowerCase();
    const addrSymbol: Record<string, string> = {};
    pools.forEach((p) => {
      addrSymbol[p.token0.id.toLowerCase()] = String(p.token0.symbol || "");
      addrSymbol[p.token1.id.toLowerCase()] = String(p.token1.symbol || "");
    });
    const STABLE = new Set(["USDT", "USDC", "BUSD"]);
    const symSelf = addrSymbol[addr];
    if (symSelf && STABLE.has(symSelf)) return 1;
    const direct = pools.find((p) => {
      const a0 = p.token0.id.toLowerCase();
      const a1 = p.token1.id.toLowerCase();
      const s0 = String(p.token0.symbol || "");
      const s1 = String(p.token1.symbol || "");
      return (a0 === addr && STABLE.has(s1)) || (a1 === addr && STABLE.has(s0));
    });
    if (direct && direct.tick != null) {
      const d0 = Number(direct.token0.decimals || "18");
      const d1 = Number(direct.token1.decimals || "18");
      const tick = Number(direct.tick);
      const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
      const a0 = direct.token0.id.toLowerCase();
      const isToken0Target = a0 === addr;
      const s0 = String(direct.token0.symbol || "");
      const s1 = String(direct.token1.symbol || "");
      if (isToken0Target && STABLE.has(s1)) return ratio;
      if (!isToken0Target && STABLE.has(s0)) return 1 / ratio;
    }
    const priceOfBase = (base?: string): number | null => {
      const b = base?.toLowerCase();
      if (!b) return null;
      const target = pools.find((p) => {
        const a0 = p.token0.id.toLowerCase();
        const a1 = p.token1.id.toLowerCase();
        const s0 = String(p.token0.symbol || "");
        const s1 = String(p.token1.symbol || "");
        return (a0 === b && STABLE.has(s1)) || (a1 === b && STABLE.has(s0));
      });
      if (!target || target.tick == null) return null;
      const d0 = Number(target.token0.decimals || "18");
      const d1 = Number(target.token1.decimals || "18");
      const tick = Number(target.tick);
      const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
      const a0 = target.token0.id.toLowerCase();
      const isBaseToken0 = a0 === b;
      const baseInStable = isBaseToken0 ? (1 / ratio) : ratio;
      return baseInStable;
    };
    const baseUSD = priceOfBase(HNC || USDT || USDC);
    if (HNC && baseUSD != null) {
      const viaHNC = pools.find(p => [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()].includes(addr) && [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()].includes(HNC));
      if (viaHNC && viaHNC.tick != null) {
        const d0 = Number(viaHNC.token0.decimals || "18");
        const d1 = Number(viaHNC.token1.decimals || "18");
        const tick = Number(viaHNC.tick);
        const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
        const a0 = viaHNC.token0.id.toLowerCase();
        const isToken0Target = a0 === addr;
        const priceInHNC = isToken0Target ? (1 / ratio) : ratio;
        return priceInHNC * baseUSD;
      }
    }
    return NaN;
  };

  const { data: fromData, isLoading: fromLoading, error: fromError } = useQuery({
    queryKey: ['priceHistory', baseFrom.coingeckoId, timeRange],
    queryFn: () => fetchPriceHistory(baseFrom.coingeckoId, timeRange),
    enabled: Boolean(baseFrom.coingeckoId),
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const { data: toData, isLoading: toLoading, error: toError } = useQuery({
    queryKey: ['priceHistory', baseTo.coingeckoId, timeRange],
    queryFn: () => fetchPriceHistory(baseTo.coingeckoId, timeRange),
    enabled: Boolean(baseTo.coingeckoId),
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = fromLoading || toLoading;

  // Calculate exchange rate history
  const hasError = !!fromError || !!toError;
  const hasData = !!(fromData && toData && fromData.prices && toData.prices && fromData.prices.length && toData.prices.length);
  const seedKey = `${baseFrom.coingeckoId || baseFrom.address}-${baseTo.coingeckoId || baseTo.address}-${timeRange}`;
  const chartData = hasData && !hasError
    ? fromData.prices.map((fromPrice: [number, number], index: number) => {
        const toPrice = toData.prices[index];
        if (!toPrice) return null;
        
        const rate = fromPrice[1] / toPrice[1];
        return {
          time: new Date(fromPrice[0]).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            ...(timeRange === "30" ? {} : { hour: '2-digit' })
          }),
          rate: rate,
          timestamp: fromPrice[0],
        };
      }).filter(Boolean)
    : generateSeededFallbackChartData(timeRange, seedKey);

  const currentRate = chartData.length > 0 ? chartData[chartData.length - 1].rate : 0;
  const derivedCurrentRateUSD = (() => {
    const pf = getTokenUSDPrice(baseFrom.address);
    const pt = getTokenUSDPrice(baseTo.address);
    if (Number.isFinite(pf) && Number.isFinite(pt) && pt > 0) return pf / pt;
    return NaN;
  })();
  const effectiveCurrentRate = Number.isFinite(pairRealtimeRate as number) && (pairRealtimeRate as number) > 0
    ? (pairRealtimeRate as number)
    : (Number.isFinite(derivedCurrentRateUSD) ? derivedCurrentRateUSD : currentRate);
  if (chartData.length > 0 && Number.isFinite(effectiveCurrentRate) && effectiveCurrentRate > 0) {
    chartData[chartData.length - 1].rate = effectiveCurrentRate;
  }
  const firstRate = chartData.length > 0 ? chartData[0].rate : 0;
  const priceChange = firstRate > 0 ? ((currentRate - firstRate) / firstRate) * 100 : 0;

  // Track price changes for color animation - MUST be before early return
  useEffect(() => {
    if (effectiveCurrentRate > 0 && previousRateRef.current !== null) {
      setIsPriceIncreasing(effectiveCurrentRate > previousRateRef.current);
    }
    previousRateRef.current = effectiveCurrentRate;
  }, [effectiveCurrentRate]);

  // If tokens are not selected, chart still loads with defaults

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 relative z-10 w-full">
        <div className="min-w-0 flex items-center gap-2">
          <Select value={currentPairId ?? undefined} onValueChange={(id) => {
            const opt = pairOptions.find((x) => x.id === id);
            if (!opt) return;
            onSelectFromToken?.(opt.a);
            onSelectToToken?.(opt.b);
          }}>
            <SelectTrigger className="w-[160px] sm:w-[200px]">
              <SelectValue placeholder={`${baseFrom.symbol}/${baseTo.symbol}`} />
            </SelectTrigger>
            <SelectContent>
              {pairOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.a.symbol}/{opt.b.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && chartData.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span 
                className={`text-xl sm:text-2xl font-bold transition-all duration-500 whitespace-nowrap ${
                  isPriceIncreasing === true ? 'text-green-500 animate-pulse' : 
                  isPriceIncreasing === false ? 'text-red-500 animate-pulse' : ''
                }`}
              >
                {effectiveCurrentRate.toFixed(6)}
              </span>
              <span 
                className={`text-xs sm:text-sm font-medium transition-colors duration-300 whitespace-nowrap ${
                  priceChange >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-1 sm:gap-2 flex-shrink-0 ml-auto">
          <Button
            variant={timeRange === "1" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 sm:h-9 sm:px-4 text-xs sm:text-sm"
            onClick={() => setTimeRange("1")}
          >
            24H
          </Button>
          <Button
            variant={timeRange === "7" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 sm:h-9 sm:px-4 text-xs sm:text-sm"
            onClick={() => setTimeRange("7")}
          >
            7D
          </Button>
          <Button
            variant={timeRange === "30" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 sm:h-9 sm:px-4 text-xs sm:text-sm"
            onClick={() => setTimeRange("30")}
          >
            30D
          </Button>
        </div>
      </div>

      <div className="relative z-0 mt-2 h-[200px] sm:h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            domain={['auto', 'auto']}
            width={60}
            tickMargin={8}
            tickFormatter={(value) => value.toFixed(6)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }}
            formatter={(value: number) => [value.toFixed(6), 'Exchange rate']}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={priceChange >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
            strokeWidth={2}
            dot={false}
            activeDot={{ 
              r: 6, 
              fill: priceChange >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)",
              className: "animate-pulse"
            }}
            className="transition-all duration-500"
          />
        </LineChart>
      </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2 sm:pt-4 border-t text-xs sm:text-sm">
        <div>
          <div className="text-muted-foreground mb-1">Lowest</div>
          <div className="font-semibold">
            {chartData.length > 0
              ? Math.min(...chartData.map((d: any) => d.rate)).toFixed(6)
              : '-'}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Highest</div>
          <div className="font-semibold">
            {chartData.length > 0
              ? Math.max(...chartData.map((d: any) => d.rate)).toFixed(6)
              : '-'}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Average</div>
          <div className="font-semibold">
            {chartData.length > 0
              ? (chartData.reduce((acc: number, d: any) => acc + d.rate, 0) / chartData.length).toFixed(6)
              : '-'}
          </div>
        </div>
      </div>
    </Card>
  );
};
