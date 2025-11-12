const SUBGRAPH_URL = "https://graph-node.sb.teknix.dev/subgraphs/name/subgraph-swap-hii-5";

export interface Pool {
  id: string;
  token0: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
  };
  tickSpacing: string;
  liquidity: string;
  tick: string;
  sqrtPrice?: string;
  feeTier?: string;
  hooks?: string;
  volumeToken0: string;
  volumeToken1: string;
  volumeUSD?: string;
  feesUSD?: string;
  totalValueLockedUSD?: string;
  txCount: string;
}

export interface Position {
  id: string;
  tokenId: string;
  owner: string;
  poolId?: string;
  liquidity?: string;
  tickLower?: string;
  tickUpper?: string;
  pool?: {
    id: string;
    tick: string;
    tickSpacing: string;
    token0: { id: string; symbol: string; decimals: string };
    token1: { id: string; symbol: string; decimals: string };
    feeTier?: string;
    sqrtPrice?: string;
    liquidity?: string;
  };
  transfers: Array<{
    id: string;
  }>;
}

export interface ModifyLiquidity {
  id: string;
  pool: Pool;
  sender: string;
  tickLower: string;
  tickUpper: string;
  transaction: {
    id: string;
    timestamp: string;
  };
}

export interface GraphTransaction {
  id: string;
  blockNumber: string;
  timestamp: string;
  swaps: Array<{
    id: string;
    sender: string;
    amount0: string;
    amount1: string;
    pool: {
      id: string;
      token0: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
      };
      token1: {
        id: string;
        symbol: string;
        name: string;
        decimals: string;
      };
    };
  }>;
}

export interface GlobalStats {
  poolCount: string;
  txCount: string;
  totalVolumeUSD?: string;
  totalVolumeETH?: string;
}

export interface Swap {
  id: string;
  sender: string;
  amount0: string;
  amount1: string;
  timestamp?: string;
  transaction?: { id: string; blockNumber: string };
  pool: {
    id: string;
    token0: { id: string; symbol: string; name?: string; decimals?: string };
    token1: { id: string; symbol: string; name?: string; decimals?: string };
  };
}

export interface PoolDayData {
  date: string;
  liquidity: string;
  sqrtPrice: string;
  token0Price: string;
  token1Price: string;
  volumeToken0: string;
  volumeToken1: string;
}

async function fetchGraphQL(query: string, variables?: Record<string, any>) {
  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

export async function fetchPools(first: number = 100, skip: number = 0): Promise<Pool[]> {
  // Attempt extended fields per Uniswap v4 docs, with fallback to minimal schema
  const extendedQuery = `
    query GetPools($first: Int!, $skip: Int!) {
      pools(
        first: $first
        skip: $skip
        orderBy: liquidity
        orderDirection: desc
      ) {
        id
        token0 { id symbol name decimals }
        token1 { id symbol name decimals }
        tickSpacing
        liquidity
        tick
        sqrtPrice
        feeTier
        hooks
        volumeToken0
        volumeToken1
        volumeUSD
        feesUSD
        totalValueLockedUSD
        txCount
      }
    }
  `;
  const minimalQuery = `
    query GetPools($first: Int!, $skip: Int!) {
      pools(
        first: $first
        skip: $skip
        orderBy: liquidity
        orderDirection: desc
      ) {
        id
        token0 { id symbol name decimals }
        token1 { id symbol name decimals }
        tickSpacing
        liquidity
        tick
        volumeToken0
        volumeToken1
        txCount
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { first, skip });
    return data.pools || [];
  } catch (e: any) {
    console.warn("Subgraph: extended pool fields unsupported, falling back:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { first, skip });
    return data.pools || [];
  }
}

export async function fetchPool(poolId: string): Promise<Pool | null> {
  const extendedQuery = `
    query GetPool($id: ID!) {
      pool(id: $id) {
        id
        token0 { id symbol name decimals }
        token1 { id symbol name decimals }
        tickSpacing
        liquidity
        tick
        sqrtPrice
        feeTier
        hooks
        volumeToken0
        volumeToken1
        volumeUSD
        feesUSD
        totalValueLockedUSD
        txCount
      }
    }
  `;
  const minimalQuery = `
    query GetPool($id: ID!) {
      pool(id: $id) {
        id
        token0 { id symbol name decimals }
        token1 { id symbol name decimals }
        tickSpacing
        liquidity
        tick
        volumeToken0
        volumeToken1
        txCount
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { id: poolId });
    return data.pool || null;
  } catch (e: any) {
    console.warn("Subgraph: extended pool field unsupported, fallback:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { id: poolId });
    return data.pool || null;
  }
}

export async function fetchPositions(owner: string, first: number = 100, skip: number = 0): Promise<Position[]> {
  const extendedQuery = `
    query GetPositions($owner: String!, $first: Int!, $skip: Int!) {
      positions(
        where: { owner: $owner }
        first: $first
        skip: $skip
        orderDirection: desc
      ) {
        id
        tokenId
        owner
        poolId
        liquidity
        tickLower
        tickUpper
        pool {
          id
          tick
          tickSpacing
          sqrtPrice
          feeTier
          liquidity
          token0 { id symbol decimals }
          token1 { id symbol decimals }
        }
        transfers { id }
      }
    }
  `;
  const minimalQuery = `
    query GetPositions($owner: String!, $first: Int!, $skip: Int!) {
      positions(
        where: { owner: $owner }
        first: $first
        skip: $skip
        orderDirection: desc
      ) {
        id
        tokenId
        owner
        poolId
        transfers { id }
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { owner: owner.toLowerCase(), first, skip });
    return data.positions || [];
  } catch (e: any) {
    console.warn("Subgraph: extended position fields unsupported, fallback:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { owner: owner.toLowerCase(), first, skip });
    return data.positions || [];
  }
}

export async function fetchModifyLiquidities(first: number = 100, skip: number = 0): Promise<ModifyLiquidity[]> {
  const query = `
    query GetModifyLiquidities($first: Int!, $skip: Int!) {
      modifyLiquidities(
        first: $first
        skip: $skip
        orderBy: transaction__timestamp
        orderDirection: desc
      ) {
        id
        sender
        tickLower
        tickUpper
        transaction {
          id
          timestamp
        }
        pool {
          id
          token0 {
            id
            symbol
            name
            decimals
          }
          token1 {
            id
            symbol
            name
            decimals
          }
          tickSpacing
          liquidity
          tick
          volumeToken0
          volumeToken1
          txCount
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { first, skip });
  return data.modifyLiquidities || [];
}

export async function fetchModifyLiquiditiesBySender(sender: string, first: number = 100, skip: number = 0): Promise<ModifyLiquidity[]> {
  const query = `
    query GetModifyLiquiditiesBySender($sender: String!, $first: Int!, $skip: Int!) {
      modifyLiquidities(
        where: { sender: $sender }
        first: $first
        skip: $skip
        orderBy: transaction__timestamp
        orderDirection: desc
      ) {
        id
        sender
        tickLower
        tickUpper
        transaction {
          id
          timestamp
        }
        pool {
          id
          token0 {
            id
            symbol
            name
            decimals
          }
          token1 {
            id
            symbol
            name
            decimals
          }
          tickSpacing
          liquidity
          tick
          volumeToken0
          volumeToken1
          txCount
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { sender: sender.toLowerCase(), first, skip });
  return data.modifyLiquidities || [];
}

export async function fetchPosition(positionId: string): Promise<Position | null> {
  const query = `
    query GetPosition($id: ID!) {
      position(id: $id) {
        id
        tokenId
        owner
        poolId
        transfers {
          id
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { id: positionId });
  return data.position || null;
}

export async function fetchTransactions(first: number = 100, skip: number = 0): Promise<GraphTransaction[]> {
  const query = `
    query GetTransactions($first: Int!, $skip: Int!) {
      transactions(
        first: $first
        skip: $skip
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        blockNumber
        timestamp
        swaps {
          id
          sender
          amount0
          amount1
          pool {
            id
            token0 {
              id
              symbol
              name
              decimals
            }
            token1 {
              id
              symbol
              name
              decimals
            }
          }
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { first, skip });
  return data.transactions || [];
}

export async function fetchGlobalStats(poolManagerAddress: string): Promise<GlobalStats | null> {
  const extendedQuery = `
    query GetGlobal($id: ID!) {
      poolManager(id: $id) {
        poolCount
        txCount
        totalVolumeUSD
        totalVolumeETH
      }
    }
  `;
  const minimalQuery = `
    query GetGlobal($id: ID!) {
      poolManager(id: $id) {
        poolCount
        txCount
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { id: poolManagerAddress });
    return data.poolManager || null;
  } catch (e: any) {
    console.warn("Subgraph: extended global fields unsupported, fallback:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { id: poolManagerAddress });
    return data.poolManager || null;
  }
}

export async function fetchRecentSwaps(poolAddress: string, first: number = 20): Promise<Swap[]> {
  const extendedQuery = `
    query GetRecentSwaps($pool: String!, $first: Int!) {
      swaps(
        orderBy: timestamp
        orderDirection: desc
        where: { pool: $pool }
        first: $first
      ) {
        id
        sender
        amount0
        amount1
        timestamp
        transaction { id blockNumber }
        pool {
          id
          token0 { id symbol name decimals }
          token1 { id symbol name decimals }
        }
      }
    }
  `;
  const minimalQuery = `
    query GetRecentSwaps($pool: String!, $first: Int!) {
      swaps(
        orderBy: timestamp
        orderDirection: desc
        where: { pool: $pool }
        first: $first
      ) {
        id
        sender
        amount0
        amount1
        pool {
          id
          token0 { id symbol }
          token1 { id symbol }
        }
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { pool: poolAddress, first });
    return data.swaps || [];
  } catch (e: any) {
    console.warn("Subgraph: extended swap fields unsupported, fallback:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { pool: poolAddress, first });
    return data.swaps || [];
  }
}

export async function fetchPoolDayDatas(poolId: string, first: number = 10, date_gt?: number): Promise<PoolDayData[]> {
  const extendedQuery = `
    query GetPoolDayDatas($pool: String!, $first: Int!, $date_gt: Int) {
      poolDayDatas(
        first: $first
        orderBy: date
        where: { pool: $pool, date_gt: $date_gt }
      ) {
        date
        liquidity
        sqrtPrice
        token0Price
        token1Price
        volumeToken0
        volumeToken1
      }
    }
  `;
  const minimalQuery = `
    query GetPoolDayDatas($pool: String!, $first: Int!, $date_gt: Int) {
      poolDayDatas(
        first: $first
        orderBy: date
        where: { pool: $pool, date_gt: $date_gt }
      ) {
        date
        liquidity
        sqrtPrice
        volumeToken0
        volumeToken1
      }
    }
  `;
  try {
    const data = await fetchGraphQL(extendedQuery, { pool: poolId, first, date_gt });
    return data.poolDayDatas || [];
  } catch (e: any) {
    console.warn("Subgraph: extended poolDayDatas fields unsupported, fallback:", e?.message);
    const data = await fetchGraphQL(minimalQuery, { pool: poolId, first, date_gt });
    return data.poolDayDatas || [];
  }
}
