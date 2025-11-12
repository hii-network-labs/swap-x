import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Token } from "./TokenSelector";
import { ArrowDown } from "lucide-react";

interface SwapConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  exchangeRate: number;
  slippage: number;
  priceUsd: { from: number; to: number };
}

export const SwapConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  exchangeRate,
  slippage,
  priceUsd,
}: SwapConfirmDialogProps) => {
  const minReceived = parseFloat(toAmount) * (1 - slippage / 100);
  const totalValueUsd = parseFloat(fromAmount) * priceUsd.from;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm swap</AlertDialogTitle>
          <AlertDialogDescription>
            Please review swap details before confirming
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* From Token */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <span className="text-sm text-muted-foreground">You pay</span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={fromToken.logo} alt={fromToken.symbol} className="w-8 h-8 rounded-full" />
                <div>
                  <div className="font-semibold text-lg">{fromAmount}</div>
                  <div className="text-sm text-muted-foreground">{fromToken.symbol}</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                ~${totalValueUsd.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="bg-muted/50 rounded-full p-2">
              <ArrowDown className="h-4 w-4" />
            </div>
          </div>

          {/* To Token */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <span className="text-sm text-muted-foreground">You receive</span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={toToken.logo} alt={toToken.symbol} className="w-8 h-8 rounded-full" />
                <div>
                  <div className="font-semibold text-lg">{toAmount}</div>
                  <div className="text-sm text-muted-foreground">{toToken.symbol}</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                ~${(parseFloat(toAmount) * priceUsd.to).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Exchange rate</span>
              <span className="font-medium">
                1 {fromToken.symbol} = {exchangeRate.toFixed(6)} {toToken.symbol}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Slippage tolerance</span>
              <span className="font-medium">{slippage}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Minimum received</span>
              <span className="font-medium">
                {minReceived.toFixed(6)} {toToken.symbol}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction fee</span>
              <span className="font-medium text-muted-foreground">~$0.00 (Demo)</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-600 dark:text-amber-400">
            ⚠️ Output will be sent to your wallet after the swap completes
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-gradient-primary">
            Confirm Swap
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
