import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useNetwork } from "@/contexts/NetworkContext";

interface Web3State {
  provider: ethers.providers.Web3Provider | null;
  signer: ethers.Signer | null;
  isConnected: boolean;
  error: string | null;
}

export const useWeb3Provider = () => {
  const { currentNetwork, walletAddress } = useNetwork();
  const [state, setState] = useState<Web3State>({
    provider: null,
    signer: null,
    isConnected: false,
    error: null,
  });

  useEffect(() => {
    const initProvider = async () => {
      try {
        if (!window.ethereum) {
          setState(prev => ({ 
            ...prev, 
            error: "MetaMask not installed" 
          }));
          return;
        }

        if (!walletAddress) {
          setState({
            provider: null,
            signer: null,
            isConnected: false,
            error: null,
          });
          return;
        }

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();

        setState({
          provider,
          signer,
          isConnected: true,
          error: null,
        });
      } catch (error) {
        console.error("Error initializing provider:", error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to connect",
        }));
      }
    };

    initProvider();
  }, [walletAddress, currentNetwork]);

  const getReadOnlyProvider = () => {
    if (!currentNetwork.rpcUrl) {
      throw new Error("No RPC URL configured for current network");
    }
    return new ethers.providers.JsonRpcProvider(currentNetwork.rpcUrl);
  };

  return {
    ...state,
    getReadOnlyProvider,
  };
};
