# Market Survey: Competitive / Skill / Casual-Multiplayer Platforms

**Audience:** UX, game-design, and engineering leads for Waiting Lounge Stage 3.
**Use:** Reference for design direction. Engineer should read the deep-dive section at the bottom in detail.
**Date:** May 2026.
**Constraint reminder:** Waiting Lounge sessions are bounded by AI-coding wait times (30 s – 10 min), users are anonymous, no real money, low attention budget (the user is also coding).

---

## 1. Platform table

### Codingame — Clash of Code (★ closest analog)

- **Format & length.** 2–8 players, 1 round per "clash." Each round is a single short coding problem. Hard cap **15 minutes per clash**, but the Codingame blog notes most are sub-5 min and "not rare to end in less than a minute." Three rotating problem types pulled at random per clash: **Fastest** (first to pass tests wins), **Shortest** (code-golf, fewest characters), **Reverse** (statement hidden — you only see input/output examples and must reverse-engineer the spec). Reverse mode is the standout — it makes the puzzle itself a guessing game and tests a different skill from leetcode.
- **Matchmaking speed.** "Quick play" tries to pair you in the public lobby; if humans are scarce, **bots gradually fill until 4 players are present, then bots step out as humans arrive.** The clash starts as soon as ≥2 players are in. They do this specifically because "waiting 5 minutes in the lobby is discouraging" — they explicitly chose to subsidize empty hours with bot-padding.
- **Betting / point structure.** No ante, no risk. Pure ladder XP. Win/place gives XP toward a Clash level (1–30). Each clash is independent — you can't lose progress, only gain it. **No risk = no anxiety = high willingness to play one quickly.**
- **Retention loop.** Persistent XP/level (Clash level 1–30), worldwide leaderboard, achievement unlocks tied to specific in-game feats. Solution sharing post-clash (you see how others solved it). No daily reward / no streaks — surprisingly weak for a coding-audience product.
- **Anonymity model.** Free account required, but handle is freely chosen (e.g. `thelegendski`); Codingame internally assigns a 39-char hex public handle. No real names. Avatar optional.
- **Lobby UX.** A single public-quick-play button + private-clash invite link. Lobby shows who's joined, country flag, and a countdown. Bot-fill is the killer feature here.
- **Nails:** Bot-fill during low traffic + Reverse mode (turns "writing code" into a detective puzzle). **Don't copy:** XP-only progression with no daily ritual — they whiff on retention. Their 8-player free-for-all also doesn't translate to a 1v1 lounge.

### Lichess — Puzzle Storm + Bullet

- **Format & length.** **Puzzle Storm:** solo, exactly **3 minutes**, solve as many puzzles as possible; -10 s on each wrong move. **Bullet chess:** 1+0 or 2+1 — a 1v1 game lasts 1–4 minutes. Both feel small enough to do "between things."
- **Matchmaking speed.** Bullet lobby pairs in seconds at any hour because Lichess has continuous global traffic. Puzzle Storm requires zero matchmaking — solo against the clock.
- **Betting / point structure.** None. Bullet uses Glicko-2 rating (Elo-like) — nothing changes hands except rating points. Storm has no rating at all (intentionally — they don't want cheating moderation overhead).
- **Retention loop.** Daily best score (Storm shows your best for **today vs. all-time**), profile shows highest score, free-forever guarantee with no ads. No streaks, no leagues. Surprisingly minimalist.
- **Anonymity model.** **Optional account.** Anonymous players go straight to the lobby; matchmaking is just worse (no rating to seed against). This is the most relevant precedent for our zero-friction stance.
- **Lobby UX.** "Quick pairing" tiles (1+0, 2+1, 3+0…) with one-click join. Or open seeks. Single column, monospace counts of players online per tile. Famously fast.
- **Nails:** Solo timed mode (Puzzle Storm) as a fallback when no one's around — perfect for low-traffic hours. **Don't copy:** Refusing leaderboards entirely; their reasoning (cheating moderation) doesn't apply at our scale and we lose a free retention hook.

### Codingame Clash of Code (already covered) vs. **HackerRank BattleCode / CodeArena / Codeforces Duel**

- **Format & length.** 1v1 head-to-head coding battles. CodeArena and Codeforces Duel both use ELO. Problems take 5–20 minutes typically — **already too long for our use case.**
- **Matchmaking speed.** ELO-gated, so wait times scale poorly at low concurrency. Codeforces Duel is a community side-project; matchmaking is "find a friend or wait."
- **Betting / point structure.** ELO change per match (HackerRank), no risk-of-loss in points. AlgoArena boasts 10K+ problems but is also no-stakes.
- **Retention loop.** ELO is the loop. No daily rituals.
- **Anonymity.** Account required everywhere. Real handles, often tied to LinkedIn-shaped careers (HackerRank).
- **Lobby UX.** "Find match" button → spinner → dropped into editor. Generic.
- **Nails:** Deep problem libraries (10K+ on AlgoArena means infinite variety). **Don't copy:** ELO + 15-min problem length = dead lobby at 3 a.m. and a session that outlasts the user's coding wait. Wrong shape for us.

### PokerStars Zoom

- **Format & length.** Cash poker. Each hand is **15–60 seconds** because the moment you fold you're whisked to a new table with new opponents. 200–250 hands/hour vs. 50–60 at a regular table. You can sit down for 90 seconds and play 4 hands.
- **Matchmaking speed.** **Zero** — you join a pool (often 500+ players at micro-stakes), not a table. The next hand always has 8 random opponents drawn from the pool.
- **Betting / point structure.** Cash blinds + experimental small ante (1¢ at NL2/NL5/NL10) tested specifically to make passive folding more expensive and force action.
- **Retention loop.** Real money is the loop — they don't need streaks. Plus VIP tiers and rake-back.
- **Anonymity.** Account, real-money KYC. Handle visible at the table.
- **Lobby UX.** Single "Sit down" button per stake level. The pool is invisible; you go straight from button to dealt cards.
- **Nails:** **Pool matchmaking** is the magic move — it eliminates the empty-table problem entirely. We should steal this for Brain Bet. **Don't copy:** Real money + 8-handed tables don't fit. Their "fold to teleport" only works because cards are independent units; doesn't apply to a 3-round Brain Bet game.

### PrizePicks / Polymarket / Kalshi

- **Format & length.** Asynchronous prediction markets. **PrizePicks** Pick'Em: build a 2–6 leg parlay, settle when the underlying events finish (hours to days). **Polymarket / Kalshi:** continuous order books on yes/no contracts ($0.01–$0.99 per share, settles to $0 or $1). Trades are instantaneous; market resolution is whenever the underlying event resolves.
- **Matchmaking speed.** Not applicable — you're trading against a market, not a person.
- **Betting / point structure.** **PrizePicks:** $5/$10/$20/$50/$100 entry; "Flex" pays partial credit if you miss 1–2, "Power" requires all hits. **Polymarket/Kalshi:** any size, fractional pricing, partial fills, limit orders with TTL options (1m/5m/1h/12h/24h/EOD/custom).
- **Retention loop.** PrizePicks runs a free-to-play **"PrizePicks Streak"** game (daily picks, $1M annual prize) specifically as a retention/funnel layer above the cash product. Push-notif heavy when picks settle.
- **Anonymity.** KYC accounts. Real names internally; handles visible only on social leaderboards.
- **Lobby UX.** "Players Board" is a swipeable list of stat lines — feels like Tinder for picks. Polymarket and Kalshi look like a TradingView/exchange UI.
- **Nails:** **PrizePicks Pick'Em "Flex" payout (partial credit)** is brilliant — it converts losing-but-close into a small refund, dampening tilt. We should steal this idea for Brain Bet. **Don't copy:** Real-money + KYC + asynchronous resolution. The async nature in particular is wrong for a wait-room: you want resolution before the user leaves the lounge.

### Skillz (Solitaire Cash, Bingo Cash, Blackout Bingo)

- **Format & length.** **3–5 minute solo skill rounds**, scored by points + time bonus. Two players play the same board asynchronously; highest score wins.
- **Matchmaking speed.** Async — you submit a score, it's matched against another player who plays the same board within a window.
- **Betting / point structure.** Cash entry fees ($0.60 → $60+). Skillz takes ~17% rake. Daily challenges + deposit bonuses are the retention layer. ELO-equivalent skill levels are tracked per game and used to match similar players.
- **Retention loop.** Daily challenges, deposit bonuses, "Bonus Cash" (free play credits with restrictions). Heavy push-notif "tournament starting now."
- **Anonymity.** Real-money KYC; handles visible.
- **Lobby UX.** Tournament list — pick stake tier and click. No live lobby per se.
- **Nails:** **Async same-board matchmaking** — both players play the *exact same starting hand* — solves "no one online to play with you live" perfectly. Brilliant for late-night low-traffic. **Don't copy:** Loss-leader cash psychology and the tournament-tier complexity. Also, async settle means "no one to chat with after," which throws away the lounge social glue.

### Liar's Bar (Steam, 2024–25)

- **Format & length.** 4-player room, two modes: **Liar's Deck** and **Liar's Dice.** A round of Deck takes ~2–4 minutes; a full match (last person standing as people lose lives via Russian roulette) is 5–15 minutes.
- **Matchmaking speed.** Quick match into a 4-player table; private rooms via friend invite. Voice chat is a core mechanic — the bluffing is in the tone.
- **Betting / point structure.** No betting. Risk currency is **lives** — get caught bluffing or false-accuse and you draw the revolver. Two failures and you're out.
- **Retention loop.** Cosmetic unlocks, character skins. New game modes added in patches. No daily reward.
- **Anonymity.** Steam handle, custom avatar.
- **Lobby UX.** 4-seat 3D bar room. "Empty seats" are physically visible (literal empty barstools), which makes "we need 1 more" feel social rather than technical.
- **Nails:** **Bluffing as the entire game loop** + voice atmosphere making 2-min rounds feel high-stakes. Game length sweet spot (2–4 min/round, 5–15 min match) is *exactly* our window. **Don't copy:** Voice required (we're sharing a window with a coding agent — no mic), 4-player minimum (we're 1v1), and the macabre Russian roulette flavor doesn't fit "anonymous lounge while you wait."

### Among Us / Werewolf Online (Wolvesville, werewolv.es)

- **Format & length.** 4–16 players, social-deduction. Among Us match: 5–15 minutes. Werewolf "speed" mode: a few minutes; "long format": 12-hour day/night cycles over multiple days.
- **Matchmaking speed.** Among Us has a filterable lobby browser (March 2025 update). Werewolf has auto-queue + private rooms.
- **Betting / point structure.** None — pure social win/loss.
- **Retention loop.** Cosmetic skins, level-up XP, role unlocks (Werewolf), seasonal events.
- **Anonymity.** Custom username; cosmetic avatars.
- **Lobby UX.** Visible player slots in a room. Among Us specifically lets you walk around the lobby pre-game — turns waiting *into* the experience.
- **Nails:** **Lobby-as-experience** (Among Us pre-game walk-around) — waiting feels like part of the game, not a queue. **Don't copy:** Hidden-info group games need 4+ players; we have 1v1 sessions. Voice/chat is also load-bearing for these games and we can't ask coders to talk.

### NYT Games (Connections, Wordle, Crossword)

- **Format & length.** **One puzzle per day** (per game). Wordle ~2–5 min. Connections ~3–10 min. Async, solo.
- **Matchmaking speed.** None — solo.
- **Betting / point structure.** None. Streak counter is the only stake.
- **Retention loop.** **The streak** — number of consecutive days you've solved. Plus stats (avg guesses, win %), badges, and the "Today's puzzle resets at midnight your time" cadence. Pure ritual.
- **Anonymity.** Optional account; without it, streaks are local-storage only.
- **Lobby UX.** None — open the page, today's puzzle is right there. No friction.
- **Nails:** **Daily streak as the only retention mechanic** is ridiculously sticky and costs them nothing. We should add a Brain Bet daily streak. **Don't copy:** Solo-only; we'd lose the social benefit of the lounge.

### Words With Friends 2

- **Format & length.** Async turn-based, can take days. Single turn = 30 seconds–5 minutes.
- **Matchmaking speed.** Smart Match (skill-based) and Community Match (random). Both pair instantly because async.
- **Betting / point structure.** None. Game scores accumulate.
- **Retention loop.** **Daily Goals (3 personalized challenges/day), achievements, streak counter starting day 3.** Push notif when it's your turn — they own that interruption channel ruthlessly.
- **Anonymity.** Account + handle. Real names common because friend-import.
- **Lobby UX.** "Your games" list — like an inbox of in-progress matches.
- **Nails:** **Daily Goals (3/day, varied)** is a great low-pressure retention pattern — we could borrow this for Brain Bet ("win one Indian Poker round today" + "play one Geo Trivia today" + "place a max bet today"). **Don't copy:** Async play takes days — wrong cadence for our 10-minute ceiling.

### 8 Ball Pool (Miniclip)

- **Format & length.** 1v1 match, 1–4 minutes.
- **Matchmaking speed.** Skill-bracketed, near-instant due to traffic.
- **Betting / point structure.** **Coin ante per match** (e.g., 50, 100, 500, 1K coins, etc., scaling with stake tier). Loser's coins go to winner. Refill: +25 coins per 30 min on web, per 60 min on mobile (≈ matches "free play tier" to 1 game/refill). **This pattern is almost identical to our Brain Bet 100-point ante + daily +100 refill.** Validation that our model has precedent.
- **Retention loop.** Pool Pass (battle pass), Leagues (4-week seasons + 7-day "Flashback" seasons), weekly leaderboards. Heavy progression UI.
- **Anonymity.** Account; handle + customizable cue/avatar.
- **Lobby UX.** Stake tier list (Downtown London, Sydney, Vegas…) — each "venue" is a coin tier. Pick a venue, click play, instant match.
- **Nails:** **Stake-tier "venue" framing** — each tier feels like a place, not a number. Refill cadence calibrated so a frugal player gets 1–2 free games per refill window — same shape as our 100/day. **Don't copy:** Battle pass + leagues are a long-session retention machine — they require multi-hour weekly play to feel "worth it." Wrong for 10-minute waits.

### Discord Activities (Poker Night, Chess in the Park, Checkers)

- **Format & length.** Whatever the game is. Poker session = however long you stay; Chess game = however long the time control.
- **Matchmaking speed.** **None — these are friend-only**, launched inside an existing voice channel.
- **Betting / point structure.** Poker Night uses fake chips, no cash. Chess just uses standard rules.
- **Retention loop.** None at the activity level — Discord retains you, the game is just a hangout tool.
- **Anonymity.** Discord handle (which is increasingly real-name shaped post-2023 username refresh).
- **Lobby UX.** Voice channel = the lobby. The "rocket ship" launcher inside a voice call. Brilliant context — *the people you'd play with are already there.*
- **Nails:** **Co-presence as the lobby** — the friend list of people in voice IS the matchmaking. We don't have voice, but the analog is "users on the same Claude-Code-waiting status are already co-present." **Don't copy:** Friend-only fundamentally; doesn't help anonymous strangers find each other.

### Slither.io / Diep.io (.io browser games)

- **Format & length.** No round timer — you spawn into a persistent server and play until you die. A typical "life" is 30 s – 10 min.
- **Matchmaking speed.** **Instant.** Click play, you're in. No registration, no lobby.
- **Betting / point structure.** None.
- **Retention loop.** Server leaderboard (top 10 visible during play); skin unlocks. Otherwise nothing — you just respawn.
- **Anonymity.** Type a handle in a textbox. No account.
- **Lobby UX.** **No lobby.** Single textbox + play button.
- **Nails:** **Zero-friction entry** (no account, type-handle-and-play). And — crucially — **the persistent-server pattern means there's never an empty lobby**: you spawn into a world that's already running. **Don't copy:** Massively-multiplayer free-for-all doesn't translate to 1v1.

---

## 2. Five-to-seven features most worth borrowing

1. **Pool matchmaking (PokerStars Zoom).** Don't pair players to a "table"; pair them to a *pool*. When their last game finishes, eject them to the pool and the next request matches them with whoever's also looking. We don't have enough traffic for tables that wait — but we can have a single "in pool, looking for next opponent" queue that the matcher resolves continuously. This collapses the empty-room problem.

2. **Bot fill during cold hours (Codingame).** Brain Bet's 7 round types are mostly solo-skill scoreable (Estimation Battle, Big-O Showdown, Chicken Numbers — these don't need a real human to score). At 3 a.m. UTC when no one's online, **a bot should be sitting at the table with a stated honest skill level ("Bot — easy / medium / hard"),** clearly labeled, that disappears the moment a real human queues up. The Codingame quote — "waiting 5 min in the lobby is discouraging" — applies 10× harder for users who have a coding agent waiting.

3. **Solo fallback timed mode (Lichess Puzzle Storm).** When no opponent (and no bot) is appropriate, give the user a **solo Brain Bet sprint**: "How many rounds can you ace in 3 minutes?" against the clock, with a personal-best leaderboard. This is the lowest-friction fallback — no matching, no waiting, instant value, and naturally builds skill at the round types so they're better when a human shows up.

4. **PrizePicks-style Flex payout.** Today our ante is 100 pts paid up-front and settled at end. **Add a "Flex" toggle** at game start: lower max payout in exchange for partial-credit if you win 2/3, 4/6, or 7/10 rounds. This dampens tilt (a close loss returns half ante), invites repeat play, and gives a meaningful "play style" choice without complexity.

5. **Daily streak + 3 daily goals (NYT + Words With Friends).** Today: +100 daily refill. **Add: a streak counter** ("Day 7 of playing Brain Bet") that resets at midnight if you don't play, and **3 simple daily goals** (e.g., "win a round of Indian Poker", "play any Geo Trivia round", "win a max-bet round"). Both costs near nothing to implement, both are proven retention machines for low-attention audiences. Critical that they don't *guilt* the user (no "you've broken your streak" red overlays) — frame as carrots, not sticks.

6. **Stake-tier "venue" framing (8 Ball Pool).** Right now Brain Bet has one ante (100). At Stage 3 we likely want multiple stake tiers (e.g., 25 / 100 / 500). Frame these as **named places** ("The Coffee Shop" / "The Lounge" / "The High Table") rather than numbers — gives flavor for free, makes the choice feel like a vibe choice rather than a risk choice, and creates natural skill self-segregation without an explicit ELO system.

7. **Reverse-mode-style "different skill" round (Codingame Reverse).** Brain Bet's 7 round types are all forward-prediction games. Steal Codingame's Reverse trick: a round type where **users see only the output and must reverse-engineer the input or rule.** E.g., "I picked a number 1–100; you've heard 'too high' and 'too low' on guesses 47 and 62 — what's the smallest range it must be in?" Forces a different mental gear, breaks routine, plays to programmer brain.

---

## 3. Three patterns NOT to copy

1. **Loot-box / cosmetic-grind progression (Skillz, 8 Ball Pool, Wolvesville).** Battle passes, weekly seasons, cosmetic unlocks tied to grinding hours-per-week. These work because mobile-game users have unlimited attention budget; our users have **5 minutes between Claude Code interruptions.** Any system that requires sustained sessions to "feel worth it" actively repels our audience. Daily refill + streak is the right size; battle pass is not.

2. **Visible global ELO / ranked ladder (Codeforces Duel, HackerRank BattleCode, Clash Royale ladder).** Programmers especially are sensitive to public skill numbers — Clash Royale specifically introduced "Path of Legends" because the ladder was generating "ladder anxiety" so bad players were avoiding play. Our users are coding *right now*, often frustrated, with limited cognitive budget. A visible rating that goes down when they lose makes them not want to risk a session at all. **Per-game best scores (Lichess Storm style) and named tiers are fine; visible global Elo is not.**

3. **Real-money or async-resolution betting (PokerStars cash, PrizePicks, Polymarket, Kalshi, all Skillz cash games).** Two reasons: (a) anonymous + cash = KYC + regulatory + payment infra, none of which fit our scope. (b) **Async resolution** (PrizePicks settles when the basketball game ends; Polymarket settles when the election ends) is fundamentally wrong for a wait-room. The user's session ends in 5 minutes when their Claude agent pings; they need *closure on this round before they leave the lounge.* Anything that resolves later is a notification we can't deliver and a payout we can't celebrate.

---

## 4. The 1–2 platforms most analogous (engineer should study these in depth)

### A. **Codingame Clash of Code** — strongest analog overall

Same audience (developers). Same game-shape (short skill-puzzle rounds). Same monetization shape (free, no real money). Same anonymity-friendly handle pattern. Same "what do we do during low traffic" problem. Specific things to study:

- **Bot-padding implementation.** They auto-fill the lobby with bots up to 4 players, and bots gracefully step out as humans arrive. The exact UX of "you're matched with bot-x" — is it labeled? Is the difficulty calibrated? How do they decide to insert a bot vs. wait? See the Codingame blog post and the python wrapper at `codingame.readthedocs.io` for hints at the API surface.
- **Reverse mode.** Read the round structure for Reverse — only input/output examples, no spec. This is a different cognitive mode and makes ~33% of clashes feel completely different. Look at how the UI hides the spec and how partial test passes are surfaced.
- **5-min-max enforcement.** They hard-cap at 15 min; you need to study how they handle "user submitted something but timer ran out" gracefully.
- **What they got wrong.** They have no daily ritual, no streak, no notif-back hook. We need that *and* the Clash structure.

URLs: https://www.codingame.com/multiplayer/clashofcode , https://www.codingame.com/blog/clash-of-code-time-has-come-for-clash/ , https://codingame.readthedocs.io/en/stable/api.html

### B. **Lichess Puzzle Storm + Bullet** — strongest analog for "anonymous, instant, low-friction"

Same constraint (anonymous-or-account fluid identity). Same expectation (sub-3-minute experience). Same engineering ethos (free, no ads, minimal moderation overhead). Specific things to study:

- **The "Quick pairing" tile UI.** It's the cleanest matchmaking UX on the web. Each tile shows "X players online" so the user has accurate expectations *before* clicking. Steal this exact pattern for our "find opponent" flow — show how many people are currently in pool for each round-type / stake-tier.
- **Puzzle Storm as the always-available solo fallback.** When you can't find a bullet game, Storm is right there. We need a solo Brain Bet sprint mode for the same reason.
- **Anonymous play just works.** Anonymous bullet isn't gated, just less rated. Confirms our zero-friction-entry stance is correct.
- **What they got wrong (for us).** No streak, no daily ritual, no leaderboard. Their reasoning is moderation overhead — we're at lower scale and can either accept that risk or ship a private "your best score this week" view that doesn't expose to global cheating incentives.

URLs: https://lichess.org/storm , https://lichess.org/page/storm , https://en.wikipedia.org/wiki/Lichess

---

## Sources

- Codingame Clash of Code: https://www.codingame.com/multiplayer/clashofcode , https://www.codingame.com/blog/clash-of-code-time-has-come-for-clash/ , https://codingame.readthedocs.io/en/stable/api.html , https://medium.com/bacic/clash-of-code-game-review-31b092feb8f2
- Lichess Puzzle Storm: https://lichess.org/storm , https://lichess.org/page/storm , https://lichess.fandom.com/wiki/Puzzle_Storm
- PokerStars Zoom: https://www.pokerstars.bet/poker/zoom/ , https://pokerindustrypro.com/news/article/211471-pokerstars-trials-antes-micro-stakes-zoom-cash-game-tables , https://www.blackrain79.com/2015/07/zoom-poker-strategy-essential-guide.html
- PrizePicks / Polymarket / Kalshi: https://en.wikipedia.org/wiki/PrizePicks , https://www.prizepicks.com/streak , https://docs.polymarket.com/polymarket-learn/trading/limit-orders , https://kalshi.com/
- Skillz / Solitaire Cash / Bingo Cash: https://games.skillz.com/ , https://support.solitairecash.com/hc/en-us/articles/360017046838 , https://games.skillz.com/games/bingo/bingo-cash-14023
- Liar's Bar: https://store.steampowered.com/app/3097560/Liars_Bar/ , https://www.thegamer.com/liars-bar-how-to-play-liars-deck/
- Among Us / Werewolf Online: https://en.wikipedia.org/wiki/Among_Us , https://www.innersloth.com/a-match-made-in-update-16-0-0-emergency-meeting-40/ , https://werewolv.es/ , https://app.wolvesville.com/
- Slither.io / Diep.io: https://slither.io/ , https://en.wikipedia.org/wiki/Slither.io
- Discord Activities: https://support-apps.discord.com/hc/en-us/articles/26502258215703-Poker-Night-FAQ , https://support-apps.discord.com/hc/en-us/articles/26502048134551-Discord-Chess-in-the-Park-FAQ
- 8 Ball Pool: https://www.miniclip.com/minigames/8ballpool , https://support.miniclip.com/hc/en-us/articles/360036840073 , https://support.miniclip.com/hc/en-us/articles/4410782445201
- NYT Games / Connections / Wordle: https://www.nytimes.com/games , https://play.google.com/store/apps/details?id=com.nytimes.crossword
- Words With Friends: https://www.zynga.com/games/words-with-friends/ , https://zyngasupport.helpshift.com/hc/en/63-words-with-friends-2/faq/12836-how-do-i-play-streaks/
- HackerRank / 1v1 coding platforms: https://www.hackerrank.com/battlecode-1v1-r1-1 , https://codearena.co , https://cf-1v1.vercel.app/
- Clash Royale ladder anxiety: https://ape-con.com/clash-royale-ranks-explained-the-complete-2026-guide-to-climbing-the-ladder/
