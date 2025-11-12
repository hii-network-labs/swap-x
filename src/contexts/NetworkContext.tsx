import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface Network {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  isTestnet: boolean;
}

export const NETWORKS: Network[] = [
  {
    id: "hii-testnet",
    name: (import.meta.env.VITE_DEFAULT_CHAIN_NAME as string | undefined) || "HII Testnet",
    chainId: Number((import.meta.env.VITE_DEFAULT_CHAIN_ID as string | number | undefined) ?? 22469),
    rpcUrl: (import.meta.env.VITE_DEFAULT_CHAIN_RPC_URL as string | undefined) || "https://rpc-sb.teknix.dev",
    isTestnet: true,
  },
  {
    id: "ethereum",
    name: "Ethereum Mainnet",
    chainId: 1,
    rpcUrl: "https://eth.llamarpc.com",
    isTestnet: false,
  },
  {
    id: "sepolia",
    name: "Sepolia Testnet",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    isTestnet: true,
  },
  {
    id: "goerli",
    name: "Goerli Testnet",
    chainId: 5,
    rpcUrl: "https://ethereum-goerli-rpc.publicnode.com",
    isTestnet: true,
  },
  {
    id: "bsc",
    name: "BSC Mainnet",
    chainId: 56,
    rpcUrl: "https://bsc-dataseed.binance.org/",
    isTestnet: false,
  },
  {
    id: "bsc-testnet",
    name: "BSC Testnet",
    chainId: 97,
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
    isTestnet: true,
  },
];

interface NetworkContextType {
  currentNetwork: Network;
  setCurrentNetwork: (network: Network) => void;
  walletAddress: string | null;
  setWalletAddress: (address: string | null) => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [currentNetwork, setCurrentNetwork] = useState<Network>(NETWORKS[0]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const SESSION_KEY = "wallet_session";
  const SESSION_TTL_MS = Number((import.meta.env.VITE_WALLET_SESSION_TTL_MS as string | undefined) ?? 600_000); // default 10 minutes

  // Auto-switch to chain 22469 when wallet connects
  const handleSetWalletAddress = async (address: string | null) => {
    setWalletAddress(address);

    // Persist session with timestamp for TTL-based reconnect on refresh
    try {
      if (address) {
        const payload = { address, timestamp: Date.now() };
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      } else {
        // Do not immediately clear persisted session on transient disconnects
        // The TTL will expire naturally; keep session to allow soft refresh reconnects
      }
    } catch (e) {
      // ignore storage errors
    }

    if (address && window.ethereum) {
      try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        const currentChainId = parseInt(chainId, 16);

        // If not on HII Testnet (22469), switch to it
        if (currentChainId !== 22469) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x57C5" }], // 22469 in hex
            });
            setCurrentNetwork(NETWORKS[0]); // HII Testnet
          } catch (switchError: any) {
            // Chain not added, add it
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x57C5",
                    chainName: "HII Testnet",
                    nativeCurrency: {
                      name: "Ether",
                      symbol: "ETH",
                      decimals: 18,
                    },
                    rpcUrls: ["https://rpc-sb.teknix.dev"],
                    blockExplorerUrls: ["https://explorer-sb.teknix.dev"],
                  },
                ],
              });
              setCurrentNetwork(NETWORKS[0]); // HII Testnet
            }
          }
        } else {
          setCurrentNetwork(NETWORKS[0]); // HII Testnet
        }
      } catch (error) {
        console.error("Error switching network:", error);
      }
    }
  };

  // Restore wallet session on mount if within TTL
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { address: string; timestamp: number } | null;
      if (parsed?.address && parsed?.timestamp && Number.isFinite(parsed.timestamp)) {
        const age = Date.now() - parsed.timestamp;
        if (age < SESSION_TTL_MS) {
          // Soft restore: set address to keep UI connected; MetaMask usually retains permissions across reloads
          handleSetWalletAddress(parsed.address);
        } else {
          // Expired session: clean up
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (e) {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        currentNetwork,
        setCurrentNetwork,
        walletAddress,
        setWalletAddress: handleSetWalletAddress,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within NetworkProvider");
  }
  return context;
};
