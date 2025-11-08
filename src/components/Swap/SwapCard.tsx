import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowDown, Settings } from "lucide-react";
import { TokenSelector, Token } from "./TokenSelector";
import { toast } from "sonner";

export const SwapCard = () => {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");

  const handleSwap = () => {
    if (!fromToken || !toToken || !fromAmount) {
      toast.error("Please fill in all fields");
      return;
    }
    toast.success("Swap initiated! (Demo mode)");
  };

  const switchTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  return (
    <Card className="w-full max-w-md p-4 bg-card/80 backdrop-blur-xl border-glass shadow-glow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Swap</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {/* From Token */}
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">You pay</span>
            <span className="text-sm text-muted-foreground">Balance: 0.00</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="border-0 bg-transparent text-2xl font-semibold p-0 h-auto focus-visible:ring-0"
            />
            <TokenSelector selectedToken={fromToken} onSelectToken={setFromToken} />
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={switchTokens}
            className="h-10 w-10 rounded-xl bg-card border border-glass hover:bg-muted/50"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        </div>

        {/* To Token */}
        <div className="bg-muted/50 rounded-2xl p-4 border border-glass">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">You receive</span>
            <span className="text-sm text-muted-foreground">Balance: 0.00</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              placeholder="0.0"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              className="border-0 bg-transparent text-2xl font-semibold p-0 h-auto focus-visible:ring-0"
            />
            <TokenSelector selectedToken={toToken} onSelectToken={setToToken} />
          </div>
        </div>
      </div>

      {fromToken && toToken && fromAmount && (
        <div className="mt-4 p-3 bg-muted/30 rounded-xl border border-glass">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Rate</span>
            <span>1 {fromToken.symbol} = 1.00 {toToken.symbol}</span>
          </div>
        </div>
      )}

      <Button 
        onClick={handleSwap}
        className="w-full mt-4 h-14 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity"
      >
        Swap
      </Button>
    </Card>
  );
};
