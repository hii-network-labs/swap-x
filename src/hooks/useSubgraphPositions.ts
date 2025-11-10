import { useQuery } from "@tanstack/react-query";
import { fetchPositions, Position } from "@/services/graphql/subgraph";
import { useNetwork } from "@/contexts/NetworkContext";

export function useSubgraphPositions() {
  const { walletAddress } = useNetwork();

  const { data, isLoading, error, refetch } = useQuery<Position[]>({
    queryKey: ["subgraph-positions", walletAddress],
    queryFn: () => {
      if (!walletAddress) return Promise.resolve([]);
      return fetchPositions(walletAddress, 100, 0);
    },
    enabled: !!walletAddress,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    positions: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
