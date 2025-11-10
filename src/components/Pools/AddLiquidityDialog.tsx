import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNetwork } from "@/contexts/NetworkContext";
import { useV4Provider } from "@/hooks/useV4Provider";
import { toast } from "@/hooks/use-toast";
import { Token } from "@uniswap/sdk-core";
import { initializePool, getPool } from "@/services/uniswap/v4/poolService";
import { mintPosition } from "@/services/uniswap/v4/positionService";
import { fetchTokenInfo } from "@/services/uniswap/v4/helpers";
import { isV4SupportedNetwork } from "@/config/uniswapV4";
import { AlertCircle } from "lucide-react";

interface AddLiquidityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEE_TIERS = [
  { value: "500", label: "0.05% (Stablecoins)" },
  { value: "3000", label: "0.3% (Standard)" },
  { value: "10000", label: "1% (Exotic)" },
];

const TICK_SPACINGS: Record<string, string> = {
  "500": "10",
  "3000": "60",
  "10000": "200",
};

export function AddLiquidityDialog({ open, onOpenChange }: AddLiquidityDialogProps) {
  const { currentNetwork, walletAddress } = useNetwork();
  const { publicClient, walletClient } = useV4Provider();

  const [token0Address, setToken0Address] = useState("");
  const [token1Address, setToken1Address] = useState("");
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [fee, setFee] = useState("3000");
  const [isLoading, setIsLoading] = useState(false);
  const [poolExists, setPoolExists] = useState<boolean | null>(null);
  const [checkingPool, setCheckingPool] = useState(false);

  const isSupported = isV4SupportedNetwork(currentNetwork.chainId);
  const tickSpacing = TICK_SPACINGS[fee];

  // Check if pool exists when addresses and fee change
  useEffect(() => {
    const checkPool = async () => {
      if (!token0Address || !token1Address || !publicClient) {
        setPoolExists(null);
        return;
      }

      try {
        setCheckingPool(true);
        const token0Info = await fetchTokenInfo(publicClient, token0Address as `0x${string}`);
        const token1Info = await fetchTokenInfo(publicClient, token1Address as `0x${string}`);

        const token0 = new Token(
          currentNetwork.chainId,
          token0Address,
          token0Info.decimals,
          token0Info.symbol,
          token0Info.name
        );
        const token1 = new Token(
          currentNetwork.chainId,
          token1Address,
          token1Info.decimals,
          token1Info.symbol,
          token1Info.name
        );

        const poolData = await getPool(
          publicClient,
          currentNetwork.chainId,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000",
          token0,
          token1
        );

        setPoolExists(!!poolData?.pool);
      } catch (error) {
        console.error("Error checking pool:", error);
        setPoolExists(false);
      } finally {
        setCheckingPool(false);
      }
    };

    checkPool();
  }, [token0Address, token1Address, fee, tickSpacing, currentNetwork.chainId, publicClient]);

  const handleAddLiquidity = async () => {
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    if (!token0Address || !token1Address || !amount0 || !amount1) {
      toast({
        title: "Invalid Input",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (!publicClient || !walletClient) {
      toast({
        title: "Provider Error",
        description: "V4 provider not available",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Fetch token info
      const token0Info = await fetchTokenInfo(publicClient, token0Address as `0x${string}`);
      const token1Info = await fetchTokenInfo(publicClient, token1Address as `0x${string}`);

      const token0 = new Token(
        currentNetwork.chainId,
        token0Address,
        token0Info.decimals,
        token0Info.symbol,
        token0Info.name
      );
      const token1 = new Token(
        currentNetwork.chainId,
        token1Address,
        token1Info.decimals,
        token1Info.symbol,
        token1Info.name
      );

      // Sort tokens
      const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
      const sortedToken0 = token0IsA ? token0 : token1;
      const sortedToken1 = token0IsA ? token1 : token0;

      // If pool doesn't exist, initialize it first
      if (!poolExists) {
        toast({
          title: "Creating New Pool",
          description: "Initializing pool first...",
        });

        await initializePool(
          publicClient,
          walletClient,
          currentNetwork.chainId,
          walletAddress as `0x${string}`,
          sortedToken0,
          sortedToken1,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000"
        );

        toast({
          title: "Pool Created!",
          description: `Pool for ${token0Info.symbol}/${token1Info.symbol} initialized`,
        });
      }

      // Convert amounts to smallest unit
      const amount0Wei = BigInt(Math.floor(parseFloat(amount0) * 10 ** token0.decimals));
      const amount1Wei = BigInt(Math.floor(parseFloat(amount1) * 10 ** token1.decimals));

      // Mint position
      await mintPosition(
        publicClient,
        walletClient,
        currentNetwork.chainId,
        walletAddress as `0x${string}`,
        parseInt(fee),
        parseInt(tickSpacing),
        "0x0000000000000000000000000000000000000000",
        sortedToken0,
        sortedToken1,
        amount0Wei.toString(),
        amount1Wei.toString(),
        true
      );

      toast({
        title: "Liquidity Added!",
        description: `Successfully added liquidity to ${token0Info.symbol}/${token1Info.symbol}`,
      });

      onOpenChange(false);

      // Reset form
      setToken0Address("");
      setToken1Address("");
      setAmount0("");
      setAmount1("");
      setFee("3000");
      setPoolExists(null);
    } catch (error) {
      console.error("Error adding liquidity:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add liquidity",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uniswap V4 Not Supported</DialogTitle>
            <DialogDescription>
              Uniswap V4 is not available on {currentNetwork.name}. Please switch to HII Testnet.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Liquidity</DialogTitle>
          <DialogDescription>
            Add liquidity to a Uniswap V4 pool. If the pool doesn't exist, it will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {poolExists === false && token0Address && token1Address && !checkingPool && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pool doesn't exist yet. A new pool will be created with your first liquidity.
              </AlertDescription>
            </Alert>
          )}

          {poolExists === true && !checkingPool && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pool exists. Adding liquidity to existing pool.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="token0">Token 0 Address</Label>
            <Input
              id="token0"
              placeholder="0x..."
              value={token0Address}
              onChange={(e) => setToken0Address(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount0">Token 0 Amount</Label>
            <Input
              id="amount0"
              type="number"
              placeholder="1.0"
              value={amount0}
              onChange={(e) => setAmount0(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token1">Token 1 Address</Label>
            <Input
              id="token1"
              placeholder="0x..."
              value={token1Address}
              onChange={(e) => setToken1Address(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount1">Token 1 Amount</Label>
            <Input
              id="amount1"
              type="number"
              placeholder="1000.0"
              value={amount1}
              onChange={(e) => setAmount1(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fee">Fee Tier</Label>
            <Select value={fee} onValueChange={setFee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEE_TIERS.map((tier) => (
                  <SelectItem key={tier.value} value={tier.value}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddLiquidity} disabled={isLoading || checkingPool}>
            {isLoading 
              ? "Processing..." 
              : poolExists === false 
                ? "Create Pool & Add Liquidity" 
                : "Add Liquidity"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
