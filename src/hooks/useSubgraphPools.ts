import { useQuery } from "@tanstack/react-query";
import { fetchPools, Pool } from "@/services/graphql/subgraph";

export function useSubgraphPools() {
  const { data, isLoading, error, refetch } = useQuery<Pool[]>({
    queryKey: ["subgraph-pools"],
    queryFn: () => fetchPools(100, 0),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  return {
    pools: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
