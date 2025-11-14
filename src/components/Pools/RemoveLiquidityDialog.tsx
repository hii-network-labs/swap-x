import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { TxStatusDialog } from "@/components/ui/TxStatusDialog";
import { useNetwork } from "@/contexts/NetworkContext";
import { useV4Provider } from "@/hooks/useV4Provider";
import { Address } from "viem";
import { removeLiquidityFromPosition, estimateRemoveAmounts } from "@/services/uniswap/v4/positionService";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { invalidatePositionCaches } from "@/services/uniswap/v4/positionService";

interface RemoveLiquidityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: bigint;
  tokenPairLabel?: string;
}

export function RemoveLiquidityDialog({ open, onOpenChange, tokenId, tokenPairLabel }: RemoveLiquidityDialogProps) {
  const { currentNetwork, walletAddress, setBalancesRefreshKey } = useNetwork();
  const { publicClient, walletClient } = useV4Provider();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [percentage, setPercentage] = useState<number>(100);

  const [estLoading, setEstLoading] = useState(false);
  const [estimates, setEstimates] = useState<
    | {
        token0: { symbol: string; address: Address; estimate: string; minimum: string };
        token1: { symbol: string; address: Address; estimate: string; minimum: string };
        inRange: boolean;
        oneSided?: boolean;
        percentageRemoved: number;
      }
    | null
  >(null);

  const [txOpen, setTxOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<"loading" | "success" | "error">("loading");
  const [txTitle, setTxTitle] = useState<string | undefined>(undefined);
  const [txDesc, setTxDesc] = useState<string | undefined>(undefined);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  // Auto-estimate outputs when percentage changes
  const refreshEstimate = async () => {
    try {
      if (!publicClient || !currentNetwork?.chainId) return;
      setEstLoading(true);
      const res = await estimateRemoveAmounts(
        publicClient,
        currentNetwork.chainId,
        tokenId,
        Math.max(0.01, Math.min(1, percentage / 100)),
        0.5 / 100
      );
      setEstimates(res);
    } catch (e) {
      console.warn("RemoveLiquidityDialog: estimate failed", e);
      setEstimates(null);
    } finally {
      setEstLoading(false);
    }
  };

  // Trigger estimate on open or percentage change
  // Avoid spamming when dialog closed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      refreshEstimate();
    }
  }, [open, percentage, publicClient, currentNetwork?.chainId, tokenId]);

  const onRemove = async () => {
    if (!walletAddress) {
      toast({ title: "Wallet Not Connected", description: "Please connect your wallet", variant: "destructive" });
      return;
    }
    if (!publicClient || !walletClient) {
      toast({ title: "Provider Error", description: "V4 provider not available", variant: "destructive" });
      return;
    }

    try {
      console.groupCollapsed("🟦 UI/RemoveLiquidityDialog onRemove");
      console.debug("network:", {
        name: currentNetwork?.name,
        chainId: currentNetwork?.chainId,
      });
      console.debug("params:", {
        walletAddress,
        tokenId: tokenId.toString(),
        percentage,
        slippagePct: "0.5%",
      });
      setIsLoading(true);
      setTxOpen(true);
      setTxStatus("loading");
      setTxTitle("Removing liquidity");
      setTxDesc(`Submitting remove ${percentage}% liquidity transaction...`);
      setTxHash(undefined);

      const res = await removeLiquidityFromPosition(
        publicClient,
        walletClient,
        currentNetwork.chainId,
        walletAddress as Address,
        tokenId,
        percentage / 100,
        0.5 / 100, // 0.5% slippage
        percentage === 100
      );

      setTxStatus("success");
      setTxTitle("Liquidity removed");
      setTxDesc(`Successfully removed ${percentage}% liquidity${percentage === 100 ? " and burned NFT" : ""}.`);
      setTxHash(res?.txHash);
      if (currentNetwork?.chainId) invalidatePositionCaches(currentNetwork.chainId, tokenId);
      setBalancesRefreshKey((k) => k + 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees"] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-fees-page"] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts"] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts-page"] }),
        queryClient.invalidateQueries({ queryKey: ["v4-position-amounts-tab"] }),
      ]);
      console.debug("✅ onRemove success", { txHash: res?.txHash });
      console.groupEnd();
      toast({ title: "Success", description: `Removed ${percentage}% liquidity`, });
      onOpenChange(false);
    } catch (err) {
      setTxStatus("error");
      setTxTitle("Remove liquidity failed");
      setTxDesc(err instanceof Error ? err.message : "Failed to remove liquidity");
      console.error("❌ onRemove failed", err);
      console.groupEnd();
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to remove liquidity", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remove Liquidity</DialogTitle>
            <DialogDescription>
              {tokenPairLabel ? `Position ${tokenPairLabel}` : "Select the percentage to remove from your position"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Percentage to remove</Label>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                {[25, 50, 70, 100].map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={percentage === p ? "default" : "secondary"}
                    size="sm"
                    className={percentage === p ? "" : "bg-muted"}
                    onClick={() => setPercentage(p)}
                  >
                    {p}%
                  </Button>
                ))}
              </div>

              {/* Numeric input */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={Number.isFinite(percentage) ? percentage : 0}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, ".");
                      const num = parseInt(raw, 10);
                      if (isNaN(num)) {
                        setPercentage(0);
                        return;
                      }
                      const clamped = Math.max(1, Math.min(100, num));
                      setPercentage(clamped);
                    }}
                    placeholder="e.g., 50"
                    inputMode="numeric"
                  />
                </div>
                <span className="text-sm text-muted-foreground">%</span>
              </div>

              {/* Slider synced with input */}
              <Slider
                value={[Math.max(1, Math.min(100, percentage))]}
                onValueChange={(v) => setPercentage(v[0])}
                max={100}
                min={1}
                step={1}
              />
              <div className="text-sm text-muted-foreground">{Math.max(1, Math.min(100, percentage))}%</div>
            </div>

            {/* Estimation panel */}
            <div className="rounded-xl border border-glass p-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Estimated returns</div>
                <div className="text-xs text-muted-foreground">slippage 0.5%</div>
              </div>
              {estLoading ? (
                <div className="text-sm text-muted-foreground">Estimating...</div>
              ) : estimates ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{estimates.token0.symbol}</span>
                    <span className="font-semibold">{estimates.token0.estimate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Minimum {estimates.token0.symbol}</span>
                    <span>{estimates.token0.minimum}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{estimates.token1.symbol}</span>
                    <span className="font-semibold">{estimates.token1.estimate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Minimum {estimates.token1.symbol}</span>
                    <span>{estimates.token1.minimum}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-1">
                    {estimates.inRange ? "Position is in range" : "Position is out of range"}
                  </div>
                  {estimates.oneSided && (
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      Note: Withdrawal may return only one token at current price.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No estimate available</div>
              )}
            </div>

            <div className="flex justify-end items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={onRemove}
                disabled={!walletAddress || isLoading || percentage < 1 || percentage > 100}
                className="bg-gradient-primary"
              >
                {isLoading ? "Processing..." : `Remove ${Math.max(1, Math.min(100, percentage))}%`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TxStatusDialog
        open={txOpen}
        onOpenChange={setTxOpen}
        status={txStatus}
        title={txTitle}
        description={txDesc}
        chainId={currentNetwork.chainId}
        txHash={txHash}
      />
    </>
  );
}