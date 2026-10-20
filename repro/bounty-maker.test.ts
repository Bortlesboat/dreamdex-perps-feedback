// Reproductions against the unmodified perp-maker strategy.
// All exchange operations are mocked: no account, key, RPC or orders are used.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cycles: 0,
  inventory: 0,
  placed: [] as Array<{ side: string; quantity: bigint; price: bigint }>,
}));

vi.mock("@dreamdex-bot-kit/perp-core", () => {
  const market = {
    symbol: "BTC/USDso:USDso", display: "BTC-PERP",
    info: { baseSymbol: "BTC", baseDecimals: 8, quoteDecimals: 18, markPrice: "100000000000000000000" },
  };
  return {
    ORDER_TYPE: { POST_ONLY: 2 },
    loadEnv: () => {},
    envNum: (_name: string, fallback: number) => fallback,
    createExchange: () => ({
      exchange: { walletAddress: "0x0000000000000000000000000000000000000001" },
      config: { symbol: "BTC-PERP", dryRun: false },
    }),
    onStop: () => () => state.cycles >= 2,
    requireMarket: async () => market,
    liveMark: async () => 100,
    positionIn: async () => state.inventory
      ? { side: "long", contracts: state.inventory / 100 } : undefined,
    tradingKeyCheck: async () => ({ ok: true }),
    preflight: async () => ({ ok: true, message: "mock margin ready" }),
    ensureLeverage: async () => ({ from: 2, to: 2 }),
    sizeForNotional: (notional: number) => BigInt(notional * 1e6),
    sizeOrder: async (_exchange: unknown, request: { wanted: bigint }) => ({
      ok: true, quantity: request.wanted,
    }),
    placePerp: async (args: { side: string; quantity: bigint; price: bigint }) => {
      state.placed.push({ side: args.side, quantity: args.quantity, price: args.price });
      // The real helper returns this exact shape on PostOnlyWouldCross.
      return { sent: false, filled: 0n, noFill: true };
    },
    cancelQuietly: async () => {},
    sleep: async () => { state.cycles += 1; },
    shutdown: async () => {},
  };
});

beforeEach(() => {
  vi.resetModules();
  state.cycles = 0;
  state.inventory = 0;
  state.placed = [];
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});
afterEach(() => vi.restoreAllMocks());

async function runStrategy() {
  await import("../../../strategies/perp-maker/src/index.ts");
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
}

describe("perp-maker bounty reproductions (offline, pinned upstream)", () => {
  it("offers another 25 USDso bid with 90 USDso inventory and a 100 USDso cap", async () => {
    state.inventory = 90;
    await runStrategy();
    const bid = state.placed.find(order => order.side === "long")!;
    expect(bid).toBeDefined();
    const addedNotional = Number(bid.quantity) / 1e8 * 100;
    expect(addedNotional).toBe(25);
    expect(state.inventory + addedNotional).toBe(115);
    console.log("CAP_REPRO", JSON.stringify({
      startingInventory: 90, configuredCap: 100, bidNotionalAtMark: addedNotional,
      possibleInventoryAfterFill: state.inventory + addedNotional,
    }));
  });

  it("does not retry skipped quotes on the next same-mark cycle", async () => {
    await runStrategy();
    expect(state.cycles).toBe(2);
    // Two attempted quotes in cycle 1; zero in cycle 2 despite no resting orders.
    expect(state.placed.map(order => order.side)).toEqual(["long", "short"]);
    console.log("RETRY_REPRO", JSON.stringify({
      cycles: state.cycles, quoteAttempts: state.placed.length,
      restingOrders: 0, expectedAttemptsWithRetry: 4,
    }));
  });
});
