import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { TokenSelector, Token } from "./TokenSelector";
import { SlippageSettings } from "./SlippageSettings";
import { SwapConfirmDialog } from "./SwapConfirmDialog";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { saveTransaction } from "@/types/transaction";

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
}

export const SwapCard = ({ onTokensChange }: SwapCardProps) => {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);

  useEffect(() => {
    onTokensChange?.(fromToken, toToken);
  }, [fromToken, toToken, onTokensChange]);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isFromInput, setIsFromInput] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [slippage, setSlippage] = useState(0.5);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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
    fromToken && toToken && prices?.[fromToken.coingeckoId]?.usd && prices?.[toToken.coingeckoId]?.usd
      ? prices[fromToken.coingeckoId].usd / prices[toToken.coingeckoId].usd
      : null;

  // Auto-calculate output amount
  useEffect(() => {
    if (!exchangeRate || !fromToken || !toToken) return;

    if (isFromInput && fromAmount) {
      const calculated = (parseFloat(fromAmount) * exchangeRate).toFixed(6);
      setToAmount(calculated);
    } else if (!isFromInput && toAmount) {
      const calculated = (parseFloat(toAmount) / exchangeRate).toFixed(6);
      setFromAmount(calculated);
    }
  }, [fromAmount, toAmount, exchangeRate, isFromInput, fromToken, toToken]);

  const handleFromAmountChange = (value: string) => {
    setIsFromInput(true);
    setFromAmount(value);
  };

  const handleToAmountChange = (value: string) => {
    setIsFromInput(false);
    setToAmount(value);
  };

  const handleSwap = () => {
    if (!fromToken || !toToken || !fromAmount) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmSwap = () => {
    if (!fromToken || !toToken || !fromAmount || !toAmount || !exchangeRate) return;

    const fromPrice = prices?.[fromToken.coingeckoId]?.usd || 0;
    const valueUsd = parseFloat(fromAmount) * fromPrice;

    // Save transaction to localStorage
    saveTransaction({
      fromToken: {
        symbol: fromToken.symbol,
        logo: fromToken.logo,
        amount: fromAmount,
      },
      toToken: {
        symbol: toToken.symbol,
        logo: toToken.logo,
        amount: toAmount,
      },
      exchangeRate,
      slippage,
      valueUsd,
    });

    setShowConfirmDialog(false);
    toast.success("Giao dịch đã hoàn tất! (Chế độ demo)");
    
    // Reset form
    setFromAmount("");
    setToAmount("");
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
        <h2 className="text-xl font-semibold">Swap</h2>
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

      <div className="space-y-2">
        {/* From Token */}
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Bạn trả</span>
            <span className="text-sm text-muted-foreground">
              {fromToken && prices?.[fromToken.coingeckoId]?.usd && fromAmount
                ? `~$${(parseFloat(fromAmount) * prices[fromToken.coingeckoId].usd).toFixed(2)}`
                : 'Số dư: 0.00'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => handleFromAmountChange(e.target.value)}
              className="border-0 bg-transparent text-2xl font-semibold p-0 h-auto focus-visible:ring-0"
            />
            <TokenSelector selectedToken={fromToken} onSelectToken={setFromToken} />
          </div>
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
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Bạn nhận</span>
            <span className="text-sm text-muted-foreground">
              {toToken && prices?.[toToken.coingeckoId]?.usd && toAmount
                ? `~$${(parseFloat(toAmount) * prices[toToken.coingeckoId].usd).toFixed(2)}`
                : 'Số dư: 0.00'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              placeholder="0.0"
              value={toAmount}
              onChange={(e) => handleToAmountChange(e.target.value)}
              className="border-0 bg-transparent text-2xl font-semibold p-0 h-auto focus-visible:ring-0"
            />
            <TokenSelector selectedToken={toToken} onSelectToken={setToToken} />
          </div>
          {toToken && prices?.[toToken.coingeckoId]?.usd && (
            <div className="mt-2 text-xs text-muted-foreground">
              ${prices[toToken.coingeckoId].usd.toFixed(2)} / {toToken.symbol}
            </div>
          )}
        </div>
      </div>

      {fromToken && toToken && exchangeRate && toAmount && (
        <div className="mt-4 p-3 bg-muted/30 rounded-xl border border-glass space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tỷ giá</span>
            <span className="font-medium">
              1 {fromToken.symbol} = {exchangeRate.toFixed(6)} {toToken.symbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tỷ giá ngược</span>
            <span className="font-medium">
              1 {toToken.symbol} = {(1 / exchangeRate).toFixed(6)} {fromToken.symbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Slippage tolerance</span>
            <span className="font-medium">{slippage}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Số lượng tối thiểu nhận được</span>
            <span className="font-medium">
              {(parseFloat(toAmount) * (1 - slippage / 100)).toFixed(6)} {toToken.symbol}
            </span>
          </div>
        </div>
      )}

      <Button 
        onClick={handleSwap}
        disabled={!fromToken || !toToken || !fromAmount || pricesLoading}
        className="w-full mt-4 h-14 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pricesLoading ? 'Đang tải giá...' : 'Hoán đổi'}
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
    </>
  );
};
