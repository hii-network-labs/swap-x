import { SwapCard } from "@/components/Swap/SwapCard";

const Swap = () => {
  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-6">
        <SwapCard />
      </div>
    </div>
  );
};

export default Swap;
