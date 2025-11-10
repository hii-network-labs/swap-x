import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Coins, Plus, Minus, Loader2, AlertCircle } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Helper to format fee tier
const formatFeeTier = (tickSpacing: string): string => {
  // Approximate fee tier from tick spacing
  const spacing = parseInt(tickSpacing);
  if (spacing === 1) return "0.01%";
  if (spacing === 10) return "0.05%";
  if (spacing === 60) return "0.30%";
  if (spacing === 200) return "1.00%";
  return `${(spacing / 10).toFixed(2)}%`;
};

// Helper to calculate price from tick (using formula: 1.0001^tick)
const getPriceFromTick = (tick: string, token0Decimals: number, token1Decimals: number): number => {
  const tickNum = parseInt(tick);
  const price = Math.pow(1.0001, tickNum);
  const adjustedPrice = price * (10 ** (token0Decimals - token1Decimals));
  return adjustedPrice;
};

// Check if position is in range
const isInRange = (tickLower: string, tickUpper: string, currentTick: string): boolean => {
  const lower = parseInt(tickLower);
  const upper = parseInt(tickUpper);
  const current = parseInt(currentTick);
  return current >= lower && current <= upper;
};

const MyPositions = () => {
  const { walletAddress } = useNetwork();
  const { positions, isLoading, error } = useSubgraphPositions();

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
          <p className="text-muted-foreground">
            Fetching your liquidity modifications from the blockchain...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
      <div className="container mx-auto max-w-7xl">
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
            <AlertDescription className="text-red-400">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Liquidity Actions</div>
            <div className="text-2xl font-bold">
              {positions.length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">In Range</div>
            <div className="text-2xl font-bold text-green-400">
              {positions.filter(p => isInRange(p.tickLower, p.tickUpper, p.pool.tick)).length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Out of Range</div>
            <div className="text-2xl font-bold text-orange-400">
              {positions.filter(p => !isInRange(p.tickLower, p.tickUpper, p.pool.tick)).length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Modifications</div>
            <div className="text-2xl font-bold">
              {positions.length}
            </div>
          </Card>
        </div>

        {/* Positions List */}
        {positions.length === 0 ? (
          <Card className="p-12 bg-card/80 backdrop-blur-xl border-glass text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Coins className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No liquidity modifications yet</h3>
            <p className="text-muted-foreground mb-4">
              Add liquidity to a pool to start earning fees
            </p>
            <Button className="bg-gradient-primary hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Add Liquidity
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => {
              const tokenPair = `${position.pool.token0.symbol}/${position.pool.token1.symbol}`;
              const feeTier = formatFeeTier(position.pool.tickSpacing);
              const inRange = isInRange(position.tickLower, position.tickUpper, position.pool.tick);
              
              const token0Decimals = parseInt(position.pool.token0.decimals);
              const token1Decimals = parseInt(position.pool.token1.decimals);
              
              const lowerPrice = getPriceFromTick(position.tickLower, token0Decimals, token1Decimals);
              const upperPrice = getPriceFromTick(position.tickUpper, token0Decimals, token1Decimals);
              const currentPrice = getPriceFromTick(position.pool.tick, token0Decimals, token1Decimals);
              
              return (
                <Card key={position.id} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
                  <div className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Position Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex -space-x-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center border-2 border-card">
                              <span className="text-sm font-bold">
                                {position.pool.token0.symbol.substring(0, 1)}
                              </span>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-secondary flex items-center justify-center border-2 border-card">
                              <span className="text-sm font-bold">
                                {position.pool.token1.symbol.substring(0, 1)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xl font-bold">{tokenPair}</h3>
                              <Badge variant="outline" className="border-glass">
                                {feeTier}
                              </Badge>
                              <Badge 
                                variant={inRange ? "default" : "outline"}
                                className={cn(
                                  inRange
                                    ? "bg-green-500/20 text-green-400 border-green-500/50" 
                                    : "bg-orange-500/20 text-orange-400 border-orange-500/50"
                                )}
                              >
                                {inRange ? "In Range" : "Out of Range"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Price range: {lowerPrice.toFixed(6)} - {upperPrice.toFixed(6)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Current price: {currentPrice.toFixed(6)} {position.pool.token1.symbol}/{position.pool.token0.symbol}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mt-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Liquidity Delta</div>
                            <div className="font-semibold">
                              {parseFloat(position.liquidityDelta).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Tick Range</div>
                            <div className="font-semibold text-sm">
                              {position.tickLower} to {position.tickUpper}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex lg:flex-col gap-2 lg:min-w-[140px]">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 lg:flex-none border-glass hover:bg-muted/50"
                        >
                          <Coins className="mr-2 h-4 w-4" />
                          Claim Fees
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 lg:flex-none border-glass hover:bg-muted/50"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 lg:flex-none border-glass hover:bg-destructive/20 hover:text-destructive"
                        >
                          <Minus className="mr-2 h-4 w-4" />
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
  );
};

export default MyPositions;
