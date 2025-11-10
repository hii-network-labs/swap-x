import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Plus, Loader2, AlertCircle } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

        {/* Summary Card */}
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
            <Button className="bg-gradient-primary hover:opacity-90">
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
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPositions;
