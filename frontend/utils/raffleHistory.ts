export interface RaffleHistoryEntry {
  raffleId: string;
  raffleAddress: string;
  creator: string;
  ticketPrice: number;
  maxTickets: number;
  totalTicketsSold: number;
  endTime: number;
  winner: string;
  winningTicketNumber: number;
  completedAt: number;
  transactionSignature: string;
}

const STORAGE_KEY = "raffle_history";

export function addRaffleToHistory(entry: RaffleHistoryEntry): void {
  try {
    const history = getRaffleHistory();
    history.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    console.log("✅ Raffle added to history:", entry.raffleId);
  } catch (error) {
    console.error("Error writing raffle history:", error);
  }
}

export function getRaffleHistory(): RaffleHistoryEntry[] {
  try {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error reading raffle history:", error);
    return [];
  }
}

export function getRaffleById(raffleId: string): RaffleHistoryEntry | null {
  const history = getRaffleHistory();
  return history.find((entry) => entry.raffleId === raffleId) || null;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("✅ Raffle history cleared");
  } catch (error) {
    console.error("Error clearing raffle history:", error);
  }
}
