import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSubgraphTransactions } from "@/hooks/useSubgraphTransactions";
import { ArrowRight, Loader2, RefreshCcw, TrendingUp, TrendingDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const History = () => {
  const { transactions, isLoading, error, refetch } = useSubgraphTransactions();

  const formatDate = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Subgraph amounts (amount0/amount1) are already normalized to token units
  // Show explicit sign: '+' for positive, '-' for negative; 6 decimals
  const formatSignedAmount = (amount: string) => {
    const value = parseFloat(amount);
    if (Number.isNaN(value)) return "-";
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${Math.abs(value).toFixed(6)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
        <Card className="p-8 bg-card/80 backdrop-blur-xl border-glass text-center max-w-md">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Loading transactions</h2>
          <p className="text-muted-foreground">Please wait while we load recent activity.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              Transactions
            </h1>
            <p className="text-muted-foreground">
              All transactions across all pools — Auto-updates
            </p>
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">Unable to load transactions. Please try again.</AlertDescription>
          </Alert>
        )}

        <Card className="bg-card/80 backdrop-blur-xl border-glass overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-muted-foreground text-lg mb-4">
                No transactions yet
              </div>
              <p className="text-sm text-muted-foreground">
                Transactions will appear here when there is pool activity
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[780px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Time</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Pool</TableHead>
                    <TableHead className="whitespace-nowrap">Details</TableHead>
                    <TableHead className="whitespace-nowrap">Sender</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Block</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <>
                      {tx.swaps.map((swap) => (
                        <TableRow key={`${tx.id}-${swap.id}`}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatDate(tx.timestamp)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Swap
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                <div className="w-8 h-8 rounded-full border-2 border-card bg-gradient-primary flex items-center justify-center text-xs font-bold">
                                  {swap.pool.token0.symbol.substring(0, 1)}
                                </div>
                                <div className="w-8 h-8 rounded-full border-2 border-card bg-gradient-secondary flex items-center justify-center text-xs font-bold">
                                  {swap.pool.token1.symbol.substring(0, 1)}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium">
                                  {swap.pool.token0.symbol} / {swap.pool.token1.symbol}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="text-sm">
                                <div className="flex items-center gap-1">
                                  <span className={`font-medium ${parseFloat(swap.amount0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatSignedAmount(swap.amount0)}</span>
                                  <span className="text-muted-foreground">{swap.pool.token0.symbol}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className={`font-medium ${parseFloat(swap.amount1) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatSignedAmount(swap.amount1)}</span>
                                  <span className="text-muted-foreground">{swap.pool.token1.symbol}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-sm whitespace-nowrap">
                              {swap.sender.substring(0, 6)}...{swap.sender.substring(38)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap">
                            {tx.blockNumber}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default History;
