import { createContext, useContext, useState, ReactNode } from "react";

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
    name: "HII Testnet",
    chainId: 22469,
    rpcUrl: "https://testnet-rpc.hii.network",
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

  // Auto-switch to chain 22469 when wallet connects
  const handleSetWalletAddress = async (address: string | null) => {
    setWalletAddress(address);
    
    if (address && window.ethereum) {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(chainId, 16);
        
        // If not on HII Testnet (22469), switch to it
        if (currentChainId !== 22469) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x57C5' }], // 22469 in hex
            });
            setCurrentNetwork(NETWORKS[0]); // HII Testnet
          } catch (switchError: any) {
            // Chain not added, add it
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x57C5',
                  chainName: 'HII Testnet',
                  nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18
                  },
                  rpcUrls: ['https://testnet-rpc.hii.network'],
                  blockExplorerUrls: ['https://testnet-explorer.hii.network']
                }]
              });
              setCurrentNetwork(NETWORKS[0]); // HII Testnet
            }
          }
        } else {
          setCurrentNetwork(NETWORKS[0]); // HII Testnet
        }
      } catch (error) {
        console.error('Error switching network:', error);
      }
    }
  };

  return (
    <NetworkContext.Provider
      value={{ 
        currentNetwork, 
        setCurrentNetwork, 
        walletAddress, 
        setWalletAddress: handleSetWalletAddress 
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
