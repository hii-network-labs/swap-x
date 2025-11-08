import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp } from "lucide-react";

interface Pool {
  pair: string;
  tvl: string;
  volume24h: string;
  apr: string;
}

const MOCK_POOLS: Pool[] = [
  { pair: "ETH/USDC", tvl: "$125.4M", volume24h: "$45.2M", apr: "12.4%" },
  { pair: "USDC/USDT", tvl: "$89.3M", volume24h: "$67.8M", apr: "8.2%" },
  { pair: "WBTC/ETH", tvl: "$67.1M", volume24h: "$23.5M", apr: "15.7%" },
  { pair: "DAI/USDC", tvl: "$45.8M", volume24h: "$34.1M", apr: "6.9%" },
  { pair: "UNI/ETH", tvl: "$34.2M", volume24h: "$12.3M", apr: "18.3%" },
];

const Pools = () => {
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
            <Button className="bg-gradient-primary hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              New Position
            </Button>
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-glass">
                  <th className="text-left p-4 text-muted-foreground font-medium">Pool</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">TVL</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Volume (24h)</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">APR</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_POOLS.map((pool, index) => (
                  <tr 
                    key={pool.pair} 
                    className="border-b border-glass last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center border-2 border-card">
                            <span className="text-xs font-bold">
                              {pool.pair.split('/')[0].substring(0, 1)}
                            </span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-gradient-secondary flex items-center justify-center border-2 border-card">
                            <span className="text-xs font-bold">
                              {pool.pair.split('/')[1].substring(0, 1)}
                            </span>
                          </div>
                        </div>
                        <span className="font-semibold">{pool.pair}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium">{pool.tvl}</td>
                    <td className="p-4 font-medium">{pool.volume24h}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-green-400">
                        <TrendingUp className="h-4 w-4" />
                        <span className="font-semibold">{pool.apr}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-glass hover:bg-muted/50"
                      >
                        Add Liquidity
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Total Value Locked</div>
            <div className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              $361.8M
            </div>
          </Card>
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">24h Volume</div>
            <div className="text-3xl font-bold bg-gradient-secondary bg-clip-text text-transparent">
              $182.9M
            </div>
          </Card>
          <Card className="p-6 bg-card/80 backdrop-blur-xl border-glass">
            <div className="text-sm text-muted-foreground mb-1">Active Pools</div>
            <div className="text-3xl font-bold text-foreground">
              {MOCK_POOLS.length}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Pools;
