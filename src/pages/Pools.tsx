import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Loader2, AlertCircle, Coins, Circle, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddLiquidityDialog } from "@/components/Pools/AddLiquidityDialog";
import { RemoveLiquidityDialog } from "@/components/Pools/RemoveLiquidityDialog";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useNetwork } from "@/contexts/NetworkContext";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useV4Provider } from "@/hooks/useV4Provider";
import { fetchPool, Pool as GraphPool } from "@/services/graphql/subgraph";
import { getPositionDetails, V4PositionDetails, estimatePositionAmounts, estimateUnclaimedFees, collectFeesFromPosition } from "@/services/uniswap/v4/positionService";
import { Input } from "@/components/ui/input";

// Helper functions for positions
const formatFeeTier = (tickSpacing: string): string => {
  // Approximate fee tier from tick spacing
  const spacing = parseInt(tickSpacing);
  if (spacing === 1) return "0.01%";
  if (spacing === 10) return "0.05%";
  if (spacing === 60) return "0.30%";
  if (spacing === 200) return "1.00%";
  return `${(spacing / 10).toFixed(2)}%`;
};

const getPriceFromTick = (tick: string, token0Decimals: number, token1Decimals: number): number => {
  const tickNum = parseInt(tick);
  const price = Math.pow(1.0001, tickNum);
  const adjustedPrice = price * (10 ** (token0Decimals - token1Decimals));
  return adjustedPrice;
};

const isInRange = (tickLower: string, tickUpper: string, currentTick: string): boolean => {
  const lower = parseInt(tickLower);
  const upper = parseInt(tickUpper);
  const current = parseInt(currentTick);
  return current >= lower && current <= upper;
};

const Pools = () => {
  const [addLiquidityOpen, setAddLiquidityOpen] = useState(false);
  const [addLiquidityPreset, setAddLiquidityPreset] = useState<{ token0?: string; token1?: string; fee?: string }>({});
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTokenId, setRemoveTokenId] = useState<bigint | null>(null);
  const [removeLabel, setRemoveLabel] = useState<string | undefined>(undefined);
  const { pools, isLoading, error } = useSubgraphPools();
  const { positions, isLoading: positionsLoading, error: positionsError } = useSubgraphPositions();
  const { walletAddress } = useNetwork();
  const { publicClient, walletClient, chain } = useV4Provider();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // --- USD pricing helpers (default each token = $1) ---
  const getTokenUSDPrice = (_tokenId: string) => 1;

  const formatUSD = (amount: number) => {
    if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
    if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
    if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
    return `$${amount.toFixed(2)}`;
  };

  const computeVolumeUSD = (pool: any) => {
    if (pool.volumeUSD != null) {
      const v = parseFloat(pool.volumeUSD);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    // Fallback: derive from token volumes assuming $1 per token
    const vol0 = parseFloat(pool.volumeToken0 || "0");
    const vol1 = parseFloat(pool.volumeToken1 || "0");
    const p0 = getTokenUSDPrice(pool.token0?.id);
    const p1 = getTokenUSDPrice(pool.token1?.id);
    return vol0 * p0 + vol1 * p1;
  };

  // Compute TVL(USD) from actual token amounts in the pool; do not use raw liquidity.
  const computeLiquidityUSD = (pool: any) => {
    if (pool.totalValueLockedUSD != null) {
      const v = parseFloat(pool.totalValueLockedUSD);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    // Fallback: estimate TVL from token balances assuming $1 per token
    const tvl0 = parseFloat(pool.totalValueLockedToken0 || "0");
    const tvl1 = parseFloat(pool.totalValueLockedToken1 || "0");
    const p0 = getTokenUSDPrice(pool.token0?.id);
    const p1 = getTokenUSDPrice(pool.token1?.id);
    const est = tvl0 * p0 + tvl1 * p1;
    if (est > 0) return est;
    // If token balances are unavailable, return 0 rather than using raw liquidity.
    return 0;
  };

  // Calculate total stats from pools (USD)
  const totalLiquidity = pools.reduce((acc, pool) => acc + computeLiquidityUSD(pool), 0);
  const totalVolume = pools.reduce((acc, pool) => acc + computeVolumeUSD(pool), 0);

  // --- My Positions: load on-chain details (V4) ---
  const tokenIds = positions.map(p => BigInt(p.tokenId)).filter(Boolean);
  // React Query requires a serializable queryKey; BigInt cannot be JSON.stringified.
  // Use string representations of tokenIds in the key to avoid hashing errors.
  const tokenIdKeys = tokenIds.map((id) => id.toString());
  const { data: detailsMap } = useQuery<Record<string, V4PositionDetails>>({
    queryKey: ["v4-position-details", chain?.id, tokenIdKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      console.groupCollapsed("🔎 Pools/MyPositions: fetch details");
      console.debug("chainId:", chain.id, "tokenIds:", tokenIds.map(id => id.toString()));
      const entries = await Promise.all(
        tokenIds.map(async (id) => {
          const details = await getPositionDetails(publicClient, chain.id, id);
          if (!details) {
            console.warn("MyPositions: getPositionDetails returned null", { tokenId: id.toString() });
          } else {
            console.debug("detail:", {
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
      console.debug("details keys:", Object.keys(map));
      console.groupEnd();
      return map;
    },
    enabled: Boolean(publicClient && chain && tokenIds.length > 0),
    staleTime: 30000,
  });

  // Fallback: fetch pools by poolId from subgraph for symbol/fee if on-chain details missing
  const poolIds = Array.from(new Set(positions.map(p => p.poolId).filter(Boolean))) as string[];
  const { data: poolsMap } = useQuery<Record<string, GraphPool>>({
    queryKey: ["position-pools-fallback", poolIds],
    queryFn: async () => {
      const entries = await Promise.all(
        poolIds.map(async (id) => {
          const pool = await fetchPool(id);
          return pool ? [id, pool] as const : null;
        })
      );
      const map: Record<string, GraphPool> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      console.debug("Pools/MyPositions: fallback pools loaded", Object.keys(map));
      return map;
    },
    enabled: poolIds.length > 0,
    staleTime: 30000,
  });

  // Estimate full-position token amounts for display in My Positions tab
  const tokenIdsForPositionsTab = positions.map(p => BigInt(p.tokenId)).filter(Boolean);
  const tokenIdsForPositionsTabKeys = tokenIdsForPositionsTab.map((id) => id.toString());
  const { data: posAmountsMap } = useQuery<Record<string, {
    token0: { symbol: string; estimate: string };
    token1: { symbol: string; estimate: string };
  }>>({
    queryKey: ["v4-position-amounts-tab", chain?.id, tokenIdsForPositionsTabKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIdsForPositionsTab.map(async (id) => {
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
    enabled: Boolean(publicClient && chain && tokenIdsForPositionsTab.length > 0),
    staleTime: 30000,
  });

  // Estimate unclaimed fees per position via collect simulation
  const { data: feesMap, isLoading: feesLoading } = useQuery<Record<string, {
    token0: { symbol: string; amount: string };
    token1: { symbol: string; amount: string };
  }>>({
    queryKey: ["v4-position-fees", chain?.id, tokenIdsForPositionsTabKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIdsForPositionsTab.map(async (id) => {
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
    enabled: Boolean(publicClient && chain && tokenIdsForPositionsTab.length > 0),
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees", chain?.id, tokenIdsForPositionsTabKeys] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts-tab", chain?.id, tokenIdsForPositionsTabKeys] }),
      ]);
      toast({ title: "Claimed fees", description: "Transaction sent" });
    },
    onError: (err: any) => {
      const msg = err?.shortMessage || err?.message || "Failed to claim fees";
      toast({ title: "Claim failed", description: msg, variant: "destructive" });
      console.error("Claim fees error:", err);
    },
  });

  // Deprecated formatters: replaced by formatUSD with explicit USD semantics

  const calculateAPR = (pool: any) => {
    // APR approximation: (volumeUSD * feeFraction * 365) / TVL_USD
    const volUSD = computeVolumeUSD(pool);
    const tvlUSD = computeLiquidityUSD(pool);
    const feeFraction = pool.feeTier != null
      ? Number(pool.feeTier) / 1_000_000 // e.g., 500 -> 0.0005
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

  // --- Search & Sort state ---
  const [searchQuery, setSearchQuery] = useState("");
  type SortKey = "newest" | "pair" | "fee" | "liquidity" | "volume" | "apr" | "tx";
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder(key === "newest" ? "desc" : "asc");
    }
  };

  const matchesSearch = (pool: any) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const fields = [
      pool.token0?.symbol,
      pool.token0?.name,
      pool.token0?.id,
      pool.token1?.symbol,
      pool.token1?.name,
      pool.token1?.id,
    ]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());
    return fields.some((f: string) => f.includes(q));
  };

  const numericFeeTier = (pool: any) => {
    if (pool.feeTier != null) {
      const v = Number(pool.feeTier);
      if (!Number.isNaN(v)) return v;
    }
    // Approximate from tickSpacing: 10 -> 500, 60 -> 3000, 200 -> 10000, 1 -> 100
    const spacing = Number(pool.tickSpacing || "10");
    if (spacing === 1) return 100;
    if (spacing === 10) return 500;
    if (spacing === 60) return 3000;
    if (spacing === 200) return 10000;
    return spacing * 50; // generic fallback
  };

  const getPairLabel = (pool: any) => `${pool.token0.symbol}/${pool.token1.symbol}`;

  const displayPools = pools
    .filter(matchesSearch)
    .slice()
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "pair": {
          return getPairLabel(a).localeCompare(getPairLabel(b)) * dir;
        }
        case "fee": {
          return (numericFeeTier(a) - numericFeeTier(b)) * dir;
        }
        case "liquidity": {
          return (computeLiquidityUSD(a) - computeLiquidityUSD(b)) * dir;
        }
        case "volume": {
          return (computeVolumeUSD(a) - computeVolumeUSD(b)) * dir;
        }
        case "apr": {
          const aprA = calculateAPR(a);
          const aprB = calculateAPR(b);
          const numA = aprA === "N/A" ? -Infinity : parseFloat(aprA.replace("%", ""));
          const numB = aprB === "N/A" ? -Infinity : parseFloat(aprB.replace("%", ""));
          return (numA - numB) * dir;
        }
        case "tx": {
          return (Number(a.txCount || 0) - Number(b.txCount || 0)) * dir;
        }
        case "newest":
        default: {
          // Proxy for recency: higher txCount considered newer
          return (Number(a.txCount || 0) - Number(b.txCount || 0)) * dir;
        }
      }
    });

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                Liquidity Pools
              </h1>
              <p className="text-muted-foreground">
                Provide liquidity and earn trading fees
              </p>
            </div>
            <Button 
              onClick={() => {
                setAddLiquidityPreset({});
                setAddLiquidityOpen(true);
              }}
              className="bg-gradient-primary hover:opacity-90"
              disabled={!walletAddress}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Liquidity
            </Button>
          </div>
          {/* Search & quick sort bar */}
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by token name or address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>Sort:</span>
              <Button
                variant="outline"
                size="sm"
                className="border-glass"
                onClick={() => toggleSort("newest")}
              >
                Newest
                {sortBy === "newest" && (
                  sortOrder === "desc" ? <ArrowDown className="ml-2 h-4 w-4" /> : <ArrowUp className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="pools" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
            <TabsTrigger value="pools">All Pools</TabsTrigger>
            <TabsTrigger value="positions">My Positions</TabsTrigger>
          </TabsList>

          <TabsContent value="pools">

        {error && (
          <Alert className="mb-8 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">
              Unable to load pools. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Loading pools</h3>
            <p className="text-muted-foreground">Please wait while we load pool data.</p>
          </Card>
        ) : pools.length === 0 ? (
          <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No pools found</h3>
            <p className="text-muted-foreground mb-4">
              Be the first to create a liquidity pool
            </p>
            <Button 
              onClick={() => setAddLiquidityOpen(true)}
              className="bg-gradient-primary hover:opacity-90"
              disabled={!walletAddress}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Liquidity
            </Button>
          </Card>
        ) : (
          <Card className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-glass">
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("pair")}>Pool
                        {sortBy === "pair" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("fee")}>Fee Tier
                        {sortBy === "fee" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("liquidity")}>Liquidity
                        {sortBy === "liquidity" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("volume")}>Volume
                        {sortBy === "volume" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("apr")}>APR
                        {sortBy === "apr" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">
                      <button className="inline-flex items-center gap-2" onClick={() => toggleSort("tx")}>Transactions
                        {sortBy === "tx" ? (
                          sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th className="text-right p-4 text-muted-foreground font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPools.map((pool) => {
                    const pair = `${pool.token0.symbol}/${pool.token1.symbol}`;
                    // Prefer subgraph's feeTier; fallback to tickSpacing heuristic only if missing
                    const feeTier = pool.feeTier
                      ? `${(Number(pool.feeTier) / 10_000).toFixed(2)}%`
                      : `${(parseInt(pool.tickSpacing) / 10).toFixed(2)}%`;
                    
                    return (
                      <tr 
                        key={pool.id} 
                        className="border-b border-glass last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center border-2 border-card">
                                <span className="text-xs font-bold">
                                  {pool.token0.symbol.substring(0, 1)}
                                </span>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-gradient-secondary flex items-center justify-center border-2 border-card">
                                <span className="text-xs font-bold">
                                  {pool.token1.symbol.substring(0, 1)}
                                </span>
                              </div>
                            </div>
                            <span className="font-semibold">{pair}</span>
                          </div>
                        </td>
                        <td className="p-4 font-medium">{feeTier}</td>
                        <td className="p-4 font-medium">{formatUSD(computeLiquidityUSD(pool))}</td>
                        <td className="p-4 font-medium">{formatUSD(computeVolumeUSD(pool))}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1 text-green-400">
                            <TrendingUp className="h-4 w-4" />
                            <span className="font-semibold">{calculateAPR(pool)}</span>
                          </div>
                        </td>
                        <td className="p-4 font-medium">{pool.txCount}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-glass hover:bg-muted/50"
                              onClick={() => {
                                const initialFee = (() => {
                                  // AddLiquidityDialog expects one of "500" | "3000" | "10000"
                                  const allowed = ["500", "3000", "10000"] as const;
                                  const tierStr = pool.feeTier ? String(pool.feeTier) : undefined;
                                  if (tierStr && allowed.includes(tierStr as any)) {
                                    return tierStr;
                                  }
                                  const spacing = Number(pool.tickSpacing);
                                  if (spacing === 10) return "500";
                                  if (spacing === 60) return "3000";
                                  if (spacing === 200) return "10000";
                                  // Fallback to standard tier
                                  return "3000";
                                })();

                                setAddLiquidityPreset({
                                  token0: pool.token0.id,
                                  token1: pool.token1.id,
                                  fee: initialFee,
                                });
                                setAddLiquidityOpen(true);
                              }}
                              disabled={!walletAddress}
                            >
                              Add Liquidity
                            </Button>
                            <Button 
                              variant="default" 
                              size="sm"
                              className="bg-gradient-primary hover:opacity-90"
                              onClick={() => {
                                navigate({ pathname: "/", search: `?from=${pool.token0.id}&to=${pool.token1.id}` });
                              }}
                              disabled={!walletAddress}
                            >
                              Swap
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Value Locked</div>
            <div className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              {formatUSD(totalLiquidity)}
            </div>
          </Card>
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Volume</div>
            <div className="text-3xl font-bold bg-gradient-secondary bg-clip-text text-transparent">
              {formatUSD(totalVolume)}
            </div>
          </Card>
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Active Pools</div>
            <div className="text-3xl font-bold text-foreground">
              {pools.length}
            </div>
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="positions">
            {!walletAddress ? (
              <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Coins className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
                <p className="text-muted-foreground">
                  Please connect your wallet to view your liquidity positions
                </p>
              </Card>
            ) : positionsLoading ? (
              <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Loading Positions</h3>
                <p className="text-muted-foreground">Please wait while we load your positions.</p>
              </Card>
            ) : (
              <>
                {positionsError && (
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
                    <Button 
                      onClick={() => setAddLiquidityOpen(true)}
                      className="bg-gradient-primary hover:opacity-90"
                      disabled={!walletAddress}
                    >
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
              const amountInfo = posAmountsMap?.[position.tokenId];
              const price0 = details?.token0?.address ? getTokenUSDPrice(details.token0.address) : (fallbackPool ? getTokenUSDPrice(fallbackPool.token0.id) : 1);
              const price1 = details?.token1?.address ? getTokenUSDPrice(details.token1.address) : (fallbackPool ? getTokenUSDPrice(fallbackPool.token1.id) : 1);
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

              console.debug("Pools/MyPositions: render item", {
                tokenId: position.tokenId,
                tokenPair,
                feeTier,
                inRange,
                hasDetails: Boolean(details),
                hasFallback: Boolean(fallbackPool),
              });

              return (
                <Card key={position.id} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden hover:border-primary/20 transition-colors">
                  <div className="p-6">
                    {/* Top Section */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Token Icons */}
                        <div className="flex -space-x-3">
                          <div className="w-12 h-12 rounded-full border-4 border-card bg-gradient-primary flex items-center justify-center">
                            <span className="text-sm font-bold">T</span>
                          </div>
                          <div className="w-12 h-12 rounded-full border-4 border-card bg-gradient-secondary flex items-center justify-center">
                            <span className="text-sm font-bold">T</span>
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
                              const p0 = getTokenUSDPrice(details?.token0.address ?? fallbackPool?.token0.id);
                              const p1 = getTokenUSDPrice(details?.token1.address ?? fallbackPool?.token1.id);
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
              </>
            )}
          </TabsContent>
        </Tabs>

      <AddLiquidityDialog 
        open={addLiquidityOpen} 
        onOpenChange={setAddLiquidityOpen}
        initialToken0={addLiquidityPreset.token0}
        initialToken1={addLiquidityPreset.token1}
        initialFee={addLiquidityPreset.fee}
      />
      {removeTokenId !== null && (
        <RemoveLiquidityDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          tokenId={removeTokenId as bigint}
          tokenPairLabel={removeLabel}
        />
      )}
      </div>
    </div>
  );
};

export default Pools;
