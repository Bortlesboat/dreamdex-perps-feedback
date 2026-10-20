// Real strategy, quantity conversion, pool sizing, placement and error handling.
// Only exchange responses, bootstrap and time are controlled. No network or key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cycles: 0, inventory: 0, notional: 25, mark: 100, move: false,
  poolMax: 1_000_000_000n, lot: "10000", min: "10000",
  rejection: "both" as "both" | "bid" | "none",
  placed: [] as Array<{ cycle: number; isBid: boolean; quantity: bigint; price: bigint }>,
  cancelled: [] as bigint[], sized: [] as Array<{isBid: boolean; price: bigint}>,
}));
const fixed = process.env.EXPECT_MAKER_FIX === "1";
vi.mock("@dreamdex-bot-kit/perp-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dreamdex-bot-kit/perp-core")>();
  const market = () => ({symbol: "BTC/USDso:USDso", display: "BTC-PERP",
    info: {baseSymbol: "BTC", baseDecimals: 8, quoteDecimals: 18,
      poolAddress: "0x0000000000000000000000000000000000000002",
      marginBank: "0x0000000000000000000000000000000000000003",
      tickSize: "1000000000000000", lotSize: state.lot, minQuantity: state.min,
      markPrice: "100000000000000000000"},
  });
  const exchange = {
    walletAddress: "0x0000000000000000000000000000000000000001",
    fetchPositions: async () => state.inventory ? [{symbol: market().symbol,
      side: state.inventory > 0 ? "long" : "short", contracts: Math.abs(state.inventory) / state.mark}] : [],
    client: {getMaxPerpOrderSize: async (request: {isBid: boolean; price: bigint}) => {
      state.sized.push(request);
      return {priceable: true, placeable: true, maxQuantity: state.poolMax,
        limitedBy: "margin", effectiveImfBps: 5000n};
    }},
    trader: {
      placePerpOrder: async (order: {isBid: boolean; quantity: bigint; price: bigint}) => {
        state.placed.push({...order, cycle: state.cycles});
        if (state.rejection === "both" || (state.rejection === "bid" && order.isBid))
          throw new Error("execution reverted: PostOnlyWouldCross");
        return {orderId: BigInt(state.placed.length), receipt: {status: "success"}, fills: []};
      },
      cancelOrder: async ({orderId}: {orderId: bigint}) => {state.cancelled.push(orderId);},
    },
  };
  return {...actual, loadEnv: () => {},
    envNum: (name: string, fallback: number) => name === "PERP_MM_NOTIONAL_USDSO" ? state.notional : fallback,
    createExchange: () => ({exchange, config: {symbol: "BTC-PERP", dryRun: false}}),
    onStop: () => () => state.cycles >= 2, requireMarket: async () => market(),
    liveMark: async () => state.move && state.cycles ? state.mark * 1.01 : state.mark,
    tradingKeyCheck: async () => ({ok: true}),
    preflight: async () => ({ok: true, message: "controlled margin response"}),
    ensureLeverage: async () => ({from: 2, to: 2}),
    sleep: async () => {state.cycles += 1;}, shutdown: async () => {},
  };
});
beforeEach(() => {
  vi.resetModules();
  Object.assign(state, {cycles: 0, inventory: 0, notional: 25, mark: 100, move: false,
    poolMax: 1_000_000_000n, lot: "10000", min: "10000", rejection: "both",
    placed: [], cancelled: [], sized: []});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});
afterEach(() => vi.restoreAllMocks());
async function runStrategy() {
  await import("../../../strategies/perp-maker/src/index.ts");
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
}
function firstNotional(isBid: boolean) {
  const order = state.placed.find(o => o.isBid === isBid);
  return order ? Number(order.quantity) / 1e8 * state.mark : 0;
}
describe(`perp-maker ${fixed ? "regression contract" : "upstream reproduction"}`, () => {
  it.each([90, -90])("caps an increasing quote with signed inventory %s", async inventory => {
    state.inventory = inventory; await runStrategy();
    expect(firstNotional(inventory > 0)).toBe(fixed ? 10 : 25);
    expect(firstNotional(inventory < 0)).toBe(25);
  });
  it("bounds a quote larger than the entire cap", async () => {
    state.notional = 250; await runStrategy();
    expect(firstNotional(true)).toBe(fixed ? 100 : 250);
    expect(firstNotional(false)).toBe(fixed ? 100 : 250);
  });
  it("preserves the smaller pool ceiling (negative control)", async () => {
    state.inventory = 90; state.poolMax = 5_000_000n; await runStrategy();
    expect(firstNotional(true)).toBe(5);
    expect(state.sized.some(s => s.isBid)).toBe(true);
  });
  it("does not send headroom below the market minimum", async () => {
    state.inventory = 99.99; state.min = "100000"; await runStrategy();
    expect(firstNotional(true)).toBe(fixed ? 0 : 25);
  });
  it("retries two actual PostOnlyWouldCross rejections at the same mark", async () => {
    await runStrategy();
    expect(state.cycles).toBe(2);
    expect(state.placed.map(o => o.cycle)).toEqual(fixed ? [0,0,1,1] : [0,0]);
    expect(state.cancelled).toEqual([]);
  });
  it("retries only a missing bid without cancelling a successful ask", async () => {
    state.rejection = "bid"; await runStrategy();
    expect(state.placed.map(o => [o.cycle,o.isBid])).toEqual(
      fixed ? [[0,true],[0,false],[1,true]] : [[0,true],[0,false]]);
    expect(state.cancelled).toEqual([2n]); // Final shutdown only.
  });
  it("already retries when the mark moves (negative control)", async () => {
    state.move = true; await runStrategy();
    expect(state.placed.map(o => o.cycle)).toEqual([0,0,1,1]);
  });
  it("keeps both healthy quotes when the mark is unchanged", async () => {
    state.rejection = "none"; await runStrategy();
    expect(state.placed.map(o => o.cycle)).toEqual([0,0]);
    expect(state.cancelled).toEqual([1n,2n]);
  });
  it("does not treat an intentionally cap-disabled bid as a failed quote", async () => {
    state.inventory = 100; state.rejection = "none"; await runStrategy();
    expect(state.placed.map(o => [o.cycle,o.isBid])).toEqual([[0,false]]);
  });
  it("keeps real lot alignment when clamping", async () => {
    state.inventory = 90.03; state.lot = "100000"; await runStrategy();
    expect(firstNotional(true)).toBe(fixed ? 9.9 : 25);
  });
});
