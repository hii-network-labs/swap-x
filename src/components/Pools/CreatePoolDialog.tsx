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
import { getTokenBalance, getNativeBalance } from "@/utils/erc20";

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
  const [customFeeInput, setCustomFeeInput] = useState("");
  const [isCustomFee, setIsCustomFee] = useState(false);
  const [customFeeError, setCustomFeeError] = useState<string | null>(null);
  const [feeSearch, setFeeSearch] = useState("");
  
  // Step 2 states
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [amount1, setAmount1] = useState("");
  const [amount2, setAmount2] = useState("");
  const [priceRangeError, setPriceRangeError] = useState<string | null>(null);
  
  // Balance states
  const [balance1, setBalance1] = useState<string | null>(null);
  const [balance2, setBalance2] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  
  const { currentNetwork, walletAddress } = useNetwork();
  const { toast } = useToast();

  // Fetch balances when tokens or wallet change
  useEffect(() => {
    const fetchBalances = async () => {
      if (!walletAddress || !token1 || !token2) {
        setBalance1(null);
        setBalance2(null);
        return;
      }

      setLoadingBalances(true);
      try {
        // Fetch both balances in parallel
        const [bal1, bal2] = await Promise.all([
          token1.address === "0x0000000000000000000000000000000000000000"
            ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
            : getTokenBalance(token1.address, walletAddress, currentNetwork.rpcUrl),
          token2.address === "0x0000000000000000000000000000000000000000"
            ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
            : getTokenBalance(token2.address, walletAddress, currentNetwork.rpcUrl),
        ]);

        setBalance1(bal1);
        setBalance2(bal2);
      } catch (error) {
        console.error("Error fetching balances:", error);
        setBalance1(null);
        setBalance2(null);
      } finally {
        setLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [token1, token2, walletAddress, currentNetwork.rpcUrl]);

  const validateCustomFee = (value: string): boolean => {
    setCustomFeeError(null);
    
    if (!value) {
      setCustomFeeError("Vui lòng nhập phí");
      return false;
    }

    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      setCustomFeeError("Giá trị không hợp lệ");
      return false;
    }

    if (numValue < 0.0001) {
      setCustomFeeError("Phí tối thiểu là 0.0001%");
      return false;
    }

    if (numValue > 99.9999) {
      setCustomFeeError("Phí tối đa là 99.9999%");
      return false;
    }

    return true;
  };

  const handleCustomFeeChange = (value: string) => {
    // Allow only numbers and one decimal point
    const sanitized = value.replace(/[^\d.]/g, '');
    // Prevent multiple decimal points
    const parts = sanitized.split('.');
    const formatted = parts.length > 2 
      ? parts[0] + '.' + parts.slice(1).join('') 
      : sanitized;
    
    setCustomFeeInput(formatted);
    
    if (formatted) {
      validateCustomFee(formatted);
      setSelectedFee(formatted + '%');
    } else {
      setCustomFeeError(null);
      setSelectedFee(null);
    }
  };

  const handlePresetFeeSelect = (fee: string) => {
    setIsCustomFee(false);
    setCustomFeeInput("");
    setCustomFeeError(null);
    setSelectedFee(fee);
  };

  const handleCustomFeeToggle = () => {
    setIsCustomFee(true);
    setSelectedFee(null);
  };

  const validatePriceRange = (): boolean => {
    setPriceRangeError(null);
    
    if (!minPrice || !maxPrice) {
      setPriceRangeError("Vui lòng nhập cả giá min và max");
      return false;
    }
    
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    
    if (isNaN(min) || isNaN(max)) {
      setPriceRangeError("Giá trị không hợp lệ");
      return false;
    }
    
    if (min <= 0 || max <= 0) {
      setPriceRangeError("Giá phải lớn hơn 0");
      return false;
    }
    
    if (min >= max) {
      setPriceRangeError("Giá Min phải nhỏ hơn giá Max");
      return false;
    }
    
    return true;
  };

  // Check if price range is valid without updating state (for condition checks)
  const isPriceRangeValid = (): boolean => {
    if (!minPrice || !maxPrice) return false;
    
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    
    if (isNaN(min) || isNaN(max)) return false;
    if (min <= 0 || max <= 0) return false;
    if (min >= max) return false;
    
    return true;
  };

  const handleClose = () => {
    setStep(1);
    setToken1(null);
    setToken2(null);
    setSelectedFee(null);
    setCustomFeeInput("");
    setIsCustomFee(false);
    setCustomFeeError(null);
    setFeeSearch("");
    setMinPrice("");
    setMaxPrice("");
    setAmount1("");
    setAmount2("");
    setPriceRangeError(null);
    setBalance1(null);
    setBalance2(null);
    onOpenChange(false);
  };

  // Handle MAX button click
  const handleMaxAmount1 = () => {
    if (balance1) {
      setAmount1(balance1);
    }
  };

  const handleMaxAmount2 = () => {
    if (balance2) {
      setAmount2(balance2);
    }
  };

  // Format balance for display
  const formatBalance = (balance: string | null): string => {
    if (!balance) return "0.0";
    const num = parseFloat(balance);
    if (num === 0) return "0.0";
    if (num < 0.0001) return "< 0.0001";
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toFixed(2);
  };

  const canContinueStep1 = token1 && token2 && token1.address !== token2.address && selectedFee !== null && !customFeeError;
  const canContinueStep2 = amount1 && amount2 && isPriceRangeValid();

  const handleContinue = () => {
    if (step === 1 && canContinueStep1) {
      setStep(2);
    } else if (step === 2) {
      if (!validatePriceRange()) {
        toast({
          title: "Lỗi khoảng giá",
          description: priceRangeError || "Vui lòng kiểm tra lại khoảng giá",
          variant: "destructive",
        });
        return;
      }
      
      if (!amount1 || !amount2) {
        toast({
          title: "Lỗi số lượng",
          description: "Vui lòng nhập số lượng cho cả 2 tokens",
          variant: "destructive",
        });
        return;
      }
      
      // TODO: Implement actual pool creation logic
      console.log("Creating pool:", { 
        token1, 
        token2, 
        fee: selectedFee,
        minPrice,
        maxPrice,
        amount1,
        amount2
      });
      
      toast({
        title: "Tạo pool thành công!",
        description: `Pool ${token1?.symbol}/${token2?.symbol} đã được tạo`,
      });
      
      handleClose();
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    }
  };

  // Calculate current price (mock - would come from pool data)
  const currentPrice = token1 && token2 ? "1.0" : "0";
  
  // Calculate estimated liquidity shares (simplified calculation)
  const calculateLiquidity = () => {
    if (!amount1 || !amount2 || !minPrice || !maxPrice) return "0";
    const avg = (parseFloat(amount1) * parseFloat(amount2)) ** 0.5;
    return avg.toFixed(6);
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
          <p className="text-sm text-muted-foreground">
            Tạo liquidity position mới trên {currentNetwork.name}
          </p>
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
                    {selectedFee && !isCustomFee && (
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                        TVL cao nhất
                      </span>
                    )}
                    {isCustomFee && selectedFee && (
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary/20 text-secondary">
                        Tùy chọn
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
                        onClick={() => handlePresetFeeSelect(tier.percentage)}
                        className={cn(
                          "p-4 rounded-lg border text-left transition-all",
                          selectedFee === tier.percentage && !isCustomFee
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

                  {/* Custom Fee Input */}
                  <div className="mt-4 p-4 rounded-lg border border-glass bg-muted/20">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-semibold">Bậc phí tùy chọn</Label>
                      <span className="text-xs text-muted-foreground">0.0001% - 99.9999%</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="Nhập phí (vd: 0.5)"
                            value={customFeeInput}
                            onChange={(e) => handleCustomFeeChange(e.target.value)}
                            onFocus={handleCustomFeeToggle}
                            className={cn(
                              "pr-8 bg-background border-glass",
                              customFeeError && "border-destructive"
                            )}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            %
                          </span>
                        </div>
                        {customFeeError && (
                          <p className="text-xs text-destructive mt-1">{customFeeError}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Phí cao hơn có thể mang lại lợi nhuận cao hơn nhưng giảm tính cạnh tranh
                    </p>
                  </div>

                  {/* Search for other fee tiers - Hidden for now */}
                  <div className="relative mt-4 hidden">
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
              {/* Pool Info Summary */}
              <div className="p-4 rounded-lg bg-muted/30 border border-glass">
                <h3 className="font-semibold mb-3">Thông tin pool</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cặp:</span>
                    <span className="font-medium">{token1?.symbol}/{token2?.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phí:</span>
                    <span className="font-medium">{selectedFee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Giá hiện tại:</span>
                    <span className="font-medium">
                      {currentPrice} {token2?.symbol}/{token1?.symbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Range */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-glass">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Đặt khoảng giá</h3>
                  <Badge variant="outline" className="border-glass text-xs">
                    {token2?.symbol}/{token1?.symbol}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Thanh khoản của bạn sẽ hoạt động trong khoảng giá này. Giá ngoài khoảng này sẽ không được sử dụng.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Giá Min</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="0.0"
                        value={minPrice}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          setMinPrice(value);
                          setPriceRangeError(null);
                        }}
                        className="bg-background border-glass pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                        {token2?.symbol}/{token1?.symbol}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Giá Max</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="0.0"
                        value={maxPrice}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          setMaxPrice(value);
                          setPriceRangeError(null);
                        }}
                        className="bg-background border-glass pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                        {token2?.symbol}/{token1?.symbol}
                      </span>
                    </div>
                  </div>
                </div>
                
                {priceRangeError && (
                  <p className="text-xs text-destructive">{priceRangeError}</p>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMinPrice("0.5");
                      setMaxPrice("2.0");
                    }}
                    className="flex-1 border-glass"
                  >
                    Khoảng hẹp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMinPrice("0.1");
                      setMaxPrice("10.0");
                    }}
                    className="flex-1 border-glass"
                  >
                    Khoảng rộng
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMinPrice("0");
                      setMaxPrice("999999");
                    }}
                    className="flex-1 border-glass"
                  >
                    Toàn bộ
                  </Button>
                </div>
              </div>

              {/* Deposit Amounts */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-glass">
                <h3 className="font-semibold">Số lượng nạp</h3>
                <p className="text-sm text-muted-foreground">
                  Nhập số lượng token bạn muốn thêm vào pool
                </p>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{token1?.symbol}</Label>
                      <span className="text-xs text-muted-foreground">
                        {loadingBalances ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </span>
                        ) : walletAddress ? (
                          `Balance: ${formatBalance(balance1)}`
                        ) : (
                          "Connect wallet"
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="0.0"
                        value={amount1}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          setAmount1(value);
                        }}
                        className="flex-1 bg-background border-glass"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-glass"
                        onClick={handleMaxAmount1}
                        disabled={!balance1 || parseFloat(balance1) === 0}
                      >
                        MAX
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{token2?.symbol}</Label>
                      <span className="text-xs text-muted-foreground">
                        {loadingBalances ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </span>
                        ) : walletAddress ? (
                          `Balance: ${formatBalance(balance2)}`
                        ) : (
                          "Connect wallet"
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="0.0"
                        value={amount2}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          setAmount2(value);
                        }}
                        className="flex-1 bg-background border-glass"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-glass"
                        onClick={handleMaxAmount2}
                        disabled={!balance2 || parseFloat(balance2) === 0}
                      >
                        MAX
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Position Preview */}
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-secondary/5 border border-glass">
                <h3 className="font-semibold mb-3">Xem trước position</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Khoảng giá:</span>
                    <span className="font-medium">
                      {minPrice || "0"} - {maxPrice || "∞"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Liquidity shares:</span>
                    <span className="font-medium">{calculateLiquidity()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{token1?.symbol} nạp:</span>
                    <span className="font-medium">{amount1 || "0"} {token1?.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{token2?.symbol} nạp:</span>
                    <span className="font-medium">{amount2 || "0"} {token2?.symbol}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-glass/50">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Phí giao dịch:</span>
                      <span className="font-medium">{selectedFee}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-glass flex gap-2">
          {step === 2 && (
            <Button
              onClick={handleBack}
              variant="outline"
              className="flex-1 border-glass"
            >
              Quay lại
            </Button>
          )}
          <Button
            onClick={handleContinue}
            disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
            className={cn(
              "bg-gradient-primary hover:opacity-90 transition-opacity disabled:opacity-50",
              step === 1 ? "w-full" : "flex-1"
            )}
          >
            {step === 1 ? "Tiếp tục" : "Tạo Position"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
