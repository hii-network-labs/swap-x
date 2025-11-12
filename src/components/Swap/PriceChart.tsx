import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Token } from "./TokenSelector";
import { Loader2 } from "lucide-react";

interface PriceChartProps {
  fromToken: Token | null;
  toToken: Token | null;
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

export const PriceChart = ({ fromToken, toToken }: PriceChartProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("7");
  const [isPriceIncreasing, setIsPriceIncreasing] = useState<boolean | null>(null);
  const previousRateRef = useRef<number | null>(null);

  // Default tokens so the chart loads immediately on first render
  const DEFAULT_FROM: Token = {
    symbol: "ETH",
    name: "Ethereum",
    logo: "⟠",
    address: "0x0000000000000000000000000000000000000000",
    coingeckoId: "ethereum",
  };
  const DEFAULT_TO: Token = {
    symbol: "USDC",
    name: "USD Coin",
    logo: "💵",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    coingeckoId: "usd-coin",
  };
  // Use selected pair only when BOTH tokens are chosen; otherwise use defaults
  const haveSelectedPair = !!(fromToken && toToken);
  const baseFrom = haveSelectedPair ? fromToken! : DEFAULT_FROM;
  const baseTo = haveSelectedPair ? toToken! : DEFAULT_TO;

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
  const firstRate = chartData.length > 0 ? chartData[0].rate : 0;
  const priceChange = firstRate > 0 ? ((currentRate - firstRate) / firstRate) * 100 : 0;

  // Track price changes for color animation - MUST be before early return
  useEffect(() => {
    if (currentRate > 0 && previousRateRef.current !== null) {
      setIsPriceIncreasing(currentRate > previousRateRef.current);
    }
    previousRateRef.current = currentRate;
  }, [currentRate]);

  // If tokens are not selected, chart still loads with defaults

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 relative z-10 w-full">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg">
            {baseFrom.symbol}/{baseTo.symbol}
          </h3>
          {!isLoading && chartData.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span 
                className={`text-2xl font-bold transition-all duration-500 whitespace-nowrap ${
                  isPriceIncreasing === true ? 'text-green-500 animate-pulse' : 
                  isPriceIncreasing === false ? 'text-red-500 animate-pulse' : ''
                }`}
              >
                {currentRate.toFixed(6)}
              </span>
              <span 
                className={`text-sm font-medium transition-colors duration-300 whitespace-nowrap ${
                  priceChange >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0 ml-auto">
          <Button
            variant={timeRange === "1" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("1")}
          >
            24H
          </Button>
          <Button
            variant={timeRange === "7" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("7")}
          >
            7D
          </Button>
          <Button
            variant={timeRange === "30" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeRange("30")}
          >
            30D
          </Button>
        </div>
      </div>

      <div className="relative z-0 mt-2">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 15 }}>
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
            width={90}
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

      <div className="grid grid-cols-3 gap-4 pt-4 border-t text-sm">
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
