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

export const PriceChart = ({ fromToken, toToken }: PriceChartProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("7");
  const [isPriceIncreasing, setIsPriceIncreasing] = useState<boolean | null>(null);
  const previousRateRef = useRef<number | null>(null);

  const { data: fromData, isLoading: fromLoading } = useQuery({
    queryKey: ['priceHistory', fromToken?.coingeckoId, timeRange],
    queryFn: () => fetchPriceHistory(fromToken!.coingeckoId, timeRange),
    enabled: !!fromToken,
  });

  const { data: toData, isLoading: toLoading } = useQuery({
    queryKey: ['priceHistory', toToken?.coingeckoId, timeRange],
    queryFn: () => fetchPriceHistory(toToken!.coingeckoId, timeRange),
    enabled: !!toToken,
  });

  if (!fromToken || !toToken) {
    return (
      <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
        <div className="text-center text-muted-foreground">
          Chọn cả hai token để xem biểu đồ giá
        </div>
      </Card>
    );
  }

  const isLoading = fromLoading || toLoading;

  // Calculate exchange rate history
  const chartData = fromData && toData
    ? fromData.prices.map((fromPrice: [number, number], index: number) => {
        const toPrice = toData.prices[index];
        if (!toPrice) return null;
        
        const rate = fromPrice[1] / toPrice[1];
        return {
          time: new Date(fromPrice[0]).toLocaleDateString('vi-VN', {
            month: 'short',
            day: 'numeric',
            ...(timeRange === "30" ? {} : { hour: '2-digit' })
          }),
          rate: rate,
          timestamp: fromPrice[0],
        };
      }).filter(Boolean)
    : [];

  const currentRate = chartData.length > 0 ? chartData[chartData.length - 1].rate : 0;
  const firstRate = chartData.length > 0 ? chartData[0].rate : 0;
  const priceChange = firstRate > 0 ? ((currentRate - firstRate) / firstRate) * 100 : 0;

  // Track price changes for color animation
  useEffect(() => {
    if (currentRate > 0 && previousRateRef.current !== null) {
      setIsPriceIncreasing(currentRate > previousRateRef.current);
    }
    previousRateRef.current = currentRate;
  }, [currentRate]);

  return (
    <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">
            {fromToken.symbol}/{toToken.symbol}
          </h3>
          {!isLoading && chartData.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span 
                className={`text-2xl font-bold transition-all duration-500 ${
                  isPriceIncreasing === true ? 'text-green-500 animate-pulse' : 
                  isPriceIncreasing === false ? 'text-red-500 animate-pulse' : ''
                }`}
              >
                {currentRate.toFixed(6)}
              </span>
              <span 
                className={`text-sm font-medium transition-colors duration-300 ${
                  priceChange >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
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

      {isLoading ? (
        <div className="h-[300px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
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
              tickFormatter={(value) => value.toFixed(6)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value.toFixed(6), 'Tỷ giá']}
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
      )}

      <div className="grid grid-cols-3 gap-4 pt-4 border-t text-sm">
        <div>
          <div className="text-muted-foreground mb-1">Thấp nhất</div>
          <div className="font-semibold">
            {chartData.length > 0
              ? Math.min(...chartData.map((d: any) => d.rate)).toFixed(6)
              : '-'}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Cao nhất</div>
          <div className="font-semibold">
            {chartData.length > 0
              ? Math.max(...chartData.map((d: any) => d.rate)).toFixed(6)
              : '-'}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Trung bình</div>
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
