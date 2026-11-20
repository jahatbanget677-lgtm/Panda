// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the snapshot can rank: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board. They do set the model's prices: see peerMultiple below.
//
// Implied value follows only from the snapshot's own figures, through four factors:
//
//   peer     = the live-token benchmark, made sturdier than a plain median. Each live ratio is
//              winsorized to [0.001, 5] so one absurd listing (the snapshot's worst is 400x its
//              TVL) cannot price a category; a category with at least 5 live peers takes a trimmed
//              median (its smallest and largest ratios dropped); and the result is shrunk toward
//              the global live median, weight n / (n + 3), so a category with only 3 peers is half
//              its own median and half the market. A category with fewer than 3 live peers uses
//              the global median. Clamped to [0.05, 1.50].
//   growth   = 1 + 0.5 x change_7d / (50 + |change_7d|), floored at 0.5. A dampened curve, not a
//              clamp: a week of +15% lifts value ~12%, a week of +150% lifts it ~38%, and the
//              snapshot's fastest grower (+4,444%) can add at most ~50%, so no single wild week
//              decides the board. A week of -50% costs ~25%.
//   age      = 0.65 + 0.35 x min(age_days, 1095) / 1095, times a young ramp of 0.80 + 0.20 x
//              min(age_days, 90) / 90 while under 90 days old: the penalty for a brand-new listing
//              grows smoothly from 20% at day zero to nothing at day ninety, with no cliff. A
//              protocol that has run for years with no token on record is closer to a launch than
//              one listed last month; age_days is null for 113 protocols, which take 365 days.
//   breadth  = 1 + 0.02 x min(chains, 5). A protocol live on several chains has more surface to farm.
//
//   implied  = max(1, round(tvl_usd x peer x growth x age x breadth))
//
// No protocol name is ever special-cased: the same function scores every row, and the peer multiples
// are computed from the snapshot itself, so a future snapshot re-prices the whole board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  peer_floor: number;
  peer_cap: number;
  peer_min_n: number;
  peer_trim_n: number;
  peer_shrink_k: number;
  peer_winsor_low: number;
  peer_winsor_high: number;
  growth_weight: number;
  growth_scale: number;
  growth_min_mult: number;
  age_floor: number;
  age_range: number;
  age_days: number;
  young_days: number;
  young_discount: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  peer_floor: 0.05,
  peer_cap: 1.5,
  peer_min_n: 3,
  peer_trim_n: 5,
  peer_shrink_k: 3,
  peer_winsor_low: 0.001,
  peer_winsor_high: 5,
  growth_weight: 0.5,
  growth_scale: 50,
  growth_min_mult: 0.5,
  age_floor: 0.65,
  age_range: 0.35,
  age_days: 1095,
  young_days: 90,
  young_discount: 0.8,
  unknown_age_days: 365,
  breadth_step: 0.02,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's peer multiple: the live benchmark the model priced it with. */
export interface CategoryMultiple {
  category: string;
  n: number;
  multiple: number;
}

/** The peer multiples, by category, and the global fallback. */
export interface PeerMultiples {
  byCategory: Map<string, number>;
  global: number;
  table: CategoryMultiple[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  driver: string;
  model: {
    peer_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_summary: string;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  peer_multiple: number;
  growth_multiplier: number;
  age_multiplier: number;
  breadth_multiplier: number;
  driver: string;
  watchlist: boolean;
  farm_summary: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  peer_ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  category_multiples: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of sorted numbers; the mean of the two middles when the count is even. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The live-token benchmark: per category, a trimmed median of the live protocols' market-cap-to-TVL
 * ratios, shrunk toward the global live median. Each ratio is winsorized to [peer_winsor_low,
 * peer_winsor_high] so one absurd listing cannot price a category; with at least peer_trim_n peers
 * the smallest and largest ratios are dropped before the median; and the result is weighted
 * n / (n + peer_shrink_k) against the global median, so a category with only a few live peers is
 * mostly the market, not its own thin sample. A category with fewer than peer_min_n live peers uses
 * the global median. All multiples are clamped to [peer_floor, peer_cap]. The table holds only the
 * categories with enough live peers, by category name.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): PeerMultiples {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  const winsor = (r: number): number => Math.min(model.peer_winsor_high, Math.max(model.peer_winsor_low, r));
  const ratios = (ps: SnapshotProtocol[]): number[] =>
    ps
      .map((p) => (p.mcap_usd !== null && p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : NaN))
      .filter((r) => Number.isFinite(r) && r > 0)
      .map(winsor)
      .sort((a, b) => a - b);
  const clamp = (v: number): number => Math.min(model.peer_cap, Math.max(model.peer_floor, v));
  const trimmedMedian = (rs: number[]): number => {
    if (rs.length >= model.peer_trim_n) return median(rs.slice(1, -1));
    return median(rs);
  };
  const all = ratios(live);
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const byCategory = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  const cats = [...new Set(live.map((p) => p.category ?? 'Other'))].sort();
  for (const c of cats) {
    const rs = ratios(live.filter((p) => (p.category ?? 'Other') === c));
    if (rs.length >= model.peer_min_n) {
      const w = rs.length / (rs.length + model.peer_shrink_k);
      const m = clamp(w * trimmedMedian(rs) + (1 - w) * global);
      byCategory.set(c, m);
      table.push({ category: c, n: rs.length, multiple: round4(m) });
    }
  }
  return { byCategory, global, table };
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: PeerMultiples,
  model: ModelConstants = MODEL,
): { implied: number; peer: number; growthPct: number; growthMult: number; ageMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  // The peer multiple is rounded to 4 decimals BEFORE it prices the row, so the value the
  // dashboard stores is exactly the value the model used: the page's recompute must match.
  const peer = round4(multiples.byCategory.get(protocol.category ?? 'Other') ?? multiples.global);
  const rawGrowth = finite(protocol.change_7d, 0);
  // A dampened curve, not a clamp: growth approaches 1 + growth_weight as the week goes to
  // infinity, so a +4,444% week can add at most ~50% and a -50% week costs ~25%.
  const growthPct = Math.round(rawGrowth * 100) / 100;
  const growthMult = Math.max(
    model.growth_min_mult,
    1 + model.growth_weight * (rawGrowth / (model.growth_scale + Math.abs(rawGrowth))),
  );
  const ageForModel = age ?? model.unknown_age_days;
  let ageMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days) / model.age_days) * model.age_range;
  // The young ramp, not a cliff: a listing's age factor is cut by up to 20% on day zero and the
  // cut fades linearly to nothing at young_days, so day 89 and day 90 score almost alike.
  if (age !== null && age < model.young_days) {
    ageMult *= model.young_discount + (1 - model.young_discount) * (age / model.young_days);
  }
  const breadthMult = 1 + model.breadth_step * Math.min(protocol.chains.length, model.breadth_max_chains);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peer * growthMult * ageMult * breadthMult));
  return { implied, peer, growthPct, growthMult, ageMult, breadthMult, age };
}

/** Which factor carries a row: the one that lifts it furthest above the model's floor. */
export function driverOf(peer: number, global: number, growthMult: number, ageMult: number, breadthMult: number, model: ModelConstants = MODEL): string {
  const peerLift = peer / global - 1;
  const growthLift = growthMult - 1;
  const ageLift = ageMult - model.age_floor;
  const breadthLift = breadthMult - 1;
  const best = Math.max(peerLift, growthLift, ageLift, breadthLift);
  if (best <= 0.02) return 'Scale';
  if (best === growthLift) return 'Momentum';
  if (best === peerLift) return 'Rich peers';
  if (best === ageLift) return 'Seasoned';
  return 'Multi-chain';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories a launch can never come from: a bridge, a staked or restaked product, or an exchange. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a bridge, a wrapped or staked
 * product of a token that already trades, an exchange, or a versioned pool. This is the watchlist's
 * own exclusion, applied to every row the board ranks, not just the floor: WBTC is Bitcoin on
 * Ethereum and USDT0 is a bridged USDT, so neither is a protocol still waiting on a launch of its
 * own, and ranking them first would say the radar cannot tell a wrapped product from a launch.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = peerMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the snapshot can rank, not just the largest ones.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    driver: driverOf(s.peer, multiples.global, s.growthMult, s.ageMult, s.breadthMult, model),
    model: {
      peer_multiple: round4(s.peer),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
    farm_summary: farmSummary(s.p, s.age),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas token a chain settles fees in, for the chains the snapshot names most. */
function gasToken(chain: string): string {
  const map: Record<string, string> = {
    Ethereum: 'ETH', Base: 'ETH', Arbitrum: 'ETH', Optimism: 'ETH', 'zkSync Era': 'ETH', Linea: 'ETH',
    Scroll: 'ETH', Blast: 'ETH', Mantle: 'MNT', Mode: 'ETH', Unichain: 'ETH', Ink: 'ETH', Soneium: 'ETH',
    Abstract: 'ETH', Zora: 'ETH', 'Polygon zkEVM': 'ETH',
    Solana: 'SOL', Avalanche: 'AVAX', Binance: 'BNB', Polygon: 'POL', Fantom: 'FTM', Celo: 'CELO',
    Gnosis: 'xDAI', xDai: 'xDAI', Cronos: 'CRO', Kava: 'KAVA', Moonbeam: 'GLMR', Moonriver: 'MOVR',
    Harmony: 'ONE', Metis: 'METIS', Sonic: 'S', Sei: 'SEI', Aptos: 'APT', Sui: 'SUI', Near: 'NEAR',
    Tron: 'TRX', Cosmos: 'ATOM', Osmosis: 'OSMO', Injective: 'INJ', Berachain: 'BERA', Monad: 'MON',
    MegaETH: 'ETH', Plasma: 'XPL', Hyperliquid: 'HYPE', Starknet: 'STRK', Algorand: 'ALGO', Tezos: 'XTZ',
  };
  return map[chain] ?? "the chain's gas token";
}

/** What one transaction costs on a chain: mainnet is dear, rollups are cheap, Solana is cheapest. */
function gasCost(chain: string): string {
  if (chain === 'Ethereum') return 'about $6 of gas';
  if (chain === 'Solana') return 'about $0.05 of gas';
  const cheap = new Set([
    'Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle', 'Mode',
    'Unichain', 'Ink', 'Soneium', 'Abstract', 'Zora', 'Polygon zkEVM', 'MegaETH',
  ]);
  if (cheap.has(chain)) return 'about $0.30 of gas';
  return 'about $1 of gas';
}

/** What one transaction costs on a chain, in whole US dollars: mainnet is dear, rollups are cheap, Solana is cheapest. */
function gasUsd(chain: string): number {
  if (chain === 'Ethereum') return 6;
  if (chain === 'Solana') return 0.05;
  const cheap = new Set([
    'Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle', 'Mode',
    'Unichain', 'Ink', 'Soneium', 'Abstract', 'Zora', 'Polygon zkEVM', 'MegaETH',
  ]);
  if (cheap.has(chain)) return 0.3;
  return 1;
}

/** A dollar amount in the plan's own words: cents below $10, whole dollars above. */
function money(n: number): string {
  return n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('launchpad')) return `Deposit $${capital} into ${name}'s launch allocation on ${chain}.`;
  if (c.includes('payment')) return `Fund $${capital} in ${name} on ${chain} and send one small payment through it.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  if (c.includes('nft')) return `List one NFT or place a $${capital} offer through ${name} on ${chain}.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s private pool on ${chain}.`;
  if (c.includes('ai') || c.includes('agent')) return `Deposit $${capital} into ${name} on ${chain} and run one of its agent tasks.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use it in ${name}'s app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different move on the same protocol, so the wallet's history is not one transaction. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $10 against the supply on ${name}, hold it a day, then repay it in full.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $10 through ${name}'s main pool on ${chain} so the wallet has a trade on record.`;
  if (c.includes('bridge')) return `Bridge $10 back through ${name} to prove the position is used in both directions.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards ${name} has accrued and restake them.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Close the hedge on ${name}, wait a day, then open a fresh one half the size.`;
  if (c.includes('prediction')) return `Place a second $5 position in a different market on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $10 of the vault shares into a second strategy ${name} offers.`;
  if (c.includes('stable')) return `Swap $10 of the stable asset for USDC on ${chain} and back again.`;
  if (c.includes('rwa')) return `Redeem $10 of the yield asset and re-mint it the next day.`;
  if (c.includes('insurance')) return `Check ${name}'s claims page and confirm the policy shows as active.`;
  if (c.includes('launchpad')) return `Vote or stake for a bigger allocation in ${name}'s next launch.`;
  if (c.includes('payment')) return `Send a second $5 payment through ${name} to a different address.`;
  if (c.includes('index')) return `Rebalance the index holding on ${name} by $10.`;
  if (c.includes('nft')) return `Buy one low-priced item through ${name} on ${chain}.`;
  if (c.includes('privacy')) return `Withdraw $5 from the pool to a fresh address.`;
  if (c.includes('ai') || c.includes('agent')) return `Run a second agent task on ${name} with a different prompt.`;
  if (c.includes('chain')) return `Make one swap in ${name}'s app on ${chain}.`;
  return `Make a second $10 deposit into ${name} on ${chain} a week after the first.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the gas token and the gas price follow its first chain, the capital follows its TVL, the
 * hold follows its age, and both actions follow its category. The weekly step states what the
 * whole hold costs in gas, not just one week of it.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const token = gasToken(chain);
  const gas = gasCost(chain);
  const gasN = gasUsd(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with enough ${token} on ${chain} for the first transactions.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `${gas}, no new capital`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a swap, a vote or a claim, so the wallet stays active.`,
      cost: `${gas} a week (about ${money(weeks * gasN)} over ${weeks} weeks)`,
      time: '10 minutes a week',
    },
    {
      text: `Open the protocol's own points or rewards page once a week and check the position counts toward it.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, claim only from the link the protocol itself publishes, never pay to claim, then revoke the approvals and write the wallet, the dates and every transaction in a farm log.`,
      cost: `${gas} to exit`,
      time: '15 minutes',
    },
  ];
}

/**
 * The plan's totals, in one line: the gas for every transaction the plan makes (one to fund, one
 * for each of the two actions, one a week through the hold, two to claim and revoke on exit), the
 * capital deployed and returned on exit, and the active time spread over the hold. The capital is
 * never spent, only parked: the cost is the gas.
 */
export function farmSummary(p: SnapshotProtocol, age: number | null): string {
  const gasN = gasUsd(chainOf(p));
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const txs = 5 + weeks;
  const totalGas = txs * gasN;
  const activeMinutes = 45 + weeks * 15;
  const active =
    activeMinutes >= 60
      ? `about ${(Math.round((activeMinutes / 60) * 2) / 2).toString().replace(/\.0$/, '')} hours of active time`
      : `about ${activeMinutes} minutes of active time`;
  return `Plan total: about ${money(totalGas)} in gas across ${txs} transactions over ${hold} days, plus $${capital} of capital deployed and returned on exit. ${active.charAt(0).toUpperCase() + active.slice(1)} spread over the ${hold} days.`;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      peer_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    driver: row.driver,
    watchlist: watchlist.has(row.slug),
    farm_summary: row.farm_summary,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const multiples = peerMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    category_multiples: multiples.table,
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
