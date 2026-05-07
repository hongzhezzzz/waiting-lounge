# Brain Bet — Iterative Per-Round Betting Redesign

**Author:** Game Design lead, Stage 3 design team
**Date:** 2026-05-07
**Status:** Proposal for engineer review

---

## 0. The user's core hypothesis (and why it's correct)

> "10 consecutive betting number games is far more interesting than 2 single
> games, which brings out the game theory part of the bet."

This is right, and it's the same insight every great betting game has been
built on. In current Brain Bet a round is a self-contained mini-question
worth 0 or 1 score points; the *bet* is just the entry-fee ante that sits
inert until the end of the match. There is no opportunity to **wager more
on the rounds you feel good about** or **fold the rounds you feel bad
about**, which is the entire mechanism by which poker, Liar's Dice, Coup,
and Indian Poker generate their game-theory depth.

The fix is to move the betting *inside* each round and let it compound
across rounds — the running stack model. Every great heads-up betting game
ever made works this way. Below is the research, the design, and the
per-round-type honest assessment.

---

## 1. Research: how iterative-betting games actually generate depth

### 1.1 No-Limit Texas Hold'em

The four-action loop — **check / call / raise / fold** — is universal.
What makes no-limit *deep* (vs limit poker) is that the raise size is
free. A continuous action space turns every bet into a signal: a small
raise, a pot-sized raise, and an all-in are three different stories. With
hidden information the bet size becomes the primary message, and bluffs
work because the opponent has to weight "is this real, or are they making
me pay to find out?".

Most short stack heads-up sit-and-go literature is unanimous: when
effective stacks drop below ~15 BB, almost every decision collapses to
**push or fold** — the smaller the stack, the more "fold equity" (the
chance your opponent folds rather than calling) dominates raw card
strength. We do *not* want infinite raise sizes for a 5-minute mobile
session; we want to live in the push/fold zone where decisions are
crisp.

### 1.2 Indian Poker (real-world version)

Already in our roster, but stripped of its actual mechanic. The real game
has **a full poker betting round** before the showdown — players each see
the opponent's card on their forehead, then check / bet / raise / fold.
The hidden-info inversion is what makes it sing: "If they are betting
big, my card must be low (they see something high). But if they are
*bluffing* big with a low card on my forehead, I'm being scammed." We
re-implemented this as a one-shot bet/fold and lost 80% of the depth.

### 1.3 Liar's Dice & Liar's Bar (2024 Steam hit)

The bid-or-challenge loop produces depth by forcing each turn to be a
**raise** of the previous claim. There's no static round; the action
*compounds*. Liar's Bar reached 1M+ concurrent players in late 2024
specifically because that escalation makes every turn matter — the same
energy we want here.

### 1.4 Coup

Pure bluff with an explicit **challenge** lever. Importantly, Coup proves
that bluff-call dynamics can run with no chips at all — the wager is
positional (a card), not numeric. We won't copy the cards, but the
"challenge" pattern is useful: it gives the non-actor a chance to commit
*against* the actor, not just respond passively.

### 1.5 Confidence wagering — Final Jeopardy & Wits & Wagers

For round types that aren't bluffable (e.g. trivia: "what country is
this?"), Indian-Poker-style betting is wrong. The right model is
**Final Jeopardy**: see the category (or, in our case, the question),
*pre-commit* a wager, then submit your answer, then settle. Wits &
Wagers (the trivia-betting party game) proved the model works
asynchronously and competitively. This gives confidence rounds the same
running-stack pressure without forcing fake bluffs onto factual
questions.

### 1.6 Schelling-point / level-k thinking — chicken games

Pure mixed-strategy rounds (our Chicken Numbers) work in a very specific
way: there is no "right" answer and no hidden info, just the question of
"what number does my opponent think I think they think...". Iterative
betting *deepens* this because you can make the bet a separate axis from
the pick — pick low and bet small, or pick low and shove all-in to
threaten your opponent into picking higher.

### 1.7 Match structure — running stack vs round-equal-ante

Two paradigms. **Running stack** (each starts with N chips, plays until
bust or X rounds, take the survivor's lead): poker tournaments, Liar's
Bar, Coup. **Round-equal-ante** (each round costs the same regardless of
prior state): blitz chess, single trivia rounds, current Brain Bet.

Running stack is overwhelmingly the better fit for our redesign. It
gives players the **stack-pressure** lever — short-stacked players have
to gamble; chip leaders can squeeze; both states create a different
*style* of play that emerges naturally from prior decisions. Round-equal
removes that arc completely and makes every round identical.

The cost is one new failure mode (going broke with rounds remaining),
which we have to handle with a **side-pot / forced-all-in** rule (see
§3.4 below).

---

## 2. The recommended design — "Brain Bet 2.0"

### 2.1 Stack model — running stack, capped table

- **Both players start each match with 1000 internal chips** (the "table
  stack" — *not* the user's account points). The match's real-world
  outcome is decided entirely by the table-stack endgame.
- **Game-level ante to the platform: 100 user-points each** (unchanged
  from today). The 200-point pot is what's *actually* on the line. The
  1000 internal chips are a UI fiction that decides who wins those 200
  points.
- **Why not match account points to chips?** Two reasons.
  1. Privacy / parity: friends with very different account balances would
     play with different starting chips, breaking parity. 1000-each
     guarantees a fair starting state every match.
  2. Volatility: if losing one bad round could empty a player's whole
     account, the game becomes too punishing to invite friends to.
     Capping risk at the 100-pt ante per match keeps onboarding warm.
- The chip count is **shown prominently** at the top of the screen — it's
  the score now, replacing the "rounds won" counter.

### 2.2 The per-round action loop

Each round runs in three named phases. The **type** of round determines
which content is revealed, but every round uses the same shell.

```
Phase A: REVEAL          — public info appears (e.g. opponent's IP card,
                           the trivia question, the chart, etc.)
Phase B: BET (8s)        — each player simultaneously locks one of:
                           CHECK / RAISE+amount / FOLD / ALL-IN
                           (no second street; one round of betting)
Phase C: ANSWER (T s)    — players submit the round's answer
                           (only if neither folded)
Phase D: SHOWDOWN        — answer revealed, chips moved, hand history added
```

Three actions: **check, raise, fold**. (All-in is just `raise = all
your chips`; we don't need a separate verb.) The simultaneity of Phase B
is intentional — there is no "first to act" because we have only two
players and we want the game to feel like an instant standoff, not a
turn-based slog. Sequential betting would also double the per-round
clock, which we cannot afford in a 5-minute match.

**Bet sizing:** discrete buttons, not a slider. Five tiers, scaled to
current pot:
- **Check** — match the current bet (free if no raise in)
- **Raise +25** — small probe
- **Raise +50** — value bet
- **Raise +100** — pressure bet
- **All-in** — shove your stack

The two players' actions resolve like this:

| You    | Opp    | Outcome                                                       |
|--------|--------|---------------------------------------------------------------|
| Check  | Check  | Pot = 2 × ante chip cost (e.g. 50 each); play the answer     |
| Raise X | Check  | Treated as Opp called for X; pot grows; play the answer       |
| Raise X | Raise Y | Both committed to max(X,Y); pot grows; play the answer       |
| Fold   | any    | Folder loses ante (50). Opp wins the pot uncontested.         |
| any    | Fold   | Same, mirrored.                                               |
| Both fold | -    | Both lose ante (penalty for double-fold; prevents stalling).  |

**Per-round forced ante:** to prevent a "fold every round, never
contribute" griefer strategy, every round opens with a **50-chip
forced ante from each player**. The minimum loss per round is 50 chips
(if you fold pre-bet); the minimum stake to continue is matched. Over
10 rounds that floor still leaves a folder with 500 chips, so they
can't just fold their way to a moral victory — they have to actually
play *some* hands.

### 2.3 Hidden vs revealed information per round

This is the critical distinction. Different round types have different
information structures, and the betting only works if we map them
correctly:

- **Asymmetric hidden info** (Indian Poker): you see opponent's card,
  not your own. Betting *before* the answer is the whole game.
- **Symmetric hidden info** (Chicken Numbers): both pick simultaneously,
  neither knows the other's pick. Betting *before* picks lets you
  pressure your opponent into a higher number.
- **Skill / confidence** (Estimation, Big-O, Geo, Stock, Monty): both
  players see the same question. There is no opponent-modeling — only
  self-confidence about your own answer. Betting *before* you submit
  the answer is the right pattern (Final Jeopardy model). Betting
  *after* would just be "did you get it right" → trivial.

**Rule:** all bets close before the answer phase begins. The answer is
revealed only after both players have either bet or folded. This is
non-negotiable — see Critical Decision §6.1.

### 2.4 Round resolution and pot transfer

After Phase C, the pot is awarded in one of three ways depending on
round type:

- **Win / Lose / Tie** (Indian Poker, Estimation, Geo, Big-O, Stock,
  Monty, Chicken). Winner takes the whole pot. Tie splits the pot.
- **Both-fold rounds** (no answer phase). Pot stays with the house — both
  players lose the forced ante. Cleaner than awarding it to no one, and
  it punishes mutual stalling.

### 2.5 End condition — "first to bust, otherwise stack lead at the timer"

- **Match ends when**: (a) one player hits 0 chips (other player wins
  the 200-pt platform pot), OR (b) the 1/5/10-minute clock expires (the
  player with more chips wins; ties refund antes).
- **No fixed round count.** The number of rounds is whatever fits in
  the time budget. This ties the game's pacing directly to the user's
  declared budget — pick 1-min and you're in shove-fold land from
  round 1; pick 10-min and you can play deep stacked.
- The **timer is paused during Phase B / C** (decision time doesn't
  count against your budget — only post-round pause does). Otherwise
  thinking too long would directly steal future rounds.

### 2.6 Tie-breaks and timeouts

Two distinct timeouts per round:

| Timeout type        | What happens                                                  |
|---------------------|---------------------------------------------------------------|
| Bet phase timeout   | Treat as **fold**. (Conservative default — you don't lose your |
|                     |   stack to a connection blip. You lose only the forced ante.) |
| Answer phase timeout| Treat as **wrong answer**. Opponent wins the round if their    |
|                     |   answer was valid; otherwise no winner and pot held.          |
| Both timeouts       | Round voided, antes returned. Likely a network event.          |

Disconnect grace stays at 10s (matches today). After grace expires,
forfeiting player loses the **whole match** (their remaining stack
goes to the survivor). This is consistent with poker tournament rules
and prevents stalling-by-disconnect.

### 2.7 Match length sanity check

Per-round budget at the **type-level fastest** content:
- Phase A (reveal): 1.5 s
- Phase B (bet): 8 s
- Phase C (answer): variable, see §3
- Phase D (showdown / pause): 3 s

Worst case per-round wall-clock for the heaviest round type
(Stock Direction, ~30 s answer): ~42 s. Lightest (Indian Poker):
~16 s.

| Match | Time budget | Min rounds (heavy mix) | Max rounds (light mix) |
|-------|-------------|------------------------|------------------------|
| 1 min | 60 s        | 1–2                    | 3–4                    |
| 5 min | 300 s       | 7                      | 18                     |
| 10 min| 600 s       | 14                     | 35                     |

The 1-minute mode is the only awkward one — there's barely time for
a single full betting round of a heavy type. Two fixes: in 1-min mode,
**only draw light round types** (Indian Poker, Chicken, Geo,
Big-O), and **shorten the bet phase to 5 s**. That gives 3–4 rounds in
1 minute, which still produces a betting arc.

---

## 3. Per-round-type assessment

For each round type, the question is: **does iterative betting work
cleanly, awkwardly, or not at all?**

| Round              | Verdict      | Why                                                                                              | Action                                                       |
|--------------------|--------------|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| **Indian Poker**   | Native fit   | This is *the* iterative-betting card game. Asymmetric hidden info → bet/raise/fold is the game. | Keep as-is, gain full betting loop. Probably top-3 round.   |
| **Chicken Numbers**| Native fit   | Mixed-strategy / Schelling-point. Bet before picks creates pressure mind-game.                  | Keep. Bet phase happens *before* both pick.                  |
| **Estimation Battle** | Works    | Confidence wager works (Final Jeopardy model). Question shown → bet → numeric guess.            | Keep. Bet phase = "how confident are you in your guess?"     |
| **Big-O Showdown** | Works        | Same as Estimation but discrete. Code shown → bet → pick complexity.                            | Keep. Same flow as Estimation.                               |
| **Geo Trivia**     | Works        | Confidence wager. Currently first-correct-locks-immediately — drop that, both submit, closer wins on a tie (impossible here, so a tie just splits). | Keep, but switch off "first lock wins" — both pre-commit answer, then reveal. |
| **Stock Direction**| Works        | Confidence wager. Heavy chart data — need 25-30 s answer phase, so it's a "deep stacked round." | Keep, mark as heavy-time round (skip in 1-min matches).      |
| **Monty Mirage**   | **Awkward**  | Decision tree is short and mathematically tractable. Once a player learns the optimal answer (always switch → 2/3), there's no skill left, only confidence. Betting becomes "I know Monty Hall, do you?". Fine for the first round; stale by round 4.   | **Retire** OR rework as a "Bayesian update" round where the prior is randomized so the optimal answer isn't always switch. **Recommendation: retire.** |

### 3.1 New round type proposal — **"Showhand"** (perfect for iterative betting)

A pure asymmetric hidden-info round, but using *two* cards each (instead
of Indian Poker's one). The structure:

- Each player is dealt a 2-card "hand" face-down.
- Each player **sees one of their opponent's cards**, but neither of their
  own. (So you have partial info on opponent and zero info on yourself —
  this is the strongest version of the Indian Poker tension.)
- Bet → answer is "stay (compare hands at showdown) / bluff-fold (concede)".
- High-card sum wins; ties split.

**Why this is the killer round for iterative betting:** it's isomorphic
to a heads-up poker hand without the postflop streets. Two streets of
information (your visible-on-opponent card, and your own hidden card)
gives a richer bluff space than Indian Poker's single card. It's the
purest game-theory round we could ship.

**Overlap with Pixel Reveal (deferred bucket):** Pixel Reveal is a *bid*
to see the picture-uncovered-by-N-pixels. That's also an iterative
mechanic, just with progressive information — players bid for *more
clarity*. They are different shapes:
- Pixel Reveal = iterative information *purchase*
- Showhand = iterative *commitment* on fixed information

Both fit the redesign. I'd ship **Showhand first** (simpler bank — just
deck cards) and revisit Pixel Reveal in the next phase as a third
hidden-info round, since image curation/sourcing is real work.

### 3.2 Revised round-type roster

After redesign:

1. **Indian Poker** — keep, full betting loop
2. **Chicken Numbers** — keep, bet before picks
3. **Estimation Battle** — keep, confidence-wager
4. **Big-O Showdown** — keep, confidence-wager
5. **Geo Trivia** — keep, drop first-correct-locks
6. **Stock Direction** — keep, marked heavy
7. **Showhand** (new) — keep
8. ~~Monty Mirage~~ — retire (or rework with random priors)

That's 7 round types, same count as today, with the weakest one (Monty)
swapped for the strongest (Showhand).

---

## 4. Three critical decisions for the engineer

### 4.1 Bets MUST close before answers are revealed

Every round type. No exceptions. If a player can submit an answer,
peek at the system's reveal, and *then* bet — even subtly via the
network — the entire game collapses to "answer first, only confident
players bet". The order of operations in the resolver must be:

1. Round starts (reveal phase data — same data both players currently
   get on round_start).
2. Bet phase opens. Server records bets. Server does NOT accept
   answer-submit events during this window.
3. When both bets are in (or bet timeout), close bets. Send
   `answer_phase_open` to both clients simultaneously.
4. Answer phase. Server accepts answer-submit events. Server does NOT
   accept bet events.
5. Both submitted (or timeout) → showdown reveal.

This is a state machine on the round, not the current "everyone
submits whenever". The current `handleAction()` switch needs a phase
guard at the top of every branch.

### 4.2 Every round must support FOLD — a strapped player must not be auto-bankrupted

If a player has 60 chips left and the forced ante is 50, they can still
play but they cannot raise. They MUST be able to fold without seeing
the answer, losing only the 50 ante. If we ever require a minimum bet
beyond the ante, we create an "auto-bust" state where the player is
forced all-in regardless of the round content. That's not a betting
game; that's coin-flipping the loser to victory.

Practical: the fold button must be available in Phase B for *every*
round type, regardless of stack size. This includes the trivia/skill
rounds — even if it's "you are 100% sure of the answer, but you don't
want to risk anything", folding for the ante is a valid play.

### 4.3 Running-stack chips are NOT user account points

The 1000-chip start is a per-match table stack. Account-level points
movement is unchanged: 100 ante in, 200 to winner, refund on tie or
abort. The chip stack is a UI concept that determines *who is the
winner*, but the only point-transaction at game settle is the 200-pt
pot.

Concretely: `chargeAntes()` and `settleGame()` in `transferPoints.ts`
do not change. The runner picks `winnerSocketId` based on chip lead
at end-of-match and passes that to `settleGame()` as today.

**Implication:** the chip stack lives entirely in the runner's
in-memory `State` object. It does not touch the database. If the
server crashes mid-match, the cold-start refund path already handles
ante refund as today — no extra logic needed.

---

## 5. Open design choices for the user (not blocking — engineer can ship with defaults)

These are calls where the user's product taste matters more than any
research. Recommended defaults in **bold**.

1. **Per-round forced ante size** — 50 of 1000 (5%) feels right for
   ~15-round matches. **Default: 50.**
2. **Bet size tiers** — Check / +25 / +50 / +100 / All-in. **Default
   as listed.**
3. **Both-fold penalty** — keeps the ante (house keeps it) vs return
   it. **Default: keep it** to discourage stalling.
4. **Show running-stack to opponent?** Yes — same as poker. Stack
   pressure is half the game. **Default: visible.**
5. **In 1-min match, what's the bet phase clock?** **Default: 5s** to
   fit 3 full rounds in 60s.

---

## 6. Summary table — what the engineer touches

| File                                              | Change                                                                    |
|---------------------------------------------------|---------------------------------------------------------------------------|
| `backend/src/games/brainBet/resolver.ts`          | Replace per-round resolution with phased state machine; add chip stack to `State`; add bet/fold actions; per-round-type pot transfer instead of score increment. |
| `backend/src/games/brainBet/montyMirageBank.json` | Delete (or keep but stop drawing from `ALL_ROUND_TYPES`).                 |
| `backend/src/games/brainBet/showhandBank.json`    | New — but it's a deck (1–13 × 4 suits), no curated content needed.        |
| `backend/src/games/transferPoints.ts`             | Untouched. Ante / settle stay 100 / 200.                                  |
| `web/` (game shell)                               | New bet phase UI, chip stack chip, fold button on every round.            |

---

## 7. References

- Liar's Bar (Steam) on bid-or-challenge escalation:
  https://store.steampowered.com/app/3097560/Liars_Bar/
  https://www.thegamer.com/liars-bar-how-to-play-liars-deck/
- Liar's Dice strategy:
  https://en.wikipedia.org/wiki/Liar%27s_dice
- Indian Poker (real-world rules, full betting):
  https://www.pokertube.com/article/indian-poker
  https://en.wikipedia.org/wiki/Blind_man%27s_bluff_(poker)
- No-Limit Hold'em betting structure & game theory:
  https://thelodgepokerclub.com/no-limit-texas-holdem-rules-beginners-guide/
  https://blogs.cornell.edu/info2040/2021/11/03/game-theory-optimal-gto-texas-holdem-poker-theory/
- Heads-up sit-and-go short-stack push/fold strategy:
  https://www.pokerprofessor.com/university/sit-and-go-strategy/heads-up-sng-strategy
  https://upswingpoker.com/husng-strategy-heads-sit-go-explanation/
- Fold equity in tournament play:
  https://www.cardplayer.com/rules-of-poker/glossary/fold-equity-in-poker
- Coup bluff/challenge mechanic:
  https://en.wikipedia.org/wiki/Coup_(card_game)
- Chicken game / Schelling points / pre-commitment:
  https://en.wikipedia.org/wiki/Focal_point_(game_theory)
  https://academics.hamilton.edu/economics/cgeorges/game-theory-files/mixed-strategies-in-chicken.pdf
- Final Jeopardy wagering structure:
  https://thejeopardyfan.com/final-jeopardy-betting
- Wits & Wagers — confidence-wager trivia:
  https://www.ultraboardgames.com/wits-and-wagers/game-rules.php
