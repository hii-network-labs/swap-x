import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { TokenSelector, Token } from "./TokenSelector";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { SlippageSettings } from "./SlippageSettings";
import { SwapConfirmDialog } from "./SwapConfirmDialog";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { saveTransaction } from "@/types/transaction";
import { useV4Provider } from "@/hooks/useV4Provider";
import { useNetwork } from "@/contexts/NetworkContext";
import { estimateExactInput, estimateExactOutput, quoteExactInputSingle, quoteExactOutputSingle } from "@/services/uniswap/v4/quoteService";

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
  const { publicClient } = useV4Provider();
  const { currentNetwork } = useNetwork();

  useEffect(() => {
    onTokensChange?.(fromToken, toToken);
  }, [fromToken, toToken, onTokensChange]);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isFromInput, setIsFromInput] = useState(true);
  const [onchainRate, setOnchainRate] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [slippage, setSlippage] = useState(0.5);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Load pools to build token universe and adjacency mapping
  const { pools } = useSubgraphPools();
  const allTokens: Token[] = (() => {
    const map = new Map<string, Token>();
    for (const p of pools) {
      if (p.token0?.id && p.token0?.symbol) {
        const addr = p.token0.id.toLowerCase();
        if (!map.has(addr)) {
          map.set(addr, {
            symbol: p.token0.symbol,
            name: p.token0.name || p.token0.symbol,
            logo: p.token0.symbol.substring(0, 1),
            address: addr,
            coingeckoId: "",
          });
        }
      }
      if (p.token1?.id && p.token1?.symbol) {
        const addr = p.token1.id.toLowerCase();
        if (!map.has(addr)) {
          map.set(addr, {
            symbol: p.token1.symbol,
            name: p.token1.name || p.token1.symbol,
            logo: p.token1.symbol.substring(0, 1),
            address: addr,
            coingeckoId: "",
          });
        }
      }
    }
    return Array.from(map.values());
  })();

  const adjacency: Record<string, Set<string>> = (() => {
    const adj: Record<string, Set<string>> = {};
    for (const p of pools) {
      const a = p.token0?.id?.toLowerCase();
      const b = p.token1?.id?.toLowerCase();
      if (!a || !b) continue;
      if (!adj[a]) adj[a] = new Set<string>();
      if (!adj[b]) adj[b] = new Set<string>();
      adj[a].add(b);
      adj[b].add(a);
    }
    return adj;
  })();

  const allowedToAddresses = fromToken ? Array.from(adjacency[fromToken.address?.toLowerCase()] || []) : [];

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
    onchainRate ?? (
      fromToken && toToken && prices?.[fromToken.coingeckoId]?.usd && prices?.[toToken.coingeckoId]?.usd
        ? prices[fromToken.coingeckoId].usd / prices[toToken.coingeckoId].usd
        : null
    );

  // Auto-calculate output amount
  // Quote using on-chain pool price when possible
  useEffect(() => {
    const runQuote = async () => {
      if (!publicClient || !currentNetwork || !fromToken || !toToken) return;
      const fromAddr = fromToken.address as `0x${string}`;
      const toAddr = toToken.address as `0x${string}`;

      // Find tickSpacing from pools data (first matching pool), default 60
      const matching = pools.find(
        (p) => p.token0?.id?.toLowerCase() === fromAddr.toLowerCase() && p.token1?.id?.toLowerCase() === toAddr.toLowerCase()
      ) || pools.find(
        (p) => p.token0?.id?.toLowerCase() === toAddr.toLowerCase() && p.token1?.id?.toLowerCase() === fromAddr.toLowerCase()
      );
      const tickSpacing = matching ? parseInt(matching.tickSpacing) : 60;

      try {
        setQuoting(true);
        if (isFromInput && fromAmount) {
          // Prefer Quoter if available
          const res = (await quoteExactInputSingle({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: parseFloat(fromAmount),
            tickSpacing,
          })) || (await estimateExactInput({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: parseFloat(fromAmount),
            tickSpacing,
          }));
          if (res) {
            setOnchainRate(res.rate);
            setToAmount(res.amountOut!.toFixed(6));
          }
        } else if (!isFromInput && toAmount) {
          const res = (await quoteExactOutputSingle({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: parseFloat(toAmount),
            tickSpacing,
          })) || (await estimateExactOutput({
            client: publicClient,
            chainId: currentNetwork.chainId,
            tokenIn: fromAddr,
            tokenOut: toAddr,
            amount: parseFloat(toAmount),
            tickSpacing,
          }));
          if (res) {
            setOnchainRate(res.rate);
            setFromAmount(res.amountIn!.toFixed(6));
          }
        }
      } catch (e) {
        // Fallback: keep Coingecko-based exchangeRate
        setOnchainRate(null);
      } finally {
        setQuoting(false);
      }
    };

    runQuote();
  }, [publicClient, currentNetwork, pools, fromToken, toToken, isFromInput, fromAmount, toAmount]);

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
                ? `~$${(parseFloat(fromAmount) * (prices[fromToken.coingeckoId].usd || 0)).toFixed(2)}`
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
            <TokenSelector selectedToken={fromToken} onSelectToken={setFromToken} tokens={allTokens} />
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
                ? `~$${(parseFloat(toAmount) * (prices[toToken.coingeckoId].usd || 0)).toFixed(2)}`
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
            <TokenSelector selectedToken={toToken} onSelectToken={setToToken} tokens={allTokens} allowedAddresses={allowedToAddresses} />
          </div>
          {toToken && prices?.[toToken.coingeckoId]?.usd && (
            <div className="mt-2 text-xs text-muted-foreground">
              ${prices[toToken.coingeckoId].usd.toFixed(2)} / {toToken.symbol}
            </div>
          )}
        </div>
      </div>

      {fromToken && toToken && exchangeRate && (fromAmount || toAmount) && (
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
