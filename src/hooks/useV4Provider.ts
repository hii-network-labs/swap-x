import { useState, useEffect, useMemo } from "react";
import { createPublicClient, createWalletClient, custom, http, defineChain, type Chain } from "viem";
import { useNetwork } from "@/contexts/NetworkContext";

interface V4ProviderState {
  publicClient: any;
  walletClient: any;
  isConnected: boolean;
  error: string | null;
}

export const useV4Provider = () => {
  const { currentNetwork, walletAddress } = useNetwork();
  const [state, setState] = useState<V4ProviderState>({
    publicClient: null,
    walletClient: null,
    isConnected: false,
    error: null,
  });

  // Define custom chain from current network
  const customChain = useMemo(() => {
    return defineChain({
      id: currentNetwork.chainId,
      name: currentNetwork.name,
      network: currentNetwork.id,
      nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
      },
      rpcUrls: {
        default: { http: [currentNetwork.rpcUrl] },
        public: { http: [currentNetwork.rpcUrl] },
      },
      testnet: currentNetwork.isTestnet,
    });
  }, [currentNetwork]);

  useEffect(() => {
    const initProviders = async () => {
      try {
        if (!window.ethereum) {
          setState((prev) => ({
            ...prev,
            error: "MetaMask not installed",
          }));
          return;
        }

        // Create public client for read operations
        const publicClient = createPublicClient({
          chain: customChain,
          transport: http(currentNetwork.rpcUrl),
        });

        if (!walletAddress) {
          setState({
            publicClient,
            walletClient: null,
            isConnected: false,
            error: null,
          });
          return;
        }

        // Create wallet client for write operations
        const walletClient = createWalletClient({
          chain: customChain,
          transport: custom(window.ethereum),
        });

        setState({
          publicClient,
          walletClient,
          isConnected: true,
          error: null,
        });
      } catch (error) {
        console.error("Error initializing V4 providers:", error);
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to connect",
        }));
      }
    };

    initProviders();
  }, [walletAddress, customChain, currentNetwork]);

  return {
    ...state,
    chain: customChain,
  };
};
