"use client";

import { useState, useEffect } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import RafflePlatform from "@/components/RafflePlatform";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              Solana Raffle Platform
            </h1>
            <p className="text-gray-400 mt-2">Create and participate in on-chain raffles</p>
          </div>
          {mounted && <WalletMultiButton />}
        </header>

        {mounted ? <RafflePlatform /> : (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading...</p>
          </div>
        )}
      </div>
    </main>
  );
}
