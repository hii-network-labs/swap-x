import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Search, Info, Loader2, X } from "lucide-react";
import { Token } from "@/components/Swap/TokenSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNetwork } from "@/contexts/NetworkContext";
import { Badge } from "@/components/ui/badge";
import { getTokensForNetwork, searchTokenByAddress } from "@/services/tokenService";
import { useToast } from "@/hooks/use-toast";
import { isCustomToken, removeCustomToken } from "@/utils/tokenStorage";

const POPULAR_TOKENS: Token[] = [
  { symbol: "ETH", name: "Ethereum", logo: "⟠", address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum" },
  { symbol: "USDC", name: "USD Coin", logo: "💵", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", coingeckoId: "usd-coin" },
  { symbol: "USDT", name: "Tether", logo: "₮", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", coingeckoId: "tether" },
  { symbol: "DAI", name: "Dai Stablecoin", logo: "◈", address: "0x6b175474e89094c44da98b954eedeac495271d0f", coingeckoId: "dai" },
  { symbol: "WBTC", name: "Wrapped Bitcoin", logo: "₿", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", coingeckoId: "wrapped-bitcoin" },
  { symbol: "UNI", name: "Uniswap", logo: "🦄", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", coingeckoId: "uniswap" },
];

interface FeeTier {
  percentage: string;
  description: string;
  tvl: string;
}

const FEE_TIERS: FeeTier[] = [
  { percentage: "0.01%", description: "Tốt nhất cho các cặp rất ổn định", tvl: "0 TVL" },
  { percentage: "0.05%", description: "Tốt nhất cho các cặp ổn định", tvl: "0 TVL" },
  { percentage: "0.3%", description: "Tốt nhất cho hầu hết các cặp", tvl: "0 TVL" },
  { percentage: "1%", description: "Tốt nhất cho các cặp đặc biệt", tvl: "0 TVL" },
];

interface CreatePoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenPickerProps {
  token: Token | null;
  onSelect: (token: Token) => void;
  label: string;
}

const TokenPicker = ({ token, onSelect, label }: TokenPickerProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { currentNetwork } = useNetwork();
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const { toast } = useToast();

  // Load tokens when network changes or dialog opens
  useEffect(() => {
    if (pickerOpen) {
      loadTokens();
    }
  }, [pickerOpen, currentNetwork.chainId]);

  const loadTokens = async () => {
    setIsLoading(true);
    try {
      const tokens = await getTokensForNetwork(currentNetwork.chainId);
      setAvailableTokens(tokens);
    } catch (error) {
      console.error("Error loading tokens:", error);
      toast({
        title: "Lỗi tải token",
        description: "Không thể tải danh sách token. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Search by address if query looks like an address
  useEffect(() => {
    const searchAddress = async () => {
      if (searchQuery.match(/^0x[a-fA-F0-9]{40}$/)) {
        setIsSearchingAddress(true);
        try {
          const foundToken = await searchTokenByAddress(
            searchQuery, 
            currentNetwork.chainId,
            currentNetwork.rpcUrl
          );
          if (foundToken) {
            // Add to list if not already present
            setAvailableTokens((prev) => {
              const exists = prev.find(
                (t) => t.address.toLowerCase() === foundToken.address.toLowerCase()
              );
              return exists ? prev : [foundToken, ...prev];
            });
            toast({
              title: "Token tìm thấy!",
              description: `${foundToken.symbol} - ${foundToken.name}`,
            });
          } else {
            toast({
              title: "Token không hợp lệ",
              description: "Không tìm thấy token ERC20 với địa chỉ này trên mạng hiện tại.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Error searching token:", error);
          toast({
            title: "Lỗi tìm kiếm",
            description: "Có lỗi xảy ra khi tìm kiếm token. Vui lòng thử lại.",
            variant: "destructive",
          });
        } finally {
          setIsSearchingAddress(false);
        }
      }
    };

    const timeoutId = setTimeout(searchAddress, 800);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentNetwork.chainId, currentNetwork.rpcUrl]);

  const filteredTokens = availableTokens.filter(t =>
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (selectedToken: Token) => {
    onSelect(selectedToken);
    setPickerOpen(false);
    setSearchQuery("");
  };

  const handleRemoveToken = (tokenAddress: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustomToken(tokenAddress, currentNetwork.chainId);
    // Reload tokens
    loadTokens();
    toast({
      title: "Token đã xóa",
      description: "Token đã được xóa khỏi danh sách của bạn.",
    });
  };

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">{label}</Label>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors border border-glass"
        >
          {token ? (
            <div className="flex items-center gap-3">
              <span className="text-2xl">{token.logo}</span>
              <span className="font-semibold text-lg">{token.symbol}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Chọn token</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <DialogContent className="bg-card border-glass">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Chọn token</span>
              <Badge variant="outline" className="border-glass">
                {currentNetwork.name}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            {isSearchingAddress && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 text-muted-foreground animate-spin" />
            )}
            <Input
              placeholder="Tìm kiếm tên hoặc địa chỉ token (0x...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-muted/50 border-glass"
            />
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {filteredTokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Không tìm thấy token</p>
                    <p className="text-xs mt-2">
                      Thử nhập địa chỉ contract (0x...)
                    </p>
                  </div>
                ) : (
                  filteredTokens.map((t) => {
                    const isCustom = isCustomToken(t.address, currentNetwork.chainId);
                    return (
                      <div
                        key={t.address}
                        className="relative group"
                      >
                        <button
                          onClick={() => handleSelect(t)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-3xl">{t.logo}</span>
                          <div className="flex flex-col items-start flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{t.symbol}</span>
                              {isCustom && (
                                <Badge variant="outline" className="text-xs border-glass">
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{t.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {t.address.slice(0, 6)}...{t.address.slice(-4)}
                          </span>
                        </button>
                        {isCustom && (
                          <button
                            onClick={(e) => handleRemoveToken(t.address, e)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-destructive/20 hover:bg-destructive/30 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Xóa token này"
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const CreatePoolDialog = ({ open, onOpenChange }: CreatePoolDialogProps) => {
  const [step, setStep] = useState(1);
  const [token1, setToken1] = useState<Token | null>(null);
  const [token2, setToken2] = useState<Token | null>(null);
  const [selectedFee, setSelectedFee] = useState<string | null>(null);
  const [customFee, setCustomFee] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const { currentNetwork } = useNetwork();

  const handleClose = () => {
    setStep(1);
    setToken1(null);
    setToken2(null);
    setSelectedFee(null);
    setCustomFee("");
    setFeeSearch("");
    onOpenChange(false);
  };

  const canContinueStep1 = token1 && token2 && token1.address !== token2.address;
  const canContinueStep2 = selectedFee !== null;

  const handleContinue = () => {
    if (step === 1 && canContinueStep1) {
      setStep(2);
    } else if (step === 2 && canContinueStep2) {
      // TODO: Implement pool creation logic
      console.log("Creating pool:", { token1, token2, fee: selectedFee });
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-glass max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center justify-between">
            <span>Vị thế mới</span>
            <Badge 
              variant={currentNetwork.isTestnet ? "outline" : "default"} 
              className={cn(
                "border-glass",
                currentNetwork.isTestnet && "text-orange-500 border-orange-500/50"
              )}
            >
              {currentNetwork.name}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {/* Steps indicator */}
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-semibold transition-colors",
                step === 1 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                1
              </div>
              <div>
                <div className="text-sm font-medium">Bước 1</div>
                <div className="text-xs text-muted-foreground">Chọn cặp token và phí</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-semibold transition-colors",
                step === 2 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                2
              </div>
              <div>
                <div className="text-sm font-medium">Bước 2</div>
                <div className="text-xs text-muted-foreground">Đặt khoảng giá và số tiền nạp</div>
              </div>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-glass">
                <h3 className="font-semibold">Chọn cặp</h3>
                <p className="text-sm text-muted-foreground">
                  Chọn token bạn muốn cung cấp thanh khoản. Bạn có thể chọn token trên tất cả các mạng được hỗ trợ.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <TokenPicker token={token1} onSelect={setToken1} label="Token đầu tiên" />
                  <TokenPicker token={token2} onSelect={setToken2} label="Token thứ hai" />
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-glass">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Bậc phí</h3>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span className="text-xs">Ít hơn</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Số tiền kiếm được cung cấp thanh khoản. Chọn số tiền phù hợp với khả năng chịu rủi ro và chiến lược của bạn.
                </p>

                {/* Fee Tier Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium">
                      Bậc phí {selectedFee || "0,0001%"}
                    </span>
                    {selectedFee && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                        TVL cao nhất
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Phần trăm phí bạn sẽ nhận được
                  </span>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {FEE_TIERS.map((tier) => (
                      <button
                        key={tier.percentage}
                        onClick={() => setSelectedFee(tier.percentage)}
                        className={cn(
                          "p-4 rounded-lg border text-left transition-all",
                          selectedFee === tier.percentage
                            ? "border-primary bg-primary/10"
                            : "border-glass bg-muted/30 hover:bg-muted/50"
                        )}
                      >
                        <div className="font-semibold text-lg mb-1">{tier.percentage}</div>
                        <div className="text-xs text-muted-foreground mb-2">{tier.description}</div>
                        <div className="text-xs text-muted-foreground">{tier.tvl}</div>
                      </button>
                    ))}
                  </div>

                  {/* Search for other fee tiers */}
                  <div className="relative mt-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Tìm kiếm hoặc tạo các bậc phí khác (Nâng cao)"
                      value={feeSearch}
                      onChange={(e) => setFeeSearch(e.target.value)}
                      className="pl-10 bg-muted/50 border-glass text-sm"
                      disabled
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg bg-muted/30 border border-glass">
                <h3 className="font-semibold mb-2">Thông tin pool</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cặp:</span>
                    <span className="font-medium">{token1?.symbol}/{token2?.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phí:</span>
                    <span className="font-medium">{selectedFee}</span>
                  </div>
                </div>
              </div>
              <div className="text-center text-muted-foreground">
                <p>Tính năng này đang được phát triển</p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-glass">
          <Button
            onClick={handleContinue}
            disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
            className="w-full bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Tiếp tục
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
