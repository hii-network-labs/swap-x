import { useState } from "react";
import { SwapCard } from "@/components/Swap/SwapCard";
import { PriceChart } from "@/components/Swap/PriceChart";
import { Token } from "@/components/Swap/TokenSelector";

const Swap = () => {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <PriceChart fromToken={fromToken} toToken={toToken} />
          <div className="flex justify-center lg:justify-start">
            <SwapCard 
              onTokensChange={(from, to) => {
                setFromToken(from);
                setToToken(to);
              }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Swap;
