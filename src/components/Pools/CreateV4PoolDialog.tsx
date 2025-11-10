import { useState } from "react";
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
import { useNetwork } from "@/contexts/NetworkContext";
import { useV4Provider } from "@/hooks/useV4Provider";
import { useWeb3Provider } from "@/hooks/useWeb3Provider";
import { toast } from "@/hooks/use-toast";
import { Token } from "@uniswap/sdk-core";
import { initializePool } from "@/services/uniswap/v4/poolService";
import { isV4SupportedNetwork } from "@/config/uniswapV4";

interface CreateV4PoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEE_TIERS = [
  { value: "500", label: "0.05% (Stablecoins)" },
  { value: "3000", label: "0.3% (Standard)" },
  { value: "10000", label: "1% (Exotic)" },
];

const TICK_SPACINGS = [
  { value: "10", label: "10" },
  { value: "60", label: "60" },
  { value: "200", label: "200" },
];

export function CreateV4PoolDialog({ open, onOpenChange }: CreateV4PoolDialogProps) {
  const { currentNetwork, walletAddress } = useNetwork();
  const { publicClient, walletClient } = useV4Provider();
  const { provider, signer } = useWeb3Provider();

  const [token0Address, setToken0Address] = useState("");
  const [token1Address, setToken1Address] = useState("");
  const [fee, setFee] = useState("3000");
  const [tickSpacing, setTickSpacing] = useState("60");
  const [isLoading, setIsLoading] = useState(false);

  const isSupported = isV4SupportedNetwork(currentNetwork.chainId);

  const handleCreatePool = async () => {
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    if (!token0Address || !token1Address) {
      toast({
        title: "Invalid Input",
        description: "Please enter both token addresses",
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
      // Create Token instances (simplified - you'd want to fetch actual token info)
      const token0 = new Token(currentNetwork.chainId, token0Address, 18, "TOKEN0", "Token 0");
      const token1 = new Token(currentNetwork.chainId, token1Address, 18, "TOKEN1", "Token 1");

      const pool = await initializePool(
        publicClient,
        walletClient,
        currentNetwork.chainId,
        walletAddress as `0x${string}`,
        token0,
        token1,
        parseInt(fee),
        parseInt(tickSpacing),
        "0x0000000000000000000000000000000000000000"
      );

      toast({
        title: "Pool Created!",
        description: `Successfully initialized pool for ${token0.symbol}/${token1.symbol}`,
      });

      onOpenChange(false);
      
      // Reset form
      setToken0Address("");
      setToken1Address("");
      setFee("3000");
      setTickSpacing("60");
    } catch (error) {
      console.error("Error creating pool:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create pool",
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
          <DialogTitle>Create New V4 Pool</DialogTitle>
          <DialogDescription>
            Initialize a new Uniswap V4 liquidity pool with custom parameters
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
            <Label htmlFor="token1">Token 1 Address</Label>
            <Input
              id="token1"
              placeholder="0x..."
              value={token1Address}
              onChange={(e) => setToken1Address(e.target.value)}
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

          <div className="space-y-2">
            <Label htmlFor="tickSpacing">Tick Spacing</Label>
            <Select value={tickSpacing} onValueChange={setTickSpacing}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICK_SPACINGS.map((spacing) => (
                  <SelectItem key={spacing.value} value={spacing.value}>
                    {spacing.label}
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
          <Button onClick={handleCreatePool} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Pool"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
