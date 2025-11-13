import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Plus, Loader2, AlertCircle, Circle } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchPool, Pool } from "@/services/graphql/subgraph";
import { useV4Provider } from "@/hooks/useV4Provider";
import { getPositionDetails, V4PositionDetails, estimatePositionAmounts, estimateUnclaimedFees, collectFeesFromPosition } from "@/services/uniswap/v4/positionService";
import { RemoveLiquidityDialog } from "@/components/Pools/RemoveLiquidityDialog";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const MyPositions = () => {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTokenId, setRemoveTokenId] = useState<bigint | null>(null);
  const [removeLabel, setRemoveLabel] = useState<string | undefined>(undefined);
  const { walletAddress } = useNetwork();
  const { positions, isLoading, error } = useSubgraphPositions();
  const { publicClient, walletClient, chain } = useV4Provider();
  const queryClient = useQueryClient();

  // --- USD helpers with $1/token assumption and APR approximation ---
  const getTokenUSDPrice = (_tokenAddress?: string, _symbol?: string) => 1;
  const formatUSD = (v: number) => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
  const computeVolumeUSD = (pool: any) => {
    if (!pool) return 0;
    if (pool.volumeUSD != null) {
      const v = parseFloat(pool.volumeUSD);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    const vol0 = parseFloat(pool.volumeToken0 || "0");
    const vol1 = parseFloat(pool.volumeToken1 || "0");
    const p0 = getTokenUSDPrice(pool.token0?.id, pool.token0?.symbol);
    const p1 = getTokenUSDPrice(pool.token1?.id, pool.token1?.symbol);
    return vol0 * p0 + vol1 * p1;
  };
  // Compute TVL(USD) from actual token balances; avoid using raw liquidity.
  const computeLiquidityUSD = (pool: any) => {
    if (!pool) return 0;
    if (pool.totalValueLockedUSD != null) {
      const v = parseFloat(pool.totalValueLockedUSD);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    const tvl0 = parseFloat(pool.totalValueLockedToken0 || "0");
    const tvl1 = parseFloat(pool.totalValueLockedToken1 || "0");
    const p0 = getTokenUSDPrice(pool.token0?.id, pool.token0?.symbol);
    const p1 = getTokenUSDPrice(pool.token1?.id, pool.token1?.symbol);
    const est = tvl0 * p0 + tvl1 * p1;
    if (est > 0) return est;
    return 0;
  };
  const calculateAPR = (pool: any) => {
    if (!pool) return "N/A";
    const volUSD = computeVolumeUSD(pool);
    const tvlUSD = computeLiquidityUSD(pool);
    const feeFraction = pool.feeTier != null
      ? Number(pool.feeTier) / 1_000_000
      : (() => {
          const spacing = parseInt(pool.tickSpacing || "10");
          return spacing === 1 ? 0.0001 : spacing === 10 ? 0.0005 : spacing === 60 ? 0.003 : 0.01;
        })();
    if (!tvlUSD || tvlUSD <= 0) return "N/A"; // không có thanh khoản
    const aprRaw = (volUSD * feeFraction * 365) / tvlUSD * 100;
    if (!Number.isFinite(aprRaw)) return "N/A";
    // TVL > 0 nhưng volume ~ 0 -> APR hợp lý là 0%
    if (volUSD <= 0 || aprRaw <= 0) return "0.00%";
    return `${aprRaw.toFixed(2)}%`;
  };
  // Fetch pool info for positions (token0/token1/fee, etc.) via poolId
  const tokenIds = positions.map(p => BigInt(p.tokenId)).filter(Boolean);
  const tokenIdKeys = tokenIds.map((id) => id.toString());
  const { data: detailsMap } = useQuery<Record<string, V4PositionDetails>>({
    queryKey: ["v4-position-details", chain?.id, tokenIdKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      console.debug("MyPositions: fetching details", {
        chainId: chain.id,
        tokenIds: tokenIds.map(id => id.toString()),
        hasPublicClient: !!publicClient,
      });
      const entries = await Promise.all(
        tokenIds.map(async (id) => {
          const details = await getPositionDetails(publicClient, chain.id, id);
          if (!details) {
            console.warn("MyPositions: getPositionDetails returned null", { tokenId: id.toString() });
          } else {
            console.debug("MyPositions: position details", {
              tokenId: id.toString(),
              token0: details.token0.symbol,
              token1: details.token1.symbol,
              fee: details.poolKey.fee,
              tickLower: details.tickLower,
              tickUpper: details.tickUpper,
              currentTick: details.currentTick,
            });
          }
          return details ? [id.toString(), details] as const : null;
        })
      );
      const map: Record<string, V4PositionDetails> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      console.debug("MyPositions: details map keys", Object.keys(map));
      return map;
    },
    enabled: Boolean(publicClient && chain && tokenIds.length > 0),
    staleTime: 30000,
  });

  // Fallback: fetch pools by poolId from subgraph for symbol/fee if on-chain details missing
  const poolIds = Array.from(new Set(positions.map(p => p.poolId).filter(Boolean))) as string[];
  const { data: poolsMap } = useQuery<Record<string, Pool>>({
    queryKey: ["position-pools-fallback", poolIds],
    queryFn: async () => {
      const entries = await Promise.all(
        poolIds.map(async (id) => {
          const pool = await fetchPool(id);
          return pool ? [id, pool] as const : null;
        })
      );
      const map: Record<string, Pool> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      console.debug("MyPositions: fallback pools loaded", Object.keys(map));
      return map;
    },
    enabled: poolIds.length > 0,
    staleTime: 30000,
  });

  // Estimate full-position token amounts for display (using state-view via positionService)
  const { data: amountsMap } = useQuery<Record<string, {
    token0: { symbol: string; estimate: string };
    token1: { symbol: string; estimate: string };
  }>>({
    queryKey: ["v4-position-amounts", chain?.id, tokenIdKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIds.map(async (id) => {
          const res = await estimatePositionAmounts(publicClient, chain.id, id);
          if (!res) return null;
          return [id.toString(), {
            token0: { symbol: res.token0.symbol, estimate: res.token0.estimate },
            token1: { symbol: res.token1.symbol, estimate: res.token1.estimate },
          }] as const;
        })
      );
      const map: Record<string, { token0: { symbol: string; estimate: string }; token1: { symbol: string; estimate: string } }> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      return map;
    },
    enabled: Boolean(publicClient && chain && tokenIds.length > 0),
    staleTime: 30000,
  });

  // Estimate unclaimed fees per position via collect simulation
  const { data: feesMap, isLoading: feesLoading } = useQuery<Record<string, {
    token0: { symbol: string; amount: string };
    token1: { symbol: string; amount: string };
  }>>({
    queryKey: ["v4-position-fees", chain?.id, tokenIdKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIds.map(async (id) => {
          const res = await estimateUnclaimedFees(publicClient, chain.id, id, walletAddress as `0x${string}`);
          if (!res) return null;
          return [id.toString(), {
            token0: { symbol: res.token0.symbol, amount: res.token0.amount },
            token1: { symbol: res.token1.symbol, amount: res.token1.amount },
          }] as const;
        })
      );
      const map: Record<string, { token0: { symbol: string; amount: string }; token1: { symbol: string; amount: string } }> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      return map;
    },
    enabled: Boolean(publicClient && chain && tokenIds.length > 0),
    staleTime: 30000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Mutation: Claim fees for a position
  const { toast } = useToast();
  const claimMutation = useMutation({
    mutationFn: async (vars: { tokenId: bigint }) => {
      if (!publicClient || !chain) throw new Error("Provider not ready");
      if (!walletAddress) throw new Error("Wallet not connected");
      if (!walletClient) throw new Error("Wallet client unavailable");
      return collectFeesFromPosition(publicClient, walletClient, chain.id, walletAddress as `0x${string}`, vars.tokenId);
    },
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees", chain?.id, tokenIdKeys] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts", chain?.id, tokenIdKeys] }),
      ]);
      toast({ title: "Claimed fees", description: `Tx: ${res?.txHash ?? "sent"}` });
    },
    onError: (err: any) => {
      const msg = err?.shortMessage || err?.message || "Failed to claim fees";
      toast({ title: "Claim failed", description: msg, variant: "destructive" });
      console.error("Claim fees error:", err);
    },
  });

  // Price helpers above

  if (!walletAddress) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
        <Card className="p-8 bg-card/80 backdrop-blur-xl border-glass text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Coins className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">
            Please connect your wallet to view your liquidity positions
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
        <Card className="p-8 bg-card/80 backdrop-blur-xl border-glass text-center max-w-md">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Loading Positions</h2>
          <p className="text-muted-foreground">Please wait while we load your positions.</p>
        </Card>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            My Positions
          </h1>
          <p className="text-muted-foreground">
            Manage your liquidity positions and track earnings
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-8 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">Unable to load positions. Please try again.</AlertDescription>
          </Alert>
        )}

        {/* Positions List */}
        {positions.length === 0 ? (
          <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Coins className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No positions yet</h3>
            <p className="text-muted-foreground mb-4">
              Add liquidity to a pool to start earning fees
            </p>
            <Button className="bg-gradient-primary hover:opacity-90" disabled={!walletAddress}>
              <Plus className="mr-2 h-4 w-4" />
              Add Liquidity
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => {
              const details = detailsMap?.[position.tokenId];
              const fallbackPool = position.poolId ? poolsMap?.[position.poolId] : undefined;
              const tokenPair = details
                ? `${details.token0.symbol} / ${details.token1.symbol}`
                : fallbackPool
                ? `${fallbackPool.token0.symbol} / ${fallbackPool.token1.symbol}`
                : "TOKEN / TOKEN";
              const feeTier = details
                ? `${(details.poolKey.fee / 10_000).toFixed(2)}%`
                : fallbackPool
                ? `${(Number(fallbackPool.tickSpacing) === 10 ? 0.05 : Number(fallbackPool.tickSpacing) === 60 ? 0.3 : 1).toFixed(2)}%`
                : "-";
              const inRange = details ? (details.currentTick >= details.tickLower && details.currentTick <= details.tickUpper) : false;
              const amountInfo = amountsMap?.[position.tokenId];
              const price0 = getTokenUSDPrice(details?.token0.address, details?.token0.symbol ?? fallbackPool?.token0.symbol);
              const price1 = getTokenUSDPrice(details?.token1.address, details?.token1.symbol ?? fallbackPool?.token1.symbol);
              const amt0 = amountInfo ? parseFloat(amountInfo.token0.estimate) : 0;
              const amt1 = amountInfo ? parseFloat(amountInfo.token1.estimate) : 0;
              const usdTotal = (amt0 * price0) + (amt1 * price1);
              const positionValue = amountInfo
                ? `~ ${formatUSD(usdTotal)} (${amt0.toFixed(6)} ${amountInfo.token0.symbol} / ${amt1.toFixed(6)} ${amountInfo.token1.symbol})`
                : "-";
              const feesEarned = "-"; // TODO: integrate subgraph earnings
              const apr = fallbackPool ? calculateAPR(fallbackPool) : "N/A";
              const priceRange = details ? "Custom range" : "";
              const toPrice = (tick: number) => Number(Math.pow(1.0001, tick)).toFixed(4);
              const minPrice = details ? toPrice(details.tickLower) : "";
              const maxPrice = details ? toPrice(details.tickUpper) : "";
              
              return (
                <Card key={position.id} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden hover:border-primary/20 transition-colors">
                  <div className="p-6">
                    {/* Top Section */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Token Icons */}
                        <div className="flex -space-x-3">
                          <div className="w-12 h-12 rounded-full border-4 border-card bg-gradient-primary flex items-center justify-center">
                            <span className="text-sm font-bold">{details?.token0.symbol?.[0] ?? "T"}</span>
                          </div>
                          <div className="w-12 h-12 rounded-full border-4 border-card bg-gradient-secondary flex items-center justify-center">
                            <span className="text-sm font-bold">{details?.token1.symbol?.[0] ?? "T"}</span>
                          </div>
                        </div>

                        {/* Token Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-xl font-bold">{tokenPair}</h3>
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              v4
                            </Badge>
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              {feeTier}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Circle 
                              className={cn(
                                "h-2 w-2 fill-current",
                                inRange ? "text-green-400" : "text-red-400"
                              )} 
                            />
                            <span className={cn(
                              "text-sm font-medium",
                              inRange ? "text-green-400" : "text-red-400"
                            )}>
                              {inRange ? "In range" : "Out of range"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Price Range Indicator */}
                      <div className="flex items-center gap-2 min-w-[300px]">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all",
                              inRange ? "bg-green-400" : "bg-red-400"
                            )}
                            style={{ width: inRange ? "60%" : "100%" }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Stats Grid */}
                      <div className="grid grid-cols-5 gap-6 pt-4 border-t border-glass">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Position</div>
                        <div className="text-sm">{positionValue}</div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Fees</div>
                        <div className="text-sm">
                          {feesLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Estimating...
                            </div>
                          ) : feesMap?.[position.tokenId] ? (
                            (() => {
                              const feesInfo = feesMap[position.tokenId];
                              const f0 = parseFloat(feesInfo.token0.amount) || 0;
                              const f1 = parseFloat(feesInfo.token1.amount) || 0;
                              const p0 = getTokenUSDPrice(details?.token0.address, feesInfo.token0.symbol);
                              const p1 = getTokenUSDPrice(details?.token1.address, feesInfo.token1.symbol);
                              const usd = (f0 * p0) + (f1 * p1);
                              return (
                                <div className="text-sm">
                                  ~ {formatUSD(usd)} ({f0.toFixed(6)} {feesInfo.token0.symbol} / {f1.toFixed(6)} {feesInfo.token1.symbol})
                                </div>
                              );
                            })()
                          ) : (
                            <div className="text-muted-foreground">-</div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">APR</div>
                        <div className="text-sm">{apr}</div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">
                          {minPrice && maxPrice ? "Range" : ""}
                        </div>
                        <div className="text-sm">
                          {priceRange && !minPrice && <div className="font-semibold">{priceRange}</div>}
                          {minPrice && (
                            <>
                              <div className="text-muted-foreground">Min {minPrice}</div>
                              <div className="text-muted-foreground">Max {maxPrice}</div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => claimMutation.mutate({ tokenId: BigInt(position.tokenId) })}
                          disabled={(() => {
                            if (!walletAddress || claimMutation.isPending) return true;
                            const feesInfo = feesMap?.[position.tokenId];
                            // Cho phép claim nếu không có ước lượng (feesInfo undefined)
                            if (!feesInfo) return false;
                            const f0 = parseFloat(feesInfo.token0.amount) || 0;
                            const f1 = parseFloat(feesInfo.token1.amount) || 0;
                            return (f0 === 0 && f1 === 0);
                          })()}
                          className="min-w-[120px]"
                        >
                          {claimMutation.isPending ? (
                            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Claiming</span>
                          ) : (
                            <span>Claim Fees</span>
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setRemoveTokenId(BigInt(position.tokenId));
                            setRemoveLabel(tokenPair);
                            setRemoveOpen(true);
                          }}
                          disabled={!walletAddress}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
    {removeTokenId !== null && (
      <RemoveLiquidityDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        tokenId={removeTokenId as bigint}
        tokenPairLabel={removeLabel}
      />
    )}
    </>
  );
};

export default MyPositions;
