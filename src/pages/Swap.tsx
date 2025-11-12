import { useMemo, useState } from "react";
import { SwapCard } from "@/components/Swap/SwapCard";
import { PriceChart } from "@/components/Swap/PriceChart";
import { Token } from "@/components/Swap/TokenSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, TrendingUp } from "lucide-react";
import { useLocation } from "react-router-dom";

const Swap = () => {
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);

  const location = useLocation();
  const { initialFrom, initialTo } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      initialFrom: params.get("from") || undefined,
      initialTo: params.get("to") || undefined,
    };
  }, [location.search]);

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        {/* Desktop Grid Layout */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-6 items-start">
          <PriceChart 
            key={`${fromToken?.address || fromToken?.symbol || 'from-default'}-${toToken?.address || toToken?.symbol || 'to-default'}`}
            fromToken={fromToken} 
            toToken={toToken} 
          />
          <div className="flex justify-center lg:justify-start">
            <SwapCard 
              initialFromAddress={initialFrom}
              initialToAddress={initialTo}
              selectedFromToken={fromToken}
              selectedToToken={toToken}
              onSelectFromToken={setFromToken}
              onSelectToToken={setToToken}
              onTokensChange={(from, to) => {
                setFromToken(from);
                setToToken(to);
              }} 
            />
          </div>
        </div>

        {/* Mobile/Tablet Tabs Layout */}
        <div className="lg:hidden">
          <Tabs defaultValue="swap" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-card/80 backdrop-blur-xl border-glass">
              <TabsTrigger 
                value="swap" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Swap
              </TabsTrigger>
              <TabsTrigger 
                value="chart" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Chart
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="swap" className="animate-fade-in">
              <div className="flex justify-center">
                <SwapCard 
                  initialFromAddress={initialFrom}
                  initialToAddress={initialTo}
                  selectedFromToken={fromToken}
                  selectedToToken={toToken}
                  onSelectFromToken={setFromToken}
                  onSelectToToken={setToToken}
                  onTokensChange={(from, to) => {
                    setFromToken(from);
                    setToToken(to);
                  }} 
                />
              </div>
            </TabsContent>
            
            <TabsContent value="chart" className="animate-fade-in">
              <PriceChart 
                key={`${fromToken?.address || fromToken?.symbol || 'from-default'}-${toToken?.address || toToken?.symbol || 'to-default'}`}
                fromToken={fromToken} 
                toToken={toToken} 
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Swap;
