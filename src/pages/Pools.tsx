import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Loader2, AlertCircle, Coins, Minus } from "lucide-react";
import { useState } from "react";
import { AddLiquidityDialog } from "@/components/Pools/AddLiquidityDialog";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useNetwork } from "@/contexts/NetworkContext";
import { cn } from "@/lib/utils";

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
  const { pools, isLoading, error } = useSubgraphPools();
  const { positions, isLoading: positionsLoading, error: positionsError } = useSubgraphPositions();
  const { walletAddress } = useNetwork();

  // Calculate total stats from pools
  const totalLiquidity = pools.reduce((acc, pool) => {
    return acc + parseFloat(pool.liquidity || "0");
  }, 0);

  const totalVolume = pools.reduce((acc, pool) => {
    const vol0 = parseFloat(pool.volumeToken0 || "0");
    const vol1 = parseFloat(pool.volumeToken1 || "0");
    return acc + vol0 + vol1;
  }, 0);

  const formatLiquidity = (liquidity: string) => {
    const val = parseFloat(liquidity);
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(2)}K`;
    return `$${val.toFixed(2)}`;
  };

  const formatVolume = (vol0: string, vol1: string) => {
    const total = parseFloat(vol0 || "0") + parseFloat(vol1 || "0");
    if (total >= 1e9) return `$${(total / 1e9).toFixed(2)}B`;
    if (total >= 1e6) return `$${(total / 1e6).toFixed(2)}M`;
    if (total >= 1e3) return `$${(total / 1e3).toFixed(2)}K`;
    return `$${total.toFixed(2)}`;
  };

  const calculateAPR = (pool: any) => {
    // Simple APR calculation based on volume and liquidity
    const vol = parseFloat(pool.volumeToken0 || "0") + parseFloat(pool.volumeToken1 || "0");
    const liq = parseFloat(pool.liquidity || "1");
    // Approximate fee based on tickSpacing (1 = 0.01%, 10 = 0.05%, 60 = 0.3%, 200 = 1%)
    const tickSpacing = parseInt(pool.tickSpacing || "10");
    const fee = tickSpacing === 1 ? 0.0001 : tickSpacing === 10 ? 0.0005 : tickSpacing === 60 ? 0.003 : 0.01;
    const apr = (vol * 365 * fee / liq) * 100;
    return apr > 0 ? `${apr.toFixed(2)}%` : "N/A";
  };

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
              onClick={() => setAddLiquidityOpen(true)}
              className="bg-gradient-primary hover:opacity-90"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Liquidity
            </Button>
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
              Failed to load pools: {error}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Loading Pools</h3>
            <p className="text-muted-foreground">
              Fetching pool data from subgraph...
            </p>
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
                    <th className="text-left p-4 text-muted-foreground font-medium">Pool</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Fee Tier</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Liquidity</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Volume</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">APR</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Transactions</th>
                    <th className="text-right p-4 text-muted-foreground font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => {
                    const pair = `${pool.token0.symbol}/${pool.token1.symbol}`;
                    const feeTier = `${(parseInt(pool.tickSpacing) / 10).toFixed(2)}%`;
                    
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
                        <td className="p-4 font-medium">{formatLiquidity(pool.liquidity)}</td>
                        <td className="p-4 font-medium">{formatVolume(pool.volumeToken0, pool.volumeToken1)}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1 text-green-400">
                            <TrendingUp className="h-4 w-4" />
                            <span className="font-semibold">{calculateAPR(pool)}</span>
                          </div>
                        </td>
                        <td className="p-4 font-medium">{pool.txCount}</td>
                        <td className="p-4 text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-glass hover:bg-muted/50"
                            onClick={() => setAddLiquidityOpen(true)}
                          >
                            Add Liquidity
                          </Button>
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
              {formatLiquidity(totalLiquidity.toString())}
            </div>
          </Card>
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Volume</div>
            <div className="text-3xl font-bold bg-gradient-secondary bg-clip-text text-transparent">
              {formatLiquidity(totalVolume.toString())}
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
                <p className="text-muted-foreground">
                  Fetching your positions from the blockchain...
                </p>
              </Card>
            ) : (
              <>
                {positionsError && (
                  <Alert className="mb-8 border-red-500/50 bg-red-500/10">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-400">
                      {positionsError}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
                    <div className="text-sm text-muted-foreground mb-1">Total Positions</div>
                    <div className="text-2xl font-bold">
                      {positions.length}
                    </div>
                  </Card>

                  <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
                    <div className="text-sm text-muted-foreground mb-1">NFT Tokens</div>
                    <div className="text-2xl font-bold text-primary">
                      {positions.length}
                    </div>
                  </Card>

                  <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
                    <div className="text-sm text-muted-foreground mb-1">Transfers</div>
                    <div className="text-2xl font-bold text-secondary">
                      {positions.reduce((acc, p) => acc + (p.transfers?.length || 0), 0)}
                    </div>
                  </Card>
                </div>

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
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Liquidity
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {positions.map((position) => (
                      <Card key={position.id} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden hover:border-primary/50 transition-colors">
                        <div className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
                                <Coins className="h-6 w-6" />
                              </div>
                              <div>
                                <h3 className="font-bold text-lg">Position #{position.tokenId}</h3>
                                <Badge variant="outline" className="border-glass mt-1">
                                  NFT
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Token ID</div>
                              <div className="font-mono text-sm font-semibold">
                                {position.tokenId}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Owner</div>
                              <div className="font-mono text-xs truncate">
                                {position.owner}
                              </div>
                            </div>

                            {position.transfers && position.transfers.length > 0 && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Transfers</div>
                                <div className="text-sm font-semibold">
                                  {position.transfers.length} transfer{position.transfers.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 mt-6">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-glass hover:bg-muted/50"
                            >
                              View Details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-glass hover:bg-primary/20"
                              onClick={() => setAddLiquidityOpen(true)}
                            >
                              Manage
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

      <AddLiquidityDialog open={addLiquidityOpen} onOpenChange={setAddLiquidityOpen} />
      </div>
    </div>
  );
};

export default Pools;
