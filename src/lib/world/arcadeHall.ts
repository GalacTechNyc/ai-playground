import type { ArcadeGame, LeaderboardRow } from "@contracts/types";

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export type PracticeResult = "X" | "O" | "draw" | null;

export function practiceResult(board: string): PracticeResult {
  if (!/^[.XO]{9}$/.test(board)) return null;
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== "." && board[a] === board[b] && board[b] === board[c]) return board[a] as "X" | "O";
  }
  return board.includes(".") ? null : "draw";
}

export function practiceMove(board: string, cell: number, turn: "X" | "O"): string {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || board[cell] !== "." || practiceResult(board)) return board;
  return board.slice(0, cell) + turn + board.slice(cell + 1);
}

export function featuredTicTacToe(games: readonly ArcadeGame[], limit = 2): ArcadeGame[] {
  return [...games].filter((g) => g.game === "tictactoe")
    .sort((a, b) => {
      const priority = (g: ArcadeGame) => g.status === "active" ? 0 : g.status === "waiting" ? 1 : 2;
      return priority(a) - priority(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }).slice(0, limit);
}

export function arcadeLeaderboard(rows: readonly LeaderboardRow[], limit = 5): LeaderboardRow[] {
  return [...rows].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)).slice(0, limit);
}
