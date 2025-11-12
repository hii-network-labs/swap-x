import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Circle } from "lucide-react";
import { useNetwork, NETWORKS } from "@/contexts/NetworkContext";
import { cn } from "@/lib/utils";

export const NetworkSelector = () => {
  const { currentNetwork, setCurrentNetwork } = useNetwork();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-glass hover:bg-muted/50 gap-2">
          <Circle
            className={cn(
              "h-2 w-2 fill-current",
              currentNetwork.isTestnet ? "text-orange-500" : "text-green-500"
            )}
          />
          <span className="hidden md:inline">{currentNetwork.name}</span>
          <span className="md:hidden">{currentNetwork.isTestnet ? "Testnet" : "Mainnet"}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-glass">
        <DropdownMenuLabel>Select network</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-glass" />
        
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Mainnet
        </DropdownMenuLabel>
        {NETWORKS.filter((n) => !n.isTestnet).map((network) => (
          <DropdownMenuItem
            key={network.id}
            onClick={() => setCurrentNetwork(network)}
            className={cn(
              "cursor-pointer",
              currentNetwork.id === network.id && "bg-muted"
            )}
          >
            <Circle
              className={cn(
                "h-2 w-2 mr-2 fill-current text-green-500",
                currentNetwork.id === network.id && "animate-pulse"
              )}
            />
            {network.name}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator className="bg-glass" />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Testnet
        </DropdownMenuLabel>
        {NETWORKS.filter((n) => n.isTestnet).map((network) => (
          <DropdownMenuItem
            key={network.id}
            onClick={() => setCurrentNetwork(network)}
            className={cn(
              "cursor-pointer",
              currentNetwork.id === network.id && "bg-muted"
            )}
          >
            <Circle
              className={cn(
                "h-2 w-2 mr-2 fill-current text-orange-500",
                currentNetwork.id === network.id && "animate-pulse"
              )}
            />
            {network.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
