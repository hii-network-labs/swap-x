// Uniswap V4 Contract Addresses per chain
export const UNISWAP_V4_ADDRESSES: Record<
  number,
  {
    poolManager: string;
    positionManager: string;
    stateView: string;
    permit2: string;
    quoter?: string;
    universalRouter?: string;
  }
> = {
  22469: {
    // HII Testnet
    poolManager: "0xE82C6122a57b5A1240227b932Ad7cccd2E0102b4",
    positionManager: "0x2a85f666cE5a5735f9E021ed00cB2655873BC97c",
    stateView: "0x07bdd0D4129E03E0A44a8608Ed9Fb99ad9E75525",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Standard Permit2
    quoter: "0x015B26F6DeF17e8Eb1aB687E13D4454fc4A5fD36",
    universalRouter: "0x552baC34b351639a8A3D8181d258Bd9e9dDD8fBD",
  },
};

// Helper to get V4 addresses
export const getUniswapV4Addresses = (chainId: number) => {
  return UNISWAP_V4_ADDRESSES[chainId];
};

export const isV4SupportedNetwork = (chainId: number): boolean => {
  return chainId in UNISWAP_V4_ADDRESSES;
};

// ABIs
export const POOL_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
        name: "key",
        type: "tuple",
      },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    name: "initialize",
    outputs: [{ name: "tick", type: "int24" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getPoolAndPositionInfo",
    outputs: [
      {
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
        name: "poolKey",
        type: "tuple",
      },
      { name: "info", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
   {
      "inputs": [
         {
            "internalType": "uint256",
            "name": "tokenId",
            "type": "uint256"
         }
      ],
      "name": "getPositionLiquidity",
      "outputs": [
         {
            "internalType": "uint128",
            "name": "liquidity",
            "type": "uint128"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   },
] as const;

export const STATE_VIEW_ABI = [
  {
    inputs: [],
    name: "poolManager",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "poolId", type: "bytes32" }],
    name: "getSlot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "poolId", type: "bytes32" }],
    name: "getLiquidity",
    outputs: [{ name: "liquidity", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const QUOTER_ABI = [
  {
    inputs: [],
    name: "poolManager",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
        name: "poolKey",
        type: "tuple",
      },
      { name: "zeroForOne", type: "bool" },
      { name: "exactAmount", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      {
        components: [{ name: "amountOut", type: "uint256" }],
        name: "quotedAmountOut",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const PERMIT2_ABI = [
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Minimal Universal Router ABI for execute
export const UNIVERSAL_ROUTER_ABI = [
  // execute function
  {
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  // Common Universal Router errors to enable revert decoding
  { type: "error", name: "ExecutionFailed", inputs: [
    { name: "commandIndex", type: "uint256" },
    { name: "message", type: "bytes" },
  ] },
  { type: "error", name: "TransactionDeadlinePassed", inputs: [] },
  { type: "error", name: "InsufficientETH", inputs: [] },
  { type: "error", name: "InsufficientToken", inputs: [] },
  { type: "error", name: "InvalidCommandType", inputs: [
    { name: "commandType", type: "uint256" },
  ] },
  { type: "error", name: "LengthMismatch", inputs: [] },
  { type: "error", name: "SliceOutOfBounds", inputs: [] },
  { type: "error", name: "UnsafeCast", inputs: [] },
] as const;

export const PERMIT2_TYPES = {
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
  PermitBatch: [
    { name: "details", type: "PermitDetails[]" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;
