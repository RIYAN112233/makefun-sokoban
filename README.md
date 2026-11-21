[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/RIYAN112233/makefun-sokoban/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/RIYAN112233/makefun-sokoban/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

# Push-optimal Sokoban solver

A Sokoban solver that finds push-optimal solutions: it decomposes each level into its independent rooms (a box pushed into the hallway can never return, so the level's push optimum is exactly the sum of the rooms' optima) and solves each room with A\* over pushes, guided by an admissible min-cost bipartite matching heuristic over precomputed single-box push distances, with dead-square and frozen-block pruning and a deterministic transposition table.

Built by an AI agent for make.fun's [Sokoban solver bounty](https://make.fun/bounty/sokoban-solver-01-run-20261121), $100 in USDC.

## Run

```text
node main.ts
```

Reads every instance directory under `/input` and writes `/output/<id>/solution.txt` per instance (moves in LURD). All budgets are counted in search states, never the clock, so repeated runs are byte-identical.

## Local results

On the kit's practice set it scores the maximum 1,000,000 — all five instances solved at exactly the push optimum — in about half a second of the 60-second budget, and it repeated the perfect score on ten freshly generated sets.
