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
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface TxStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "loading" | "success" | "error";
  title?: string;
  description?: string;
  chainId?: number;
  txHash?: string;
}

const explorerBaseForChain = (chainId?: number): string | null => {
  switch (chainId) {
    case 1:
      return "https://etherscan.io/tx/";
    case 5:
      return "https://goerli.etherscan.io/tx/";
    case 56:
      return "https://bscscan.com/tx/";
    case 97:
      return "https://testnet.bscscan.com/tx/";
    case 11155111:
      return "https://sepolia.etherscan.io/tx/";
    case 22469:
      return "https://explorer-sb.teknix.dev/tx/";
    default:
      return null;
  }
};

export const TxStatusDialog = ({
  open,
  onOpenChange,
  status,
  title,
  description,
  chainId,
  txHash,
}: TxStatusDialogProps) => {
  const explorerBase = explorerBaseForChain(chainId);
  const explorerUrl = explorerBase && txHash ? `${explorerBase}${txHash}` : null;
  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title ?? (isLoading ? "Transaction in progress" : isSuccess ? "Transaction succeeded" : "Transaction failed")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? (isLoading ? "Please wait while your transaction is being processed." : isSuccess ? "Your transaction has been confirmed." : "Your transaction did not complete.")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting and waiting for confirmation...
            </div>
          )}
          {isSuccess && (
            <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Transaction confirmed
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <XCircle className="h-5 w-5" />
              Transaction failed
            </div>
          )}

          {explorerUrl && (
            <div className="mt-4 text-sm">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                View on explorer
              </a>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          {isLoading ? (
            <AlertDialogCancel disabled>Close</AlertDialogCancel>
          ) : (
            <AlertDialogAction onClick={() => onOpenChange(false)} className="bg-gradient-primary">
              Close
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};