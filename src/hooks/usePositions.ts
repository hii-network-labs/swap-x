import { useState, useEffect, useCallback } from "react";
import { useNetwork } from "@/contexts/NetworkContext";
import { useWeb3Provider } from "./useWeb3Provider";
import { getAllPositions } from "@/services/uniswap/positionService";
import { isSupportedNetwork } from "@/config/uniswap";
import { PositionWithValues } from "@/types/uniswap";
import { toast } from "@/hooks/use-toast";

interface UsePositionsReturn {
  positions: PositionWithValues[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isSupported: boolean;
}

export const usePositions = (): UsePositionsReturn => {
  const { currentNetwork, walletAddress } = useNetwork();
  const { getReadOnlyProvider } = useWeb3Provider();
  
  const [positions, setPositions] = useState<PositionWithValues[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = isSupportedNetwork(currentNetwork.chainId);

  const fetchPositions = useCallback(async () => {
    if (!walletAddress) {
      setPositions([]);
      setError(null);
      return;
    }

    if (!isSupported) {
      setError(`Uniswap V3 is not supported on ${currentNetwork.name}`);
      setPositions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = getReadOnlyProvider();
      const fetchedPositions = await getAllPositions(
        provider,
        currentNetwork.chainId,
        walletAddress
      );
      
      setPositions(fetchedPositions);
    } catch (err) {
      console.error("Error fetching positions:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch positions";
      setError(errorMessage);
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, currentNetwork, isSupported, getReadOnlyProvider]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    positions,
    isLoading,
    error,
    refetch: fetchPositions,
    isSupported,
  };
};
