import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { NetworkSelector } from "./NetworkSelector";
import { useNetwork } from "@/contexts/NetworkContext";

export const Header = () => {
  const { walletAddress, setWalletAddress, currentNetwork } = useNetwork();

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        setWalletAddress(accounts[0]);
      } catch (error) {
        console.error("Failed to connect wallet:", error);
      }
    } else {
      alert('Please install MetaMask to use this feature');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <header className="border-b border-glass backdrop-blur-xl bg-glass sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              DeFiSwap
            </h1>
            <nav className="hidden md:flex gap-6">
              <NavLink 
                to="/" 
                className="text-muted-foreground hover:text-foreground transition-colors"
                activeClassName="text-foreground font-medium"
              >
                Swap
              </NavLink>
              <NavLink 
                to="/pools" 
                className="text-muted-foreground hover:text-foreground transition-colors"
                activeClassName="text-foreground font-medium"
              >
                Pools
              </NavLink>
              <NavLink 
                to="/history" 
                className="text-muted-foreground hover:text-foreground transition-colors"
                activeClassName="text-foreground font-medium"
              >
                History
              </NavLink>
            </nav>
          </div>
          
          <div className="flex items-center gap-2">
            <NetworkSelector />
            <Button 
              onClick={connectWallet}
              className="bg-gradient-primary hover:opacity-90 transition-opacity"
            >
              <Wallet className="mr-2 h-4 w-4" />
              {walletAddress ? formatAddress(walletAddress) : 'Connect Wallet'}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
