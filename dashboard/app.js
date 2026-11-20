// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the top signals, a filterable table, an inline detail
// panel with the model's own inputs, why the row ranks where it does, and the protocol's farm plan,
// and the model itself. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  // The model in one function, mirroring lib/model.ts exactly: the page recomputes a row from the
  // snapshot figures and checks the number board.json carries, so the page's code and the board's
  // data are visibly the same arithmetic. Peer multiple is the row's own, priced from live peers.
  // Growth is the dampened curve: a wild week adds at most half the value. Age carries a young
  // ramp, not a cliff: the cut fades linearly from 20% at day zero to nothing at ninety days.
  function impliedOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growthMult = Math.max(model.growth_min_mult, 1 + model.growth_weight * (g / (model.growth_scale + Math.abs(g))));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var ageMult = model.age_floor + (Math.min(Math.max(age, 0), model.age_days) / model.age_days) * model.age_range;
    if (row.age_days !== null && row.age_days !== undefined && row.age_days < model.young_days) {
      ageMult *= model.young_discount + (1 - model.young_discount) * (row.age_days / model.young_days);
    }
    var breadth = 1 + model.breadth_step * Math.min((row.chains || []).length, model.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * ageMult * breadth));
  }

  // Why the row ranks where it does: the factor that lifts it furthest above the model's floor,
  // named and quantified, so the rank is explained, not just asserted.
  function whyNote(row) {
    var m = DATA.model;
    var peerLift = row.peer_multiple / DATA.global_multiple - 1;
    var growthLift = row.growth_multiplier - 1;
    var ageLift = row.age_multiplier - m.age_floor;
    var breadthLift = row.breadth_multiplier - 1;
    var best = Math.max(peerLift, growthLift, ageLift, breadthLift);
    if (best <= 0.02) return 'Scale — no single factor lifts this row: its TVL of ' + fmtUsd(row.tvl_usd) + ' is what puts it here.';
    if (best === peerLift) return 'Rich peers — live protocols in ' + (row.category || 'Other') + ' trade at ' + fmtMult(row.peer_multiple) + ' of TVL, ' + (row.peer_multiple / DATA.global_multiple).toFixed(1) + 'x the live median of ' + fmtMult(DATA.global_multiple) + '.';
    if (best === growthLift) return 'Momentum — its TVL moved ' + fmtPct(row.change_7d) + ' in seven days, the strongest lift on this row.';
    if (best === ageLift) return 'Seasoned — it has run ' + fmtAge(row.age_days) + ' with no token on record, longer than most of the board.';
    return 'Multi-chain — it is live on ' + (row.chains || []).length + ' chains, more surface to farm than a single-chain protocol.';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the chain's gas token and
  // gas price, the TVL's capital, the age's hold and the category's two actions. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasToken(chain) {
    var map = { Ethereum: 'ETH', Base: 'ETH', Arbitrum: 'ETH', Optimism: 'ETH', 'zkSync Era': 'ETH', Linea: 'ETH', Scroll: 'ETH', Blast: 'ETH', Mantle: 'MNT', Mode: 'ETH', Unichain: 'ETH', Ink: 'ETH', Soneium: 'ETH', Abstract: 'ETH', Zora: 'ETH', 'Polygon zkEVM': 'ETH', Solana: 'SOL', Avalanche: 'AVAX', Binance: 'BNB', Polygon: 'POL', Fantom: 'FTM', Celo: 'CELO', Gnosis: 'xDAI', xDai: 'xDAI', Cronos: 'CRO', Kava: 'KAVA', Moonbeam: 'GLMR', Moonriver: 'MOVR', Harmony: 'ONE', Metis: 'METIS', Sonic: 'S', Sei: 'SEI', Aptos: 'APT', Sui: 'SUI', Near: 'NEAR', Tron: 'TRX', Cosmos: 'ATOM', Osmosis: 'OSMO', Injective: 'INJ', Berachain: 'BERA', Monad: 'MON', MegaETH: 'ETH', Plasma: 'XPL', Hyperliquid: 'HYPE', Starknet: 'STRK', Algorand: 'ALGO', Tezos: 'XTZ' };
    return map[chain] || "the chain's gas token";
  }
  function gasCost(chain) {
    if (chain === 'Ethereum') return 'about $6 of gas';
    if (chain === 'Solana') return 'about $0.05 of gas';
    var cheap = ['Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle', 'Mode', 'Unichain', 'Ink', 'Soneium', 'Abstract', 'Zora', 'Polygon zkEVM', 'MegaETH'];
    if (cheap.indexOf(chain) >= 0) return 'about $0.30 of gas';
    return 'about $1 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Deposit $' + capital + " into " + name + "'s launch allocation on " + chain + '.';
    if (c.indexOf('payment') >= 0) return 'Fund $' + capital + ' in ' + name + ' on ' + chain + ' and send one small payment through it.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s index token on " + chain + ' and hold it.';
    if (c.indexOf('nft') >= 0) return 'List one NFT or place a $' + capital + ' offer through ' + name + ' on ' + chain + '.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s private pool on " + chain + '.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and run one of its agent tasks.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' and use it in ' + name + "'s app.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the supply on ' + name + ', hold it a day, then repay it in full.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $10 through ' + name + "'s main pool on " + chain + ' so the wallet has a trade on record.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 back through ' + name + ' to prove the position is used in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards ' + name + ' has accrued and restake them.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Close the hedge on ' + name + ', wait a day, then open a fresh one half the size.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $5 position in a different market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move $10 of the vault shares into a second strategy ' + name + ' offers.';
    if (c.indexOf('stable') >= 0) return 'Swap $10 of the stable asset for USDC on ' + chain + ' and back again.';
    if (c.indexOf('rwa') >= 0) return 'Redeem $10 of the yield asset and re-mint it the next day.';
    if (c.indexOf('insurance') >= 0) return 'Check ' + name + "'s claims page and confirm the policy shows as active.";
    if (c.indexOf('launchpad') >= 0) return 'Vote or stake for a bigger allocation in ' + name + "'s next launch.";
    if (c.indexOf('payment') >= 0) return 'Send a second $5 payment through ' + name + ' to a different address.';
    if (c.indexOf('index') >= 0) return 'Rebalance the index holding on ' + name + ' by $10.';
    if (c.indexOf('nft') >= 0) return 'Buy one low-priced item through ' + name + ' on ' + chain + '.';
    if (c.indexOf('privacy') >= 0) return 'Withdraw $5 from the pool to a fresh address.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Run a second agent task on ' + name + ' with a different prompt.';
    if (c.indexOf('chain') >= 0) return 'Make one swap in ' + name + "'s app on " + chain + '.';
    return 'Make a second $10 deposit into ' + name + ' on ' + chain + ' a week after the first.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function gasUsd(chain) {
    if (chain === 'Ethereum') return 6;
    if (chain === 'Solana') return 0.05;
    var cheap = ['Base', 'Arbitrum', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle', 'Mode', 'Unichain', 'Ink', 'Soneium', 'Abstract', 'Zora', 'Polygon zkEVM', 'MegaETH'];
    if (cheap.indexOf(chain) >= 0) return 0.3;
    return 1;
  }
  function money(n) {
    return n < 10 ? '$' + n.toFixed(2) : '$' + Math.round(n);
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var token = gasToken(chain);
    var gas = gasCost(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.ceil(hold / 7);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with enough ' + token + ' on ' + chain + ' for the first transactions.', cost: gas + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: gas + ', no new capital', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a swap, a vote or a claim, so the wallet stays active.', cost: gas + ' a week (about ' + money(weeks * gasUsd(chain)) + ' over ' + weeks + ' weeks)', time: '10 minutes a week' },
      { text: "Open the protocol's own points or rewards page once a week and check the position counts toward it.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, claim only from the link the protocol itself publishes, never pay to claim, then revoke the approvals and write the wallet, the dates and every transaction in a farm log.', cost: gas + ' to exit', time: '15 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' '), r.driver].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'peer') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function bySlug(slug) {
    var found = DATA.rows.filter(function (r) { return r.slug === slug; });
    return found.length ? found[0] : null;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'rings', 'aria-hidden': 'true' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols below that floor. Implied value is priced from the live market, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global peer multiple' }), el('b', { text: fmtMult(DATA.global_multiple) }))
      )
    );
  }

  function signals() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'signals', 'aria-label': 'Top signals' }, top.map(function (r) {
      return el('button', { type: 'button', class: 'signal', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Rank ' + r.rank + ' · ' + r.driver }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) + ' implied' }),
        el('span', { class: 'meta' }, el('span', { text: 'TVL ' + fmtUsd(r.tvl_usd) }), el('span', { text: '7d ' + fmtPct(r.change_7d) }), el('span', { text: 'Age ' + fmtAge(r.age_days) }))
      );
    }));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain or signal', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'driver' + (r.driver === 'Momentum' || r.driver === 'Rich peers' ? ' hot' : ''), text: r.driver }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Signal' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.peer_ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-to-TVL ratios are the peer multiples the pre-token board is priced with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = DATA.category_multiples.slice().sort(function (a, b) { return b.multiple - a.multiple || (a.category < b.category ? -1 : 1); });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The peer multiple is a trimmed median of the live protocols in the same category (at least ' + m.peer_min_n + ' of them), winsorized so one absurd listing cannot price a category, and shrunk toward the global live median of ' + fmtMult(DATA.global_multiple) + ' by how few peers the category has: a thin category is mostly the market, not its own sample. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x peer x max(' + m.growth_min_mult + ', 1 + ' + m.growth_weight + ' x change_7d / (' + m.growth_scale + ' + |change_7d|)) x (' + m.age_floor + ' + min(age_days, ' + m.age_days + ') / ' + m.age_days + ' x ' + m.age_range + ') x young-ramp x (1 + ' + m.breadth_step + ' x min(chains, ' + m.breadth_max_chains + ')) )'
      ),
      el('p', { class: 'sub', text: 'young-ramp = ' + m.young_discount + ' + ' + (1 - m.young_discount).toFixed(2) + ' x min(age_days, ' + m.young_days + ') / ' + m.young_days + ' while age_days < ' + m.young_days + ', else 1.' }),
      el('p', { class: 'sub', text: 'Growth is a dampened curve, not a clamp: a week of +15% lifts value about 12%, a week of +150% lifts it about 38%, and the snapshot’s fastest grower (+4,448% in a week) can add at most about 50%. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; under ' + m.young_days + ' days old the age factor fades in from a ' + Math.round((1 - m.young_discount) * 100) + '% cut at day zero, with no cliff, and an unlisted age uses ' + m.unknown_age_days + ' days. Peer multiples are clamped to [' + m.peer_floor + ', ' + m.peer_cap + ']. The board never ranks a bridge, a wrapped or staked product of a token that already trades, an exchange, or a versioned pool: those are not protocols waiting for a launch of their own.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('caption', { class: 'sub', text: 'Peer multiples by category, from the live protocols in the snapshot.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live peers' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }))),
          el('tbody', null, multRows.map(function (c) {
            return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.n) }), el('td', { class: 'num', text: fmtMult(c.multiple) }));
          }))
        )
      )
    );
  }

  function detailPanel() {
    var row = bySlug(state.selected);
    if (!row) return null;
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var match = recomputed === row.implied_value_usd;
    return el('section', { class: 'panel detail', id: 'detail', 'aria-labelledby': 'detail-title' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + row.driver + (row.watchlist ? ' · watchlist' : '') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
        ),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Peer multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.peer_multiple) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → ' + row.growth_multiplier + 'x' })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → ' + row.age_multiplier + 'x' })),
          el('div', null, el('span', { text: 'Chain breadth (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: row.breadth_multiplier + 'x' })),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
        ),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
        el('p', { class: 'why', text: 'Why this rank: ' + whyNote(row) })
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('p', { class: 'sub', text: row.farm_summary || '' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      ),
      el('p', { class: 'note', text: 'This protocol records no token in the snapshot. A token may never be issued, and an implied value is the model’s claim about what one would be worth if it were, not a promise of an airdrop.' })
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Method: the board ranks pre-token protocols by an implied value priced from the snapshot itself — the live market’s median market-cap-to-TVL ratio per category, seven-day TVL growth, age with no token on record, and chain breadth. Live-token protocols are set aside with their market caps shown, never ranked as if they still waited for a launch.' }),
      el('p', { text: 'Snapshot ' + DATA.as_of + ' from the DefiLlama protocol index. Implied values are this entry’s own claims, never make.fun’s. Say a protocol records no token, never that it has none.' })
    );
  }

  function openDetail(slug) {
    if (!bySlug(slug)) return;
    state.selected = slug;
    writeHash();
    render();
    var d = document.getElementById('detail');
    if (d && typeof d.scrollIntoView === 'function') d.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(signals());
    shell.appendChild(controls());
    var detail = state.selected ? detailPanel() : null;
    if (detail) shell.appendChild(detail);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
