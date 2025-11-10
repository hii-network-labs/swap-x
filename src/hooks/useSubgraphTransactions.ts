import { useQuery } from "@tanstack/react-query";
import { fetchTransactions, GraphTransaction } from "@/services/graphql/subgraph";

export function useSubgraphTransactions() {
  const { data, isLoading, error, refetch } = useQuery<GraphTransaction[]>({
    queryKey: ["subgraph-transactions"],
    queryFn: () => fetchTransactions(100, 0),
    staleTime: 10000, // 10 seconds
    refetchInterval: 15000, // Refetch every 15 seconds for real-time updates
  });

  return {
    transactions: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
