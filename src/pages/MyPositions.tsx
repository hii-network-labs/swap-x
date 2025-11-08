import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Coins, TrendingUp, Plus, Minus } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  tokenPair: string;
  token1Symbol: string;
  token2Symbol: string;
  feeTier: string;
  priceRange: {
    min: string;
    max: string;
  };
  liquidity: string;
  currentValue: number;
  initialDeposit: number;
  unclaimedFees: {
    token1: string;
    token2: string;
    usdValue: number;
  };
  status: "in-range" | "out-of-range";
}

const MOCK_POSITIONS: Position[] = [
  {
    id: "1",
    tokenPair: "ETH/USDC",
    token1Symbol: "ETH",
    token2Symbol: "USDC",
    feeTier: "0.3%",
    priceRange: { min: "1800", max: "2200" },
    liquidity: "125,400",
    currentValue: 15420.50,
    initialDeposit: 15000,
    unclaimedFees: {
      token1: "0.0234",
      token2: "45.67",
      usdValue: 125.34
    },
    status: "in-range"
  },
  {
    id: "2",
    tokenPair: "USDC/USDT",
    token1Symbol: "USDC",
    token2Symbol: "USDT",
    feeTier: "0.01%",
    priceRange: { min: "0.998", max: "1.002" },
    liquidity: "89,300",
    currentValue: 8950.20,
    initialDeposit: 9000,
    unclaimedFees: {
      token1: "12.45",
      token2: "11.23",
      usdValue: 23.68
    },
    status: "in-range"
  },
  {
    id: "3",
    tokenPair: "WBTC/ETH",
    token1Symbol: "WBTC",
    token2Symbol: "ETH",
    feeTier: "0.3%",
    priceRange: { min: "14.5", max: "16.5" },
    liquidity: "67,100",
    currentValue: 23100.00,
    initialDeposit: 22000,
    unclaimedFees: {
      token1: "0.0012",
      token2: "0.0189",
      usdValue: 89.45
    },
    status: "out-of-range"
  }
];

const MyPositions = () => {
  const { walletAddress } = useNetwork();

  const calculateProfitLoss = (current: number, initial: number) => {
    const diff = current - initial;
    const percentage = (diff / initial) * 100;
    return { amount: diff, percentage };
  };

  const totalValue = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.currentValue, 0);
  const totalInitial = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.initialDeposit, 0);
  const totalFees = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.unclaimedFees.usdValue, 0);
  const totalPL = calculateProfitLoss(totalValue, totalInitial);

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

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Value</div>
            <div className="text-2xl font-bold">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total P&L</div>
            <div className={cn(
              "text-2xl font-bold flex items-center gap-1",
              totalPL.amount >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {totalPL.amount >= 0 ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : (
                <ArrowDownRight className="h-5 w-5" />
              )}
              {totalPL.percentage >= 0 ? "+" : ""}{totalPL.percentage.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ${Math.abs(totalPL.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Unclaimed Fees</div>
            <div className="text-2xl font-bold text-primary">
              ${totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </Card>

          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Active Positions</div>
            <div className="text-2xl font-bold">
              {MOCK_POSITIONS.length}
            </div>
          </Card>
        </div>

        {/* Positions List */}
        {MOCK_POSITIONS.length === 0 ? (
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
            {MOCK_POSITIONS.map((position) => {
              const pl = calculateProfitLoss(position.currentValue, position.initialDeposit);
              
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
                                {position.token1Symbol.substring(0, 1)}
                              </span>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-secondary flex items-center justify-center border-2 border-card">
                              <span className="text-sm font-bold">
                                {position.token2Symbol.substring(0, 1)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-bold">{position.tokenPair}</h3>
                              <Badge variant="outline" className="border-glass">
                                {position.feeTier}
                              </Badge>
                              <Badge 
                                variant={position.status === "in-range" ? "default" : "outline"}
                                className={cn(
                                  position.status === "in-range" 
                                    ? "bg-green-500/20 text-green-400 border-green-500/50" 
                                    : "bg-orange-500/20 text-orange-400 border-orange-500/50"
                                )}
                              >
                                {position.status === "in-range" ? "In Range" : "Out of Range"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Price range: {position.priceRange.min} - {position.priceRange.max} {position.token2Symbol}/{position.token1Symbol}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Current Value</div>
                            <div className="font-semibold">
                              ${position.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Initial Deposit</div>
                            <div className="font-semibold">
                              ${position.initialDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Profit/Loss</div>
                            <div className={cn(
                              "font-semibold flex items-center gap-1",
                              pl.amount >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                              {pl.amount >= 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {pl.percentage >= 0 ? "+" : ""}{pl.percentage.toFixed(2)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Unclaimed Fees</div>
                            <div className="font-semibold text-primary">
                              ${position.unclaimedFees.usdValue.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {position.unclaimedFees.token1} {position.token1Symbol} + {position.unclaimedFees.token2} {position.token2Symbol}
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
