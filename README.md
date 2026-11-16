# Panda

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jahatbanget677-lgtm/Panda/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jahatbanget677-lgtm/Panda/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A peer-priced token launch radar: 198 pre-token protocols ranked by implied value from the snapshot's own live market multiples, seven-day growth, age with no token on record, and chain breadth — each with a concrete 7-step farm plan (cost + time) and a sortable, filterable dark dashboard.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

The program reads the sealed competition snapshot (`snapshot.json`, 758 DefiLlama protocols) and writes the ranked board to `out/board.json`, the dashboard to `out/dashboard/`, and the judge's dossier to `out/dossier.json`. In the grader's container it reads `/input/snapshot.json` and writes `/output` with no arguments.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cakz5fcs&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
