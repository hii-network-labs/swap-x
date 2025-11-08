import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Coins, Plus, Minus, Loader2, AlertCircle } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePositions } from "@/hooks/usePositions";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Helper to format fee tier
const formatFeeTier = (fee: number): string => {
  return `${(fee / 10000).toFixed(2)}%`;
};

const MyPositions = () => {
  const { walletAddress } = useNetwork();
  const { positions, isLoading, error, isSupported } = usePositions();

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

  if (!isSupported) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              My Positions
            </h1>
            <p className="text-muted-foreground">
              Manage your liquidity positions and track earnings
            </p>
          </div>
          <Alert className="border-orange-500/50 bg-orange-500/10">
            <AlertCircle className="h-4 w-4 text-orange-400" />
            <AlertDescription className="text-orange-400">
              Uniswap V3 is not supported on this network. Please switch to Ethereum, Sepolia, or BSC.
            </AlertDescription>
          </Alert>
        </div>
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
            Fetching your positions from the blockchain...
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
            <div className="text-sm text-muted-foreground mb-1">Active Positions</div>
            <div className="text-2xl font-bold">
              {positions.length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">In Range</div>
            <div className="text-2xl font-bold text-green-400">
              {positions.filter(p => p.inRange).length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Out of Range</div>
            <div className="text-2xl font-bold text-orange-400">
              {positions.filter(p => !p.inRange).length}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Liquidity</div>
            <div className="text-2xl font-bold">
              {positions.length} {positions.length === 1 ? 'Pool' : 'Pools'}
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
              Create your first liquidity position to start earning fees
            </p>
            <Button className="bg-gradient-primary hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Create Position
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => {
              const tokenPair = `${position.pool.token0.symbol}/${position.pool.token1.symbol}`;
              const feeTier = formatFeeTier(position.pool.fee);
              
              return (
                <Card key={position.tokenId} className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
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
                                variant={position.inRange ? "default" : "outline"}
                                className={cn(
                                  position.inRange
                                    ? "bg-green-500/20 text-green-400 border-green-500/50" 
                                    : "bg-orange-500/20 text-orange-400 border-orange-500/50"
                                )}
                              >
                                {position.inRange ? "In Range" : "Out of Range"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Price range: {position.priceRange.lower.toFixed(4)} - {position.priceRange.upper.toFixed(4)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Current price: {position.priceRange.current.toFixed(4)} {position.pool.token1.symbol}/{position.pool.token0.symbol}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Token Amounts</div>
                            <div className="font-semibold text-sm">
                              {parseFloat(position.token0Amount).toFixed(6)} {position.pool.token0.symbol}
                            </div>
                            <div className="font-semibold text-sm">
                              {parseFloat(position.token1Amount).toFixed(6)} {position.pool.token1.symbol}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Liquidity</div>
                            <div className="font-semibold">
                              {parseFloat(position.liquidity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Unclaimed Fees</div>
                            <div className="font-semibold text-primary text-sm">
                              {(parseFloat(position.unclaimedFees0) / 10 ** position.pool.token0.decimals).toFixed(6)} {position.pool.token0.symbol}
                            </div>
                            <div className="font-semibold text-primary text-sm">
                              {(parseFloat(position.unclaimedFees1) / 10 ** position.pool.token1.decimals).toFixed(6)} {position.pool.token1.symbol}
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
