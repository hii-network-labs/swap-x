import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings } from "lucide-react";

interface SlippageSettingsProps {
  slippage: number;
  onSlippageChange: (slippage: number) => void;
}

const PRESET_SLIPPAGES = [0.1, 0.5, 1];

export const SlippageSettings = ({ slippage, onSlippageChange }: SlippageSettingsProps) => {
  const [customValue, setCustomValue] = useState("");
  const [isCustom, setIsCustom] = useState(!PRESET_SLIPPAGES.includes(slippage));

  const handlePresetClick = (value: number) => {
    setIsCustom(false);
    setCustomValue("");
    onSlippageChange(value);
  };

  const handleCustomChange = (value: string) => {
    setCustomValue(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 50) {
      setIsCustom(true);
      onSlippageChange(numValue);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Swap Settings</h3>
            <p className="text-sm text-muted-foreground">
              Slippage tolerance
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              {PRESET_SLIPPAGES.map((preset) => (
                <Button
                  key={preset}
                  variant={slippage === preset && !isCustom ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePresetClick(preset)}
                  className="flex-1"
                >
                  {preset}%
                </Button>
              ))}
            </div>

            <div className="relative">
              <Input
                type="number"
                placeholder="Custom"
                value={customValue}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="pr-8"
                min="0"
                max="50"
                step="0.1"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>

            {customValue && parseFloat(customValue) > 5 && (
              <p className="text-xs text-amber-500">
                ⚠️ High slippage may lead to poor execution
              </p>
            )}

            {customValue && (parseFloat(customValue) <= 0 || parseFloat(customValue) > 50) && (
              <p className="text-xs text-destructive">
                Slippage must be between 0.01% and 50%
              </p>
            )}
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t">
            Slippage tolerance is the maximum price deviation you accept.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
