import { useState, useEffect, useMemo } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNetwork } from "@/contexts/NetworkContext";
import { useV4Provider } from "@/hooks/useV4Provider";
import { toast } from "@/hooks/use-toast";
import { Token, Percent } from "@uniswap/sdk-core";
import { Position } from "@uniswap/v4-sdk";
import { nearestUsableTick } from "@uniswap/v3-sdk";
import { initializePool, getPool } from "@/services/uniswap/v4/poolService";
import { mintPosition } from "@/services/uniswap/v4/positionService";
import { fetchTokenInfo, ZERO_ADDRESS } from "@/services/uniswap/v4/helpers";
import { isV4SupportedNetwork } from "@/config/uniswapV4";
import { AlertCircle, ChevronsUpDown } from "lucide-react";
import { useSubgraphPools } from "@/hooks/useSubgraphPools";
import { TxStatusDialog } from "@/components/ui/TxStatusDialog";
import { getTokenBalance, getNativeBalance } from "@/utils/erc20";

interface AddLiquidityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialToken0?: string;
  initialToken1?: string;
  initialFee?: string; // expects one of "500" | "3000" | "10000"
}

const FEE_TIERS = [
  { value: "100", label: "0.01%" },
  { value: "500", label: "0.05% (Stablecoins)" },
  { value: "3000", label: "0.3% (Standard)" },
  { value: "10000", label: "1% (Exotic)" },
];

const TICK_SPACINGS: Record<string, string> = {
  "100": "1",
  "500": "10",
  "3000": "60",
  "10000": "200",
};

export function AddLiquidityDialog({ open, onOpenChange, initialToken0, initialToken1, initialFee }: AddLiquidityDialogProps) {
  const { currentNetwork, walletAddress, balancesRefreshKey, setBalancesRefreshKey } = useNetwork();
  const { publicClient, walletClient } = useV4Provider();
  const { pools } = useSubgraphPools();

  const [token0Address, setToken0Address] = useState("");
  const [token1Address, setToken1Address] = useState("");
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [lastEdited, setLastEdited] = useState<"amount0" | "amount1" | null>(null);
  const [fee, setFee] = useState("3000");
  const [isLoading, setIsLoading] = useState(false);
  const [poolExists, setPoolExists] = useState<boolean | null>(null);
  const [checkingPool, setCheckingPool] = useState(false);
  const [token0Meta, setToken0Meta] = useState<{ symbol: string; name: string; decimals: number } | null>(null);
  const [token1Meta, setToken1Meta] = useState<{ symbol: string; name: string; decimals: number } | null>(null);
  const [openPicker0, setOpenPicker0] = useState(false);
  const [openPicker1, setOpenPicker1] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<"loading" | "success" | "error">("loading");
  const [txTitle, setTxTitle] = useState<string | undefined>(undefined);
  const [txDesc, setTxDesc] = useState<string | undefined>(undefined);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [token0Balance, setToken0Balance] = useState<string | null>(null);
  const [token1Balance, setToken1Balance] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [insufficient0, setInsufficient0] = useState<string | null>(null);
  const [insufficient1, setInsufficient1] = useState<string | null>(null);

  const isSupported = isV4SupportedNetwork(currentNetwork.chainId);
  const tickSpacing = TICK_SPACINGS[fee];

  const isNativeAddress = (addr?: string) => addr?.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  const DEFAULT_MINT_GAS_UNITS = 500000; // rough estimate
  const GAS_BUFFER_MULTIPLIER = 1.2;
  const estimateNativeGasReserve = async (): Promise<number> => {
    try {
      if (!publicClient) return 0.02;
      const gasPriceWei = Number(await publicClient.getGasPrice());
      const feeWei = gasPriceWei * DEFAULT_MINT_GAS_UNITS * GAS_BUFFER_MULTIPLIER;
      return feeWei / 1e18;
    } catch {
      return 0.02;
    }
  };

  // Chuẩn hóa chuỗi số thập phân: thay ',' bằng '.', loại bỏ ký tự không hợp lệ
  const sanitizeDecimalInput = (value: string) => {
    if (!value) return "";
    let v = value.replace(/,/g, ".");
    v = v.replace(/[^\d.]/g, "");
    const parts = v.split(".");
    if (parts.length > 2) {
      v = parts[0] + "." + parts.slice(1).join("");
    }
    return v;
  };

  // Chuẩn hóa chuỗi xuất ra input: luôn dùng '.' làm dấu thập phân
  const formatDecimalOutput = (num: number, maximumFractionDigits: number = 6) => {
    if (!Number.isFinite(num)) return "";
    const s = num.toFixed(maximumFractionDigits);
    return s.replace(/\.0+$/, "").replace(/(\..*?)0+$/, "$1");
  };

  // Prefill when dialog opens or presets change
  useEffect(() => {
    if (!open) return;
    if (initialToken0) setToken0Address(initialToken0);
    if (initialToken1) setToken1Address(initialToken1);
    if (initialFee && TICK_SPACINGS[initialFee]) setFee(initialFee);
  }, [open, initialToken0, initialToken1, initialFee]);

  // Load balances for token0/token1
  useEffect(() => {
    const loadBalances = async () => {
      try {
        setLoadingBalances(true);
        if (!walletAddress || !currentNetwork?.rpcUrl) {
          setToken0Balance(null);
          setToken1Balance(null);
          return;
        }
        const [b0, b1] = await Promise.all([
          isNativeAddress(token0Address)
            ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
            : (token0Address ? getTokenBalance(token0Address, walletAddress, currentNetwork.rpcUrl) : Promise.resolve(null)),
          isNativeAddress(token1Address)
            ? getNativeBalance(walletAddress, currentNetwork.rpcUrl)
            : (token1Address ? getTokenBalance(token1Address, walletAddress, currentNetwork.rpcUrl) : Promise.resolve(null)),
        ]);
        setToken0Balance(b0);
        setToken1Balance(b1);
      } catch (e) {
        setToken0Balance(null);
        setToken1Balance(null);
      } finally {
        setLoadingBalances(false);
      }
    };
    loadBalances();
  }, [walletAddress, currentNetwork?.rpcUrl, token0Address, token1Address, balancesRefreshKey]);

  // Validate amounts vs balances and gas reserve for native
  useEffect(() => {
    const check0 = async () => {
      setInsufficient0(null);
      const amt = parseFloat(amount0 || "0");
      const bal = parseFloat(token0Balance || "0");
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(bal)) return;
      if (isNativeAddress(token0Address)) {
        const reserve = await estimateNativeGasReserve();
        const maxSpendable = Math.max(0, bal - reserve);
        if (maxSpendable <= 0) setInsufficient0("Insufficient native balance to cover gas fees.");
        else if (amt > maxSpendable) setInsufficient0(`Token0 amount exceeds balance after reserving gas (~${reserve.toFixed(4)}).`);
      } else if (amt > bal) {
        setInsufficient0("Insufficient Token0 balance.");
      }
    };
    const check1 = async () => {
      setInsufficient1(null);
      const amt = parseFloat(amount1 || "0");
      const bal = parseFloat(token1Balance || "0");
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(bal)) return;
      if (isNativeAddress(token1Address)) {
        const reserve = await estimateNativeGasReserve();
        const maxSpendable = Math.max(0, bal - reserve);
        if (maxSpendable <= 0) setInsufficient1("Insufficient native balance to cover gas fees.");
        else if (amt > maxSpendable) setInsufficient1(`Token1 amount exceeds balance after reserving gas (~${reserve.toFixed(4)}).`);
      } else if (amt > bal) {
        setInsufficient1("Insufficient Token1 balance.");
      }
    };
    check0();
    check1();
  }, [amount0, amount1, token0Address, token1Address, token0Balance, token1Balance]);

  // Build token list from pools
  const poolTokens = useMemo(() => {
    const map = new Map<string, { address: string; symbol: string; name: string }>();
    for (const p of pools) {
      if (p.token0?.id && p.token0?.symbol) {
        const addr = p.token0.id.toLowerCase();
        const isHii = currentNetwork.chainId === 22469;
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const displaySymbol = isZero && isHii ? "HNC" : p.token0.symbol;
        const displayName = isZero && isHii ? "HNC" : (p.token0.name || p.token0.symbol);
        if (!map.has(addr)) {
          map.set(addr, { address: addr, symbol: displaySymbol, name: displayName });
        }
      }
      if (p.token1?.id && p.token1?.symbol) {
        const addr = p.token1.id.toLowerCase();
        const isHii = currentNetwork.chainId === 22469;
        const isZero = addr === ZERO_ADDRESS.toLowerCase();
        const displaySymbol = isZero && isHii ? "HNC" : p.token1.symbol;
        const displayName = isZero && isHii ? "HNC" : (p.token1.name || p.token1.symbol);
        if (!map.has(addr)) {
          map.set(addr, { address: addr, symbol: displaySymbol, name: displayName });
        }
      }
    }
    return Array.from(map.values());
  }, [pools]);

  // Optional adjacency: restrict token1 options based on selected token0
  const adjacency = useMemo(() => {
    const adj: Record<string, Set<string>> = {};
    for (const p of pools) {
      const a = p.token0?.id?.toLowerCase();
      const b = p.token1?.id?.toLowerCase();
      if (!a || !b) continue;
      if (!adj[a]) adj[a] = new Set<string>();
      if (!adj[b]) adj[b] = new Set<string>();
      adj[a].add(b);
      adj[b].add(a);
    }
    return adj;
  }, [pools]);

  const token1Options = useMemo(() => {
    if (!token0Address) return poolTokens;
    const allowed = adjacency[token0Address.toLowerCase()];
    if (!allowed) return poolTokens;
    const allowedSet = new Set(Array.from(allowed));
    return poolTokens.filter(t => allowedSet.has(t.address));
  }, [poolTokens, adjacency, token0Address]);

  // Load token metadata when user inputs address
  useEffect(() => {
    const loadMeta = async () => {
      try {
        if (!publicClient || !token0Address || !token0Address.startsWith("0x") || token0Address.length !== 42) {
          setToken0Meta(null);
          return;
        }
        const info = await fetchTokenInfo(publicClient, token0Address as `0x${string}`);
        setToken0Meta({ symbol: info.symbol, name: info.name, decimals: info.decimals });
      } catch (e) {
        setToken0Meta(null);
      }
    };
    loadMeta();
  }, [publicClient, token0Address]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        if (!publicClient || !token1Address || !token1Address.startsWith("0x") || token1Address.length !== 42) {
          setToken1Meta(null);
          return;
        }
        const info = await fetchTokenInfo(publicClient, token1Address as `0x${string}`);
        setToken1Meta({ symbol: info.symbol, name: info.name, decimals: info.decimals });
      } catch (e) {
        setToken1Meta(null);
      }
    };
    loadMeta();
  }, [publicClient, token1Address]);

  // Auto-estimate amount1 when user edits amount0
  useEffect(() => {
    const estimateCounterForAmount0 = async () => {
      try {
        if (!publicClient || !token0Meta || !token1Meta) return;
        if (!token0Address || !token1Address) return;
        if (lastEdited !== "amount0") return;
        if (!amount0 || amount0.trim() === "") return;
        if (!token0Address.startsWith("0x") || token0Address.length !== 42) return;
        if (!token1Address.startsWith("0x") || token1Address.length !== 42) return;

        // parse amount0 to raw
        const amt0Num = parseFloat(amount0);
        if (!isFinite(amt0Num) || amt0Num <= 0) return;
        const amount0Raw = BigInt(Math.floor(amt0Num * 10 ** token0Meta.decimals)).toString();

        // build Token objects
        const token0 = new Token(
          currentNetwork.chainId,
          token0Address,
          token0Meta.decimals,
          token0Meta.symbol,
          token0Meta.name
        );
        const token1 = new Token(
          currentNetwork.chainId,
          token1Address,
          token1Meta.decimals,
          token1Meta.symbol,
          token1Meta.name
        );

        // get pool
        const poolData = await getPool(
          publicClient,
          currentNetwork.chainId,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000",
          token0,
          token1
        );
        if (!poolData || !poolData.pool) return;

        const { pool } = poolData;
        // derive a symmetric tick range around current price
        const currentTick = pool.tickCurrent;
        const spacing = pool.tickSpacing;
        const tickRangeAmount = spacing * 10;
        const tickLower = nearestUsableTick(currentTick - tickRangeAmount, spacing);
        const tickUpper = nearestUsableTick(currentTick + tickRangeAmount, spacing);

        // map UI token0 to pool token order
        const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
        let position: Position;
        if (token0IsA) {
          // UI token0 corresponds to pool.token0
          position = Position.fromAmount0({
            pool,
            tickLower,
            tickUpper,
            amount0: amount0Raw,
            useFullPrecision: false,
          });
        } else {
          // UI token0 corresponds to pool.token1
          position = Position.fromAmount1({
            pool,
            tickLower,
            tickUpper,
            amount1: amount0Raw,
          });
        }

        // get exact mint amounts (no slippage) and take the opposite side
        const { amount0: need0, amount1: need1 } = position.mintAmountsWithSlippage(new Percent(0, 10_000));
        // needX are JSBI; convert to decimal string
        const otherRawStr = token0IsA ? need1.toString() : need0.toString();
        const otherDecimals = token0IsA ? token1Meta.decimals : token0Meta.decimals;
        const otherNum = Number(otherRawStr) / 10 ** otherDecimals;
        // limit to 6 decimals to avoid noisy UI
        const otherDisplay = formatDecimalOutput(otherNum, 6);
        setAmount1(sanitizeDecimalInput(otherDisplay));
      } catch (e) {
        // silent fail for UX; do not toast here
      }
    };
    estimateCounterForAmount0();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount0, token0Address, token1Address, token0Meta, token1Meta, fee, tickSpacing, publicClient, currentNetwork.chainId, lastEdited]);

  // Auto-estimate amount0 when user edits amount1
  useEffect(() => {
    const estimateCounterForAmount1 = async () => {
      try {
        if (!publicClient || !token0Meta || !token1Meta) return;
        if (!token0Address || !token1Address) return;
        if (lastEdited !== "amount1") return;
        if (!amount1 || amount1.trim() === "") return;
        if (!token0Address.startsWith("0x") || token0Address.length !== 42) return;
        if (!token1Address.startsWith("0x") || token1Address.length !== 42) return;

        // parse amount1 to raw
        const amt1Num = parseFloat(amount1);
        if (!isFinite(amt1Num) || amt1Num <= 0) return;
        const amount1Raw = BigInt(Math.floor(amt1Num * 10 ** token1Meta.decimals)).toString();

        // build Token objects
        const token0 = new Token(
          currentNetwork.chainId,
          token0Address,
          token0Meta.decimals,
          token0Meta.symbol,
          token0Meta.name
        );
        const token1 = new Token(
          currentNetwork.chainId,
          token1Address,
          token1Meta.decimals,
          token1Meta.symbol,
          token1Meta.name
        );

        // get pool
        const poolData = await getPool(
          publicClient,
          currentNetwork.chainId,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000",
          token0,
          token1
        );
        if (!poolData || !poolData.pool) return;

        const { pool } = poolData;
        const currentTick = pool.tickCurrent;
        const spacing = pool.tickSpacing;
        const tickRangeAmount = spacing * 10;
        const tickLower = nearestUsableTick(currentTick - tickRangeAmount, spacing);
        const tickUpper = nearestUsableTick(currentTick + tickRangeAmount, spacing);

        // map UI token1 to pool token order
        const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
        let position: Position;
        if (token0IsA) {
          // UI token1 corresponds to pool.token1
          position = Position.fromAmount1({
            pool,
            tickLower,
            tickUpper,
            amount1: amount1Raw,
          });
        } else {
          // UI token1 corresponds to pool.token0
          position = Position.fromAmount0({
            pool,
            tickLower,
            tickUpper,
            amount0: amount1Raw,
            useFullPrecision: false,
          });
        }

        const { amount0: need0, amount1: need1 } = position.mintAmountsWithSlippage(new Percent(0, 10_000));
        const otherRawStr = token0IsA ? need0.toString() : need1.toString();
        const otherDecimals = token0IsA ? token0Meta.decimals : token1Meta.decimals;
        const otherNum = Number(otherRawStr) / 10 ** otherDecimals;
        const otherDisplay = formatDecimalOutput(otherNum, 6);
        setAmount0(sanitizeDecimalInput(otherDisplay));
      } catch (e) {
        // silent fail
      }
    };
    estimateCounterForAmount1();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount1, token0Address, token1Address, token0Meta, token1Meta, fee, tickSpacing, publicClient, currentNetwork.chainId, lastEdited]);

  // Check if pool exists when addresses and fee change
  useEffect(() => {
    const checkPool = async () => {
      if (!token0Address || !token1Address || !publicClient) {
        setPoolExists(null);
        return;
      }

      try {
        setCheckingPool(true);
        const [token0Info, token1Info] = await Promise.all([
          fetchTokenInfo(publicClient, token0Address as `0x${string}`),
          fetchTokenInfo(publicClient, token1Address as `0x${string}`),
        ]);

        const token0 = new Token(
          currentNetwork.chainId,
          token0Address,
          token0Info.decimals,
          token0Info.symbol,
          token0Info.name
        );
        const token1 = new Token(
          currentNetwork.chainId,
          token1Address,
          token1Info.decimals,
          token1Info.symbol,
          token1Info.name
        );

        const poolData = await getPool(
          publicClient,
          currentNetwork.chainId,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000",
          token0,
          token1
        );

        setPoolExists(!!poolData?.pool);
      } catch (error) {
        console.error("Error checking pool:", error);
        setPoolExists(false);
      } finally {
        setCheckingPool(false);
      }
    };

    checkPool();
  }, [token0Address, token1Address, fee, tickSpacing, currentNetwork.chainId, publicClient]);

  const handleAddLiquidity = async () => {
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    if (!token0Address || !token1Address || !amount0 || !amount1) {
      toast({
        title: "Invalid Input",
        description: "Please fill in all fields",
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
    setTxOpen(true);
    setTxStatus("loading");
    setTxTitle(undefined);
    setTxDesc(undefined);
    setTxHash(undefined);

    try {
      // Fetch token info
      const [token0Info, token1Info] = await Promise.all([
        fetchTokenInfo(publicClient, token0Address as `0x${string}`),
        fetchTokenInfo(publicClient, token1Address as `0x${string}`),
      ]);

      const token0 = new Token(
        currentNetwork.chainId,
        token0Address,
        token0Info.decimals,
        token0Info.symbol,
        token0Info.name
      );
      const token1 = new Token(
        currentNetwork.chainId,
        token1Address,
        token1Info.decimals,
        token1Info.symbol,
        token1Info.name
      );

      // Sort tokens
      const token0IsA = token0.address.toLowerCase() < token1.address.toLowerCase();
      const sortedToken0 = token0IsA ? token0 : token1;
      const sortedToken1 = token0IsA ? token1 : token0;

      // If pool doesn't exist, initialize it first
      if (!poolExists) {
        setTxStatus("loading");
        setTxTitle("Initializing pool");
        setTxDesc("Creating a new pool before adding liquidity.");
        toast({
          title: "Creating New Pool",
          description: "Initializing pool first...",
        });

        await initializePool(
          publicClient,
          walletClient,
          currentNetwork.chainId,
          walletAddress as `0x${string}`,
          sortedToken0,
          sortedToken1,
          parseInt(fee),
          parseInt(tickSpacing),
          "0x0000000000000000000000000000000000000000"
        );

        setTxStatus("success");
        setTxTitle("Pool initialized");
        setTxDesc(`Pool for ${token0Info.symbol}/${token1Info.symbol} created.`);
        toast({
          title: "Pool Created!",
          description: `Pool for ${token0Info.symbol}/${token1Info.symbol} initialized`,
        });
        // Reload balances after pool initialization
        setBalancesRefreshKey((k) => k + 1);
      }

      // Convert amounts to smallest unit
      const amount0Wei = BigInt(Math.floor(parseFloat(amount0) * 10 ** token0.decimals));
      const amount1Wei = BigInt(Math.floor(parseFloat(amount1) * 10 ** token1.decimals));

      // Mint position
      setTxStatus("loading");
      setTxTitle("Adding liquidity");
      setTxDesc("Submitting liquidity transaction and waiting for confirmation...");
      const mintRes = await mintPosition(
        publicClient,
        walletClient,
        currentNetwork.chainId,
        walletAddress as `0x${string}`,
        parseInt(fee),
        parseInt(tickSpacing),
        "0x0000000000000000000000000000000000000000",
        sortedToken0,
        sortedToken1,
        amount0Wei.toString(),
        amount1Wei.toString(),
        true
      );

      setTxStatus("success");
      setTxTitle("Liquidity added");
      setTxDesc(`Successfully added liquidity to ${token0Info.symbol}/${token1Info.symbol}.`);
      setTxHash(mintRes?.txHash);
      toast({
        title: "Liquidity Added!",
        description: `Successfully added liquidity to ${token0Info.symbol}/${token1Info.symbol}`,
      });
      // Reload balances after successful mint
      setBalancesRefreshKey((k) => k + 1);

      onOpenChange(false);

      // Reset form
      setToken0Address("");
      setToken1Address("");
      setAmount0("");
      setAmount1("");
      setFee("3000");
      setPoolExists(null);
    } catch (error) {
      console.error("Error adding liquidity:", error);
      setTxStatus("error");
      setTxTitle("Add liquidity failed");
      setTxDesc(error instanceof Error ? error.message : "Failed to add liquidity");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add liquidity",
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Liquidity</DialogTitle>
          <DialogDescription>
            Add liquidity to a Uniswap V4 pool. If the pool doesn't exist, it will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {poolExists === false && token0Address && token1Address && !checkingPool && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pool doesn't exist yet. A new pool will be created with your first liquidity.
              </AlertDescription>
            </Alert>
          )}

          {poolExists === true && !checkingPool && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pool exists. Adding liquidity to existing pool.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="token0">{token0Meta?.name || token0Meta?.symbol || "Token 0"}</Label>
            <div className="relative">
              <Input
                id="token0"
                placeholder="0x..."
                value={token0Address}
                onChange={(e) => setToken0Address(e.target.value)}
                className="pr-10"
              />
              <Popover open={openPicker0} onOpenChange={setOpenPicker0}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2">
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0 w-80">
                  <Command>
                    <CommandInput placeholder="Search tokens in pools..." />
                    <CommandList>
                      <CommandEmpty>No matching tokens</CommandEmpty>
                      <CommandGroup heading="Tokens">
                        {poolTokens.map((t) => (
                          <CommandItem
                            key={t.address}
                            onSelect={() => {
                              setToken0Address(t.address);
                              setOpenPicker0(false);
                            }}
                          >
                            {t.symbol} — {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
          </div>
          {/* No need to repeat token name next to address; label already shows it */}
            {token0Balance && (
              <div className="text-xs text-muted-foreground">Token0 balance: {parseFloat(token0Balance).toFixed(6)}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount0">{token0Meta?.symbol || token0Meta?.name ? `${token0Meta?.symbol || token0Meta?.name} Amount` : "Token 0 Amount"}</Label>
            <Input
              id="amount0"
              type="text"
              placeholder="1.0"
              value={amount0}
              onChange={(e) => {
                setLastEdited("amount0");
                setAmount0(sanitizeDecimalInput(e.target.value));
              }}
              inputMode="decimal"
              step="any"
            />
            {insufficient0 && (
              <Alert className="mt-2" variant="destructive">
                <AlertDescription>{insufficient0}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="token1">{token1Meta?.name || token1Meta?.symbol || "Token 1"}</Label>
            <div className="relative">
              <Input
                id="token1"
                placeholder="0x..."
                value={token1Address}
                onChange={(e) => setToken1Address(e.target.value)}
                className="pr-10"
              />
              <Popover open={openPicker1} onOpenChange={setOpenPicker1}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2">
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0 w-80">
                  <Command>
                    <CommandInput placeholder="Search tokens in pools..." />
                    <CommandList>
                      <CommandEmpty>No matching tokens</CommandEmpty>
                      <CommandGroup heading="Tokens">
                        {(token1Options.length ? token1Options : poolTokens).map((t) => (
                          <CommandItem
                            key={t.address}
                            onSelect={() => {
                              setToken1Address(t.address);
                              setOpenPicker1(false);
                            }}
                          >
                            {t.symbol} — {t.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
          </div>
          {/* No need to repeat token name next to address; label already shows it */}
            {token1Balance && (
              <div className="text-xs text-muted-foreground">Token1 balance: {parseFloat(token1Balance).toFixed(6)}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount1">{token1Meta?.symbol || token1Meta?.name ? `${token1Meta?.symbol || token1Meta?.name} Amount` : "Token 1 Amount"}</Label>
            <Input
              id="amount1"
              type="text"
              placeholder="1000.0"
              value={amount1}
              onChange={(e) => {
                setLastEdited("amount1");
                setAmount1(sanitizeDecimalInput(e.target.value));
              }}
              inputMode="decimal"
              step="any"
            />
            {insufficient1 && (
              <Alert className="mt-2" variant="destructive">
                <AlertDescription>{insufficient1}</AlertDescription>
              </Alert>
            )}
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
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddLiquidity} disabled={!walletAddress || isLoading || checkingPool || !!insufficient0 || !!insufficient1}>
            {isLoading 
              ? "Processing..." 
              : poolExists === false 
                ? "Create Pool & Add Liquidity" 
                : "Add Liquidity"}
          </Button>
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
