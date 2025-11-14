import { useQuery } from "@tanstack/react-query";
import { fetchPositions, Position } from "@/services/graphql/subgraph";
import { useNetwork } from "@/contexts/NetworkContext";

export function useSubgraphPositions() {
  const { walletAddress } = useNetwork();

  const { data, isLoading, error, refetch } = useQuery<Position[]>({
    queryKey: ["subgraph-positions", walletAddress],
    queryFn: () => {
      if (!walletAddress) return Promise.resolve([]);
      const loadAll = async () => {
        const page = 250;
        let skip = 0;
        const acc: Position[] = [];
        while (true) {
          const batch = await fetchPositions(walletAddress, page, skip);
          if (!batch.length) break;
          acc.push(...batch);
          if (batch.length < page) break;
          skip += batch.length;
        }
        return acc;
      };
      return loadAll();
    },
    enabled: !!walletAddress,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    positions: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
