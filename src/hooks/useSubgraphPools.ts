import { useQuery } from "@tanstack/react-query";
import { fetchPools, Pool } from "@/services/graphql/subgraph";

export function useSubgraphPools() {
  const { data, isLoading, error, refetch } = useQuery<Pool[]>({
    queryKey: ["subgraph-pools"],
    queryFn: async () => {
      const page = 250;
      let skip = 0;
      const acc: Pool[] = [];
      while (true) {
        const batch = await fetchPools(page, skip);
        if (!batch.length) break;
        acc.push(...batch);
        if (batch.length < page) break;
        skip += batch.length;
      }
      return acc;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    pools: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
