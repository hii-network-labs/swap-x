import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Plus, Loader2, AlertCircle, Circle } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchPool, Pool, fetchPools } from "@/services/graphql/subgraph";
import { getCommonTokens } from "@/config/uniswap";
import { useV4Provider } from "@/hooks/useV4Provider";
import { getPositionDetails, V4PositionDetails, estimatePositionAmounts, estimateUnclaimedFees, collectFeesFromPosition, verifyFeeCollection, invalidatePositionCaches } from "@/services/uniswap/v4/positionService";
import { RemoveLiquidityDialog } from "@/components/Pools/RemoveLiquidityDialog";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TxStatusDialog } from "@/components/ui/TxStatusDialog";

const MyPositions = () => {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTokenId, setRemoveTokenId] = useState<bigint | null>(null);
  const [removeLabel, setRemoveLabel] = useState<string | undefined>(undefined);
  const { walletAddress, setBalancesRefreshKey } = useNetwork();
  const { positions, isLoading, error } = useSubgraphPositions();
  const { publicClient, walletClient, chain } = useV4Provider();
  const queryClient = useQueryClient();

  // Pagination for positions list
  const [posPage, setPosPage] = useState(0);
  const [posPageSize, setPosPageSize] = useState(5);
  const totalPages = Math.max(1, Math.ceil((positions?.length || 0) / posPageSize));
  const clampedPage = Math.min(posPage, totalPages - 1);
  const startIndex = clampedPage * posPageSize;
  const endIndex = startIndex + posPageSize;
  const visiblePositions = positions.slice(startIndex, endIndex);

  // --- USD helpers using subgraph pools to route via HNC/USDT/USDC ---
  const baseUSDT = (import.meta.env.VITE_USDT_ADDRESS as string | undefined);
  const baseUSDC = (import.meta.env.VITE_USDC_ADDRESS as string | undefined);
  const baseHNC = (import.meta.env.VITE_NATIVE_TOKEN_ADDRESS as string | undefined);
  const common = chain?.id ? getCommonTokens(chain.id) : {} as any;
  const { data: pools } = useQuery<Pool[]>({
    queryKey: ["subgraph-pools", chain?.id],
    enabled: Boolean(chain?.id),
    queryFn: async () => fetchPools(500, 0),
    staleTime: 30000,
  });
  const usdtCand = (pools || []).flatMap(p => [p.token0, p.token1]).filter(t => t?.symbol === "USDT").map(t => t.id.toLowerCase());
  const usdcCand = (pools || []).flatMap(p => [p.token0, p.token1]).filter(t => t?.symbol === "USDC").map(t => t.id.toLowerCase());
  const hncCand  = (pools || []).flatMap(p => [p.token0, p.token1]).filter(t => ["HNC","WHNC","WETH","WBNB"].includes(String(t?.symbol))).map(t => t.id.toLowerCase());
  const USDT = (baseUSDT || (common?.USDT as string | undefined) || usdtCand[0])?.toLowerCase();
  const USDC = (baseUSDC || (common?.USDC as string | undefined) || usdcCand[0])?.toLowerCase();
  const HNC  = (baseHNC  || (common?.WETH || common?.WBNB) || hncCand[0])?.toLowerCase();

  

  const getTokenUSDPrice = (_tokenAddress?: string) => {
    if (!_tokenAddress || !pools?.length) return NaN;
    const addr = _tokenAddress.toLowerCase();
    const addrSymbol: Record<string, string> = {};
    (pools || []).forEach((p) => {
      addrSymbol[p.token0.id.toLowerCase()] = String(p.token0.symbol || "");
      addrSymbol[p.token1.id.toLowerCase()] = String(p.token1.symbol || "");
    });
    const STABLE = new Set(["USDT", "USDC", "BUSD"]);
    const symSelf = addrSymbol[addr];
    if (symSelf && STABLE.has(symSelf)) return 1;
    const priceOfBase = (base?: string): number | null => {
      const b = base?.toLowerCase();
      if (!b) return null;
      const targetPool = pools.find((p) => {
        const a0 = p.token0.id.toLowerCase();
        const a1 = p.token1.id.toLowerCase();
        const s0 = String(p.token0.symbol || "");
        const s1 = String(p.token1.symbol || "");
        return (a0 === b && STABLE.has(s1)) || (a1 === b && STABLE.has(s0));
      });
      if (!targetPool || targetPool.tick == null) return null;
      const d0 = Number(targetPool.token0.decimals || "18");
      const d1 = Number(targetPool.token1.decimals || "18");
      const tick = Number(targetPool.tick);
      const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
      const a0 = targetPool.token0.id.toLowerCase();
      const isBaseToken0 = a0 === b;
      const baseInStable = isBaseToken0 ? (1 / ratio) : ratio;
      return baseInStable;
    };
    const directPool = pools.find((p) => {
      const a0 = p.token0.id.toLowerCase();
      const a1 = p.token1.id.toLowerCase();
      const s0 = String(p.token0.symbol || "");
      const s1 = String(p.token1.symbol || "");
      return (a0 === addr && STABLE.has(s1)) || (a1 === addr && STABLE.has(s0));
    });
    if (directPool && directPool.tick != null) {
      const d0 = Number(directPool.token0.decimals || "18");
      const d1 = Number(directPool.token1.decimals || "18");
      const tick = Number(directPool.tick);
      const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
      const a0 = directPool.token0.id.toLowerCase();
      const isToken0Target = a0 === addr;
      const s0 = String(directPool.token0.symbol || "");
      const s1 = String(directPool.token1.symbol || "");
      if (isToken0Target && STABLE.has(s1)) return ratio;
      if (!isToken0Target && STABLE.has(s0)) return 1 / ratio;
    }
    const baseUSD = priceOfBase(HNC || USDT || USDC);
    if (HNC && baseUSD != null) {
      const poolToHNC = pools.find(p => [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()].includes(addr) && [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()].includes(HNC));
      if (poolToHNC && poolToHNC.tick != null) {
        const d0 = Number(poolToHNC.token0.decimals || "18");
        const d1 = Number(poolToHNC.token1.decimals || "18");
        const tick = Number(poolToHNC.tick);
        const ratio = Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
        const a0 = poolToHNC.token0.id.toLowerCase();
        const isToken0Target = a0 === addr;
        const priceInHNC = isToken0Target ? (1 / ratio) : ratio;
        return priceInHNC * baseUSD;
      }
    }
    return NaN;
  };
  const formatUSD = (v: number) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : "N/A");
  const computeVolumeUSD = (pool: any) => {
    if (!pool) return 0;
    if (pool.volumeUSD != null) {
      const v = parseFloat(pool.volumeUSD);
      if (!Number.isNaN(v) && v > 0) return v;
    }
    const vol0 = parseFloat(pool.volumeToken0 || "0");
    const vol1 = parseFloat(pool.volumeToken1 || "0");
    const p0 = getTokenUSDPrice(pool.token0?.id);
    const p1 = getTokenUSDPrice(pool.token1?.id);
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
    const p0 = getTokenUSDPrice(pool.token0?.id);
    const p1 = getTokenUSDPrice(pool.token1?.id);
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
  // Page-scoped token ids for async queries
  const tokenIdsPage = visiblePositions.map(p => BigInt(p.tokenId)).filter(Boolean);
  const tokenIdsPageKeys = tokenIdsPage.map(id => id.toString());
  const { data: detailsMap } = useQuery<Record<string, V4PositionDetails>>({
    queryKey: ["v4-position-details-page", chain?.id, tokenIdsPageKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      console.debug("MyPositions: fetching details", {
        chainId: chain.id,
        tokenIds: tokenIdsPage.map(id => id.toString()),
        hasPublicClient: !!publicClient,
      });
      const entries = await Promise.all(
        tokenIdsPage.map(async (id) => {
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
    enabled: Boolean(publicClient && chain && tokenIdsPage.length > 0),
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
    queryKey: ["v4-position-amounts-page", chain?.id, tokenIdsPageKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIdsPage.map(async (id) => {
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
    enabled: Boolean(publicClient && chain && tokenIdsPage.length > 0),
    staleTime: 30000,
  });

  // Estimate unclaimed fees per position via collect simulation
  const { data: feesMap, isLoading: feesLoading } = useQuery<Record<string, {
    token0: { symbol: string; amount: string };
    token1: { symbol: string; amount: string };
  }>>({
    queryKey: ["v4-position-fees-page", chain?.id, tokenIdsPageKeys],
    queryFn: async () => {
      if (!publicClient || !chain) return {};
      const entries = await Promise.all(
        tokenIdsPage.map(async (id) => {
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
    enabled: Boolean(publicClient && chain && tokenIdsPage.length > 0),
    staleTime: 30000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Mutation: Claim fees for a position
  const { toast } = useToast();
  const [claimingTokenId, setClaimingTokenId] = useState<bigint | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<"loading" | "success" | "error">("loading");
  const [txTitle, setTxTitle] = useState<string | undefined>(undefined);
  const [txDesc, setTxDesc] = useState<string | undefined>(undefined);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const claimMutation = useMutation({
    mutationFn: async (vars: { tokenId: bigint }) => {
      if (!publicClient || !chain) throw new Error("Provider not ready");
      if (!walletAddress) throw new Error("Wallet not connected");
      if (!walletClient) throw new Error("Wallet client unavailable");
      return collectFeesFromPosition(publicClient, walletClient, chain.id, walletAddress as `0x${string}`, vars.tokenId);
    },
    onSuccess: async (res) => {
      const tidBig = claimingTokenId ?? null;
      if (tidBig && chain?.id) invalidatePositionCaches(chain.id, tidBig);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees-page", chain?.id, tokenIdsPageKeys] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts-page", chain?.id, tokenIdsPageKeys] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees"] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts"] }),
      ]);
      const tid = claimingTokenId?.toString();
      let actual: string | undefined = undefined;
      try {
        if (tid && publicClient && chain) {
          const details = detailsMap?.[tid] ?? await getPositionDetails(publicClient, chain.id, BigInt(tid));
          if (details && res?.txHash) {
            const verified = await verifyFeeCollection(
              publicClient,
              chain.id,
              res.txHash as `0x${string}`,
              walletAddress as `0x${string}`,
              details.token0.address,
              details.token1.address
            );
            actual = `${verified.token0.amount} ${verified.token0.symbol} / ${verified.token1.amount} ${verified.token1.symbol}`;
          }
        }
      } catch {}
      setTxStatus("success");
      setTxTitle("Fees claimed");
      setTxDesc(actual ? `Collected: ${actual}` : "Fees claimed successfully.");
      setTxHash(res?.txHash);
      setClaimingTokenId(null);
      setBalancesRefreshKey((k) => k + 1);
      setTxOpen(true);
    },
    onError: (err: any) => {
      const msg = err?.shortMessage || err?.message || "Failed to claim fees";
      setTxStatus("error");
      setTxTitle("Claim failed");
      setTxDesc(msg);
      setTxHash(undefined);
      setClaimingTokenId(null);
      setTxOpen(true);
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
            {visiblePositions.map((position) => {
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
              const price0 = getTokenUSDPrice(details?.token0.address ?? fallbackPool?.token0.id);
              const price1 = getTokenUSDPrice(details?.token1.address ?? fallbackPool?.token1.id);
              const amt0 = amountInfo ? parseFloat(amountInfo.token0.estimate) : 0;
              const amt1 = amountInfo ? parseFloat(amountInfo.token1.estimate) : 0;
              const usdTotal = (amt0 * price0) + (amt1 * price1);
              const positionValue = amountInfo
                ? `~ ${formatUSD(usdTotal)} (${amt0.toFixed(6)} ${amountInfo.token0.symbol} / ${amt1.toFixed(6)} ${amountInfo.token1.symbol})`
                : "-";
              const apr = fallbackPool ? calculateAPR(fallbackPool) : "N/A";
              const priceRange = details ? "Custom range" : "";
              const toPrice = (tick: number) => Number(Math.pow(1.0001, tick)).toFixed(4);
              const minPrice = details ? toPrice(details.tickLower) : "";
              const maxPrice = details ? toPrice(details.tickUpper) : "";
              
              return (
                <Card key={position.id} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden hover:border-primary/20 transition-colors">
                  <div className="p-6">
                    {/* Top Section */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
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
                        <div className="flex-1 min-w-0">
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
                      <div className="flex items-center gap-2 w-full md:min-w-[300px]">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-4 border-t border-glass">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Position</div>
                        <div className="text-sm font-medium">
                          {amountInfo ? (
                            <>
                              {formatUSD(usdTotal)}
                              <span className="hidden sm:inline"> ({amt0.toFixed(4)} {amountInfo.token0.symbol} / {amt1.toFixed(4)} {amountInfo.token1.symbol})</span>
                            </>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Claimable Fees</div>
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
                                <div className="text-sm font-medium">
                                  {formatUSD(usd)}
                                  <span className="hidden sm:inline"> ({f0.toFixed(4)} {feesInfo.token0.symbol} / {f1.toFixed(4)} {feesInfo.token1.symbol})</span>
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
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-start md:justify-end gap-2 col-span-1 sm:col-span-2 md:col-span-1 mt-2 sm:mt-0">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const tid = BigInt(position.tokenId);
                            setClaimingTokenId(tid);
                            setTxOpen(true);
                            setTxStatus("loading");
                            setTxTitle("Claiming fees");
                            setTxDesc(`Submitting claim for position #${position.tokenId}...`);
                            setTxHash(undefined);
                            claimMutation.mutate({ tokenId: tid });
                          }}
                          disabled={(() => {
                            if (!walletAddress) return true;
                            // Disable only if this position is being claimed
                            if (claimMutation.isPending && claimingTokenId?.toString() === position.tokenId) return true;
                            // Disable while fees are estimating/loading
                            if (feesLoading) return true;
                            const feesInfo = feesMap?.[position.tokenId];
                            // Allow claim if no estimate (feesInfo undefined)
                            if (!feesInfo) return false;
                            const f0 = parseFloat(feesInfo.token0.amount) || 0;
                            const f1 = parseFloat(feesInfo.token1.amount) || 0;
                            return (f0 === 0 && f1 === 0);
                          })()}
                          className="w-full sm:w-auto"
                        >
                          {claimMutation.isPending && claimingTokenId?.toString() === position.tokenId ? (
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
                          className="w-full sm:w-auto"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">Page {clampedPage + 1} of {totalPages}</div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPosPage(Math.max(0, clampedPage - 1))}
                  disabled={clampedPage <= 0}
                >
                  Prev
                </Button>
                <Button
                  className="bg-gradient-primary"
                  onClick={() => setPosPage(Math.min(totalPages - 1, clampedPage + 1))}
                  disabled={clampedPage >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
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
    <TxStatusDialog
      open={txOpen}
      onOpenChange={setTxOpen}
      status={txStatus}
      title={txTitle}
      description={txDesc}
      chainId={chain?.id}
      txHash={txHash}
    />
    </>
  );
};

export default MyPositions;
