import React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

// A thin top progress bar that appears whenever queries/mutations are in flight.
export const GlobalLoadingBar: React.FC = () => {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = (fetching ?? 0) + (mutating ?? 0) > 0;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-1 transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!active}
    >
      <div className="w-full h-full bg-gradient-to-r from-primary via-blue-500 to-cyan-400 animate-[progress_1.2s_linear_infinite]" />
      <style>
        {`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-[progress_1.2s_linear_infinite] {
          transform: translateX(-50%);
          animation: progress 1.2s linear infinite;
        }
        `}
      </style>
    </div>
  );
};

export default GlobalLoadingBar;