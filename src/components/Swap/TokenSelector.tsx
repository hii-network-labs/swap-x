import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Token {
  symbol: string;
  name: string;
  logo: string;
  address: string;
  coingeckoId: string;
}

const POPULAR_TOKENS: Token[] = [
  { symbol: "ETH", name: "Ethereum", logo: "⟠", address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum" },
  { symbol: "USDC", name: "USD Coin", logo: "💵", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", coingeckoId: "usd-coin" },
  { symbol: "USDT", name: "Tether", logo: "₮", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", coingeckoId: "tether" },
  { symbol: "DAI", name: "Dai Stablecoin", logo: "◈", address: "0x6b175474e89094c44da98b954eedeac495271d0f", coingeckoId: "dai" },
  { symbol: "WBTC", name: "Wrapped Bitcoin", logo: "₿", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", coingeckoId: "wrapped-bitcoin" },
  { symbol: "UNI", name: "Uniswap", logo: "🦄", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", coingeckoId: "uniswap" },
];

interface TokenSelectorProps {
  selectedToken: Token | null;
  onSelectToken: (token: Token) => void;
}

export const TokenSelector = ({ selectedToken, onSelectToken }: TokenSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTokens = POPULAR_TOKENS.filter(token =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (token: Token) => {
    onSelectToken(token);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-auto p-2 hover:bg-muted/50">
          {selectedToken ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl">{selectedToken.logo}</span>
              <span className="font-semibold text-lg">{selectedToken.symbol}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Select token</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-glass">
        <DialogHeader>
          <DialogTitle>Select a token</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or paste address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50 border-glass"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="space-y-1">
            {filteredTokens.map((token) => (
              <button
                key={token.address}
                onClick={() => handleSelect(token)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <span className="text-3xl">{token.logo}</span>
                <div className="flex flex-col items-start">
                  <span className="font-semibold">{token.symbol}</span>
                  <span className="text-sm text-muted-foreground">{token.name}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
