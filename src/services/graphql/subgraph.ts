const SUBGRAPH_URL = "https://graph-node.sb.teknix.dev/subgraphs/name/subgraph-swap-hii-3";

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
  volumeToken0: string;
  volumeToken1: string;
  txCount: string;
}

export interface Position {
  id: string;
  tokenId: string;
  owner: string;
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
  const query = `
    query GetPools($first: Int!, $skip: Int!) {
      pools(
        first: $first
        skip: $skip
        orderBy: liquidity
        orderDirection: desc
      ) {
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
  `;

  const data = await fetchGraphQL(query, { first, skip });
  return data.pools || [];
}

export async function fetchPool(poolId: string): Promise<Pool | null> {
  const query = `
    query GetPool($id: ID!) {
      pool(id: $id) {
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
  `;

  const data = await fetchGraphQL(query, { id: poolId });
  return data.pool || null;
}

export async function fetchPositions(owner: string, first: number = 100, skip: number = 0): Promise<Position[]> {
  const query = `
    query GetPositions($owner: String!, $first: Int!, $skip: Int!) {
      positions(
        where: { owner: $owner }
        first: $first
        skip: $skip
      ) {
        id
        tokenId
        owner
        transfers {
          id
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { owner: owner.toLowerCase(), first, skip });
  return data.positions || [];
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
        transfers {
          id
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { id: positionId });
  return data.position || null;
}
