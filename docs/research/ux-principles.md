# Waiting Lounge — UX & Web Design Principles (Stage 3)

Research lead: UX/Web Design. Audience: market-research, game-design, and engineer agents, plus the non-engineer collaborator.

The user's complaint is the right one: the site looks like a brochure, not a place. The current homepage is 90% words and 10% three feature cards; the lounge is a list with no signs of life; the leaderboard is unreachable from the nav. This document fixes that.

---

## 0. Ground truth — what we have today

Pulled from the codebase, not memory:

- `web/tailwind.config.ts`: palette `bg #FAF7F2`, `surface #FFFFFF`, `ink #2A2926`, `muted #7A756D`, `line #E8E2D7`, `sage` (DEFAULT/soft/deep), `amber` (DEFAULT/soft). Geist Sans + Geist Mono. `rounded-2xl = 1rem`. Soft shadow.
- `web/src/app/page.tsx`: H1 + two-line subtitle + two CTAs ("Join demo lounge", "Install Claude Code hook"). Three feature cards. PrivacyPromise card. ~120 words above the fold on a desktop monitor.
- `web/src/components/HeaderNav.tsx`: 4 links — `Join`, `Board`, `About` (+ logo). LiveAgentStatusBadge and BalanceChip occupy the right side. **No leaderboard link.**
- `web/src/app/lounge/page.tsx`: heading + subtitle, error/declined toasts, a list of idle users with "Challenge" buttons. Empty state: "No one else is idle right now. Tell a friend to /login and refresh." That is the entirety of the page.
- `web/src/app/leaderboard/page.tsx`: handsome but orphaned. Top-20 rows, "you" highlight in sage-soft. Existed since Phase 7-ish but the user has never seen it.
- `web/src/app/board/page.tsx`: the most-finished surface — message-board form, filter chips, post list. Has a floating amber FAB that triggers the "Claude needs you" demo overlay. Already feels closer to a product than the homepage does.
- `web/src/app/join/page.tsx`: tag, mood, mode, optional game settings — clean but heavy on form chrome and short on energy.

The visual language is good. The problem isn't taste, it's surface area: the warm-cream/sage system is being applied to documents instead of to a place.

---

## 1. Cross-platform research

### 1.1 Engagement-first homepage for low-attention contexts

**Lichess (`lichess.org`).** The marketing copy is one line ("a free, libre, no-ads, open source chess server"). Above the fold you get: "Create lobby game / Challenge a friend / Play against computer" buttons, plus an active-tournament list with **player counts attached** ("Rapid Shield Arena · 4,097 players", "Hourly SuperBlitz Arena · 258 players · Playing now"), plus a featured live game streaming on the right. The whole point of the homepage is "do the thing now," and "the thing" is visibly busy. You don't have to be told it's alive; you can count.

**Discord (`discord.com`).** Two CTAs: "Download for Windows", "Open Discord in your browser." The browser CTA is the clever bit — anonymous trial in one click, no account. Hero is illustration of mascots, not a screenshot of the product. Microcopy: "or idk doing homework or something" — that's the warmth-without-saccharine register.

**GitHub (`github.com`).** Animated Copilot-in-action demo as the hero, not a still. Headline + supporting tagline + email signup field + a "Try GitHub Copilot" CTA. Above the fold = headline, hero animation, two CTAs, and a workflow strip ("Plan / Code / Collaborate / Automate / Secure"). Almost no body copy.

**Codingame (`codingame.com`).** "Play coding games. Have fun. Build skills." + "3 million+ developers love CodinGame. 100% free." + "Start playing." That's the entire above-the-fold marketing surface. Below it is a strip of supported languages as icon tiles, no live activity.

**Linear (`linear.app`).** ~25–40 words of body copy total above the fold. Avatars (real-looking team members) instead of abstract icons. Action-oriented imperatives: "Get started", "Open app". Confident, dry tone. "A new species of product tool" — no exclamation points anywhere on the page.

**Vercel (`vercel.com`).** Headline + concise sub + "Start Deploying" / "Get a Demo." Hero is an animated "Runway" illustration with embedded performance metrics (build time 7m → 40s, 95% load reduction). Code snippets in monospace below the fold.

**Lessons for us.**
- Above-the-fold copy budget for a product like ours: **20–35 words**, not 60+. Our current "Your coding agent is working. You do not have to stare at the terminal." (16 words) is fine; the subhead doubles it; the privacy disclaimer triples it.
- The hero should **show the product**, not describe it. Closest comp is GitHub's animated Copilot demo and Vercel's Runway illustration. For us: a live mini-lounge widget — actual current player count, last 3 message-board posts, scrolling "GameX vs GameY → +50pts" ticker. Even when the count is 0, "0 players online · be the first today" is more honest and more interesting than three abstract feature cards.
- Two CTAs max above the fold. "Join lounge" (primary, sage-deep) and "Install hook" (secondary). That's correct on the current page; the issue is everything around it.

### 1.2 Lobby / "feels alive" design

**Lichess lobby (`lichess.org/lobby`).** The page has four density layers visible simultaneously:
1. Quick-pairing buttons grouped by time control (1+0, 2+1, 3+0, 5+0, 10+0, …) with a real-time count under each (e.g., "Lobby" tab counts seeks).
2. A live seek-list table — player handle, rating, time control, mode, "Join" — that updates without reload as people post and pair.
3. A "Tournaments" panel and "Simul" panel below, each with player counts.
4. A featured live game on the right — actual board, actual moves animating, with player names and ratings.

When the lobby is quiet, the live featured game still moves. There is **always one piece of motion on screen.** That single design decision is why Lichess feels alive at 3am with 200 people online and at 7pm with 50,000.

**Chess.com `/play/online`.** Live thumbnails of in-progress games on the home, "Top players online" sidebar with ratings, "Daily puzzle" countdown to next, "Lessons" featured. Always something with a number on it.

**Poker rooms in general.** From the Behance and Dribbble UI surveys: the lobby is built around a **real-time table list** with `stakes / players (3/9) / status (waiting | in-hand)` columns, sorted/filtered by stakes and format. The number of seats filled is the most prominent visual signal.

**PokerNow (`pokernow.com`).** Different model — no public lobby, you generate a private link. The CTA is "Start a New Game" / "Find a Game/Club", and the explicit promise is "no download, no catch." This is the model closest to our actual mechanic (we want pairs of agent-waiters), and the friction it removes is exactly the friction the user is complaining about.

**Lessons for us.**
- Our lounge currently shows a list of idle users and nothing else. Even a 5-person lounge feels dead because there is no proxy for activity. We need at minimum:
  - A live counter at top: "**4 in lounge · 12 today · 1 game in progress**" (pull from existing Socket.IO presence + leaderboard API + game state).
  - A "recent activity" ticker — "blue-cursor-241 beat green-pixel-009 at Brain Bet · 2m ago", "3 new posts on the Board · 6m ago." Tail of last 5 events. Even at 0 concurrent players, a 24-hour history fills it.
  - An always-on featured cell — leaderboard top-3 preview card OR a sample Brain Bet question rendering ("Try one — 30 seconds"). This is our equivalent of Lichess's right-rail live game.
- Bot opponents are a controversial call. Recommend: don't fake humans. Do offer a "Practice round vs Lounge AI" entry point that is honestly labelled. It fills the empty-lounge case without breaking the trust contract.

### 1.3 Daily-ritual mechanics

**Wordle.** One puzzle per day. You can't binge. The streak counter is the carrot, the share-grid is the social proof. Constraint + consistency = ritual ([Bootcamp's UX breakdown](https://medium.com/design-bootcamp/why-wordle-works-a-ux-breakdown-485b1dbba30b); [UX Magazine on the psychology](https://uxmag.com/articles/the-fascinating-psychology-tricks-that-make-wordle-so-addictive)). The takeaway: **daily ritual mechanics work because they limit themselves**, not because they push.

**Duolingo.** Flame icon, integer streak, prominent in nav. Streak shielded behind premium recovery. Strong loss-aversion design ([Duolingo's site couldn't be fetched cleanly but their flame-streak treatment is well-documented]).

**Apple Fitness rings, Pokémon GO daily bonus.** Same family — small, consistent, daily. Cumulative reward, daily reset.

**Lessons for us.** Our app already has the perfect daily-ritual ingredient: people open it whenever Claude is working. We're getting the visit for free. We just need a tiny return-tomorrow hook. Recommend:
- **Daily Brain Bet** — one curated puzzle per UTC day, three rounds. Score persists into the leaderboard. "You've done today's. New one in 14h 22m." This is the smallest possible Wordle-shape thing, and it stacks directly on the existing Brain Bet mechanic.
- **Lounge streak** — a flame icon next to the BalanceChip in the header. Visits on consecutive UTC days = streak. No premium restoration needed for MVP. Quietly encourages return.

### 1.4 Anonymous social UX — "you can do this without committing"

**itch.io.** Login lives in the top-right corner at modest size. Browse, wishlist, collection — all available pre-login. Tone is anti-corporate, dry, sometimes irreverent. Game cards have everything (thumbnail, title, price, 2–3 tags) and nothing more. The **"explore first, sign up only when you have to"** affordance is consistent everywhere.

**Discord browser preview.** The "Open in browser" path is the canonical low-friction trial; the discord.dog third-party preview tool exists because Discord itself doesn't let you peek into a server without an account, and people clearly want that ([Discord support thread requesting it](https://support.discord.com/hc/en-us/community/posts/4416966517911-A-no-login-required-preview-option-for-servers)).

**4chan, Reddit logged-out.** Read everything, post nothing, no aggressive sign-up modal. The nag bar at the bottom is small and dismissible. Reddit's modern logged-out site (we couldn't fetch it cleanly, but the pattern is well-known) gates only the action of voting/posting, not browsing.

**Lessons for us.** We're already anonymous-by-design — that's the privacy invariant. We should **lean into it visibly.** Recommend:
- The "Join lounge" CTA on the homepage shouldn't trigger a sign-in wall. Today, /lounge gates on `session`. For the *demo* lounge, allow read-only browse: see the live count, see recent activity, see the leaderboard preview, even see (greyed) idle users with "Sign in to challenge." That's the itch.io move.
- Sign-in is required to *play* (we ante real points), not to *look*. Distinguish those.
- No modal that says "Sign in to continue" — modals mean "we want something from you." Inline gates with explanation are warmer.

### 1.5 Density and visual hierarchy for brief-use tools

**Linear.** Heavy whitespace, single accent color, avatars do the work that icons would otherwise. Three-tier nav. No dropdowns from the top bar that fan out to 30 links. Action verbs, not noun-y nav items.

**Notion homepage.** Dense screenshot-collage hero that demonstrates the product visually before any copy.

**Vercel dashboard (logged in).** Card grid for projects. Each card has only: name, latest deploy status (color dot), commit SHA, age. That's it. Density without clutter is achieved by **picking 3–4 fields and discarding the rest.**

**Stripe Checkout.** One screen, one decision. No nav, no distractions.

**Lessons for us.**
- Cards are the right primitive (we already use `.card`). The current cards just describe *features*; they should display *state*. Replace the three "Tag-based matching / Message board fallback / Browser alert" feature cards with three **status cards**:
  - "Lounge — 4 active · 1 game in progress" → links to /lounge
  - "Board — 12 posts in last hour" → links to /board
  - "Leaderboard — top: blue-cursor-241 · 1,420 pts" → links to /leaderboard
- Each card is a snapshot of the live system. The page becomes a status console for an existing place, not a brochure for an idea.

### 1.6 Microcopy — warmth without saccharine

**Stripe.** "150K+ users have their best day ever." Specificity beats emotion. Numbers, not adjectives. Active verbs, no exclamation.

**Linear.** "Issue tracking is dead." Confident, slightly arch, never cute.

**Mailchimp's old voice.** Conversational, slightly lopsided, never breathless. CTA "Send Campaign" — frames the gravity of the action by naming the thing. ([Mailchimp's microcopy guide](https://mailchimp.com/resources/microcopy/).)

**Lessons for us. Our current copy is mostly fine.** "Your coding agent is working. You do not have to stare at the terminal." is in the Linear register: confident, dry, no exclamation. The privacy promise is in the Stripe register: specific list of what's never sent, no emotional framing. Don't break this. Where to tighten:
- Empty states are too apologetic. "No one else is idle right now. Tell a friend to /login and refresh." → "Quiet right now. Post on the board, or wait — lounge usually picks up between 2–5pm Pacific." (Specificity → trust.)
- "Continue" on /join is generic. Use the actual destination: "Open the lounge", "Post to the board".
- "Install Claude Code hook" is a chore. → "Wire up your Claude Code" or just "Set up the hook."

---

## 2. Concrete recommendations for Waiting Lounge

### 2.1 Homepage

**Goal:** turn the homepage from a brochure into the front desk of a place that is open right now.

```
+--------------------------------------------------------------------+
|  ◖ waiting-lounge          [agent: idle]   ⚑  ⊳ leaderboard  ⚙    |
+--------------------------------------------------------------------+
|                                                                    |
|   Your coding agent is working.                                    |
|   You do not have to stare at the terminal.                        |
|                                                                    |
|   [ Join the lounge → ]   Set up the hook                          |
|                                                                    |
|   ── 4 in the lounge · 1 game in progress · 12 posts today ──      |
|                                                                    |
+--------------------------------------------------------------------+
|                          |                          |              |
|  LOUNGE                  |  BOARD                   |  LEADERBOARD |
|  4 active · 1 in game    |  12 posts in last hour   |  Top 3       |
|  > brown-cursor-019      |  > "anyone else stuck    |  1. blue-241 |
|  > sage-pixel-220        |    on next.config?"  4m  |     1,420 pts|
|  > teal-glyph-088        |  > "tea break ☕"      6m |  2. amber-…  |
|  > rust-token-471        |  > "agent says 'merge    |     1,180 pts|
|                          |    conflict'"        9m  |  3. lime-…   |
|  → enter →               |  → open board →          |     1,025 pts|
+--------------------------------------------------------------------+
|                                                                    |
|  Daily Brain Bet — 3 rounds · resets in 14h 22m       [Try it →]   |
|                                                                    |
+--------------------------------------------------------------------+
|  Privacy: no code, no prompts, no repo paths, no transcripts.      |
|  Just status. [What we receive →]                                  |
+--------------------------------------------------------------------+
```

Notes on the wireframe:
- The pretty 16-word headline stays. Subhead with body copy is **cut entirely** above the fold. The presence of live numbers under the CTAs replaces the explanatory paragraph: it shows the product instead of describing it.
- Three live status cards replace the three abstract feature cards. Each card pulls real data from the existing backend (active sockets, recent board posts, top-3 leaderboard). Empty states are honest: "0 active · be the first today" beats "Tag-based matching."
- The Daily Brain Bet strip is the daily-ritual hook. Wordle-shape: one curated puzzle per UTC day, countdown timer to next reset.
- PrivacyPromise compressed to a one-line footer with a link to the full page. It's load-bearing for trust but does not need to take up half the homepage.

### 2.2 Lounge — making it feel alive at 0 idle players

Current state: `/lounge/page.tsx` shows error toast → pending invite → idle-user list → empty-state text. Nothing else.

Add, in order of priority:

1. **Live counter row** at the top, replacing the current subtitle. Format: "4 in lounge · 1 game in progress · 12 today." Pull from Socket.IO presence + a backend `/api/lounge/stats` endpoint (engineer to scope).
2. **Recent-activity ticker** — last 5 events: game results, board posts, new arrivals. One line each, monospace handle in ink, action in muted, age in muted-italic. Auto-scrolls or fades the oldest. This replaces the "tell a friend to /login" empty-state when nothing is happening *now* but things happened *recently*.
3. **Leaderboard preview card** in the right rail (or below the user list on mobile). Top 3 + "your rank" if signed in. Click → /leaderboard.
4. **Practice round CTA** when the idle-user list is empty. "Nobody to challenge yet — try a solo round." Honestly labelled, links to a Brain Bet practice mode (no ante, no leaderboard impact). Recommend the engineer scope this as a thin wrapper around the existing Brain Bet round component.
5. **Don't fake humans with bots.** The Lichess move is to keep the *featured live game* always running because real games are always running somewhere. We don't have that volume yet. The honest substitute is the recent-activity ticker drawn from a 24-hour window — at 1 game/day this still gives motion.

### 2.3 Header nav — surfacing /leaderboard

Current: 4 link slots — `Join`, `Board`, `About` (settings) — plus logo, status badge, balance chip.

Recommended (5 links cleanly):

```
◖ waiting-lounge   [agent badge]  [⚑ 1,180]   Lounge · Board · Leaderboard · Daily · About
```

Specifics:
- Replace `Join` with `Lounge` (Join is a verb, Lounge is the place — easier to scan, matches Lichess/Discord naming convention).
- Add `Leaderboard` as the third link. It's a noun, sits next to other nouns, no clutter cost.
- Add `Daily` as the fourth link, pointing to the Daily Brain Bet. Sits between Board and Leaderboard naturally.
- `About` stays as the rightmost — its job is "what is this," and that's settled-state work.
- BalanceChip combines with a flame-icon streak count: `⚑ 1,180` reads as "your streak/score." If streak is implemented, render flame separately: `🔥3 · ⚑ 1,180`. (Lucide `flame` icon, not emoji.)
- LiveAgentStatusBadge stays where it is.

If a fifth link ever feels crowded on mobile: collapse `About` into a `⋯` overflow menu first; never collapse Leaderboard or Daily, since those are the engagement hooks.

### 2.4 Empty-state copy

| Surface | Current | Recommended |
|---|---|---|
| Lounge, 0 idle | "No one else is idle right now. Tell a friend to /login and refresh." | "Nobody else waiting right now. Try a solo Brain Bet, post on the board, or just chill — lounge usually picks up when Pacific evenings hit." |
| Lounge, recent activity but 0 idle now | (n/a) | "Quiet right now. 3 games today — last one ended 14m ago. Post on the board, or stick around." |
| Brain Bet, never played | (existing flow lands you mid-round) | "First time? Brain Bet is 3 quick coding puzzles vs another waiter. 60 seconds each. Ante 50 pts — winner takes the pot." |
| Leaderboard, empty | "No one is on the board yet. Sign in and play a game to be the first." | (Keep — this one is good already.) |
| Board, 0 posts in tag | "No posts yet for {tag}. Be the first." | (Keep — also good.) |
| Board, network error | "Server returned 502" | "Couldn't reach the board. Will retry in a bit. ([Status](#))" |
| Lounge, signed-out | "Sign in to see who's online and challenge them to a game." | "Anyone can browse the lounge. Sign in when you want to challenge someone — that's how points work." |

The two changes that matter most:
- **Stop apologizing.** "No one else is idle right now" reads as broken. "Quiet right now" reads as a Tuesday afternoon.
- **Always give an alternative action.** Empty state without an action is dead end; with an action it's an opportunity.

### 2.5 Iconography

**Recommendation: Lucide React.** ISC-licensed, ~1,700 icons, 2px stroke default, geometric, pairs naturally with Geist Sans. Heroicons (1.5px outline, MIT) is also fine and the pairing is canonical for Tailwind teams, but Lucide has a wider catalog (we'll need `dice-5`, `flame`, `swords`, `coffee` — all of which Lucide has and Heroicons doesn't).

Set the icons we'll actually use, organized by surface:

| Use | Lucide name | Notes |
|---|---|---|
| Logo glyph (replace ◖) | `coffee` | Cream + sage + a coffee cup is the lounge metaphor. Keep monospace `waiting-lounge` wordmark next to it. |
| Header: agent waiting | `loader-2` (animated) | Already conveyed by LiveAgentStatusBadge — formalize the icon. |
| Header: agent needs you | `bell` | Amber. Pulse animation. |
| Header: agent done | `check` | Muted. |
| Header: streak | `flame` | Sage when active, muted when 0. |
| Header: balance | `coins` or `gem` | Currency association without being literal money. |
| Lounge live count | `users` | Next to "4 in lounge". |
| Lounge in-game | `swords` | Next to "1 game in progress". |
| Recent activity feed | `activity` | Pulse-line section header. |
| Brain Bet | `brain` | Self-explanatory. |
| Spot the Bug | `bug` | Self-explanatory. |
| Daily | `calendar-clock` | Communicates "ritual" + "countdown". |
| Leaderboard | `trophy` | Sage for top, muted for the rest of the list. |
| Board | `clipboard` or `notebook-pen` | The latter feels lounge-ier. |
| Privacy | `shield-check` | Reinforces the trust promise visually. |
| Empty state illustrations | `inbox`, `coffee`, `moon` | Stroke at 32–40px in muted, centered above the empty-state text. |

**Stroke and size conventions:**
- Default 16px in nav and inline text, paired one-to-one with the muted text color of that row.
- 20px for card headers.
- 32–40px for empty-state hero glyphs.
- All at 2px stroke (Lucide default) — matches Geist's medium weight.

**Don't use emoji** for these. Emoji rendering is OS-dependent and the warm-cream/sage system breaks the moment a yellow Apple smiley appears in it.

### 2.6 Anti-patterns to avoid

1. **No spinning carousel hero.** The current design is calm; a rotating hero is the opposite of calm. If we want motion, animate one element (a counter, a ticker, the agent badge dot) — never a slideshow that demands attention.
2. **No sign-up modal on first visit.** The privacy invariant *is* the marketing — interrupting a user with "Sign in to continue" within 5 seconds of landing breaks the trust contract before it forms. Browse-first, sign-in-when-acting. Reddit-style nag bar at most, dismissible.
3. **No fake "243 people are typing right now" social proof.** We will be tempted, especially at 0 concurrent users. Don't. The privacy invariant means we can't even fake gracefully — we'd have to invent fake handles and fake activities, and the moment a real user sees the same fake handle twice the credibility tax is enormous. Honest counts (including 0) plus a 24-hour ticker plus a Daily Brain Bet plus a leaderboard with real history beats fake liveness every time.

(Bonus 4 if we want one more.) **No glass-morphism / neon-gradient / 'startup chrome'.** The cream + sage + Geist system is already differentiated from every dashboard SaaS landing page on the internet. Don't dilute it by adding the things every dashboard SaaS landing page has.

---

## 3. Reference sites to mimic visually

If the engineer agent or design follow-up wants two pinned references:

1. **[Lichess.org](https://lichess.org)** — for "always one thing in motion," for honest player counts everywhere, for confident tone, for the right-rail featured-game pattern. Adapt the visual layout to our cream/sage palette. Lichess is also pleasingly dense without being cluttered, which is exactly the gap our current homepage has.
2. **[Linear.app](https://linear.app)** — for typography, whitespace, copy register, and avatar-as-icon. Linear's "Issue tracking is dead" energy is the upper bound of confidence we should aim for in our headline. Linear is cooler-toned than us — we keep cream — but the *density* and *tone* should converge.

Tertiary: **[Itch.io](https://itch.io)** for the "browse without commitment" ethos, **[PokerNow](https://www.pokernow.com)** for the "one share-link, no account, just play" frictionlessness — closest comp to our actual mechanic.

---

## 4. Things I'm leaving open for game-design and engineer agents

- **Bot opponent yes/no.** I lean no for human-pretending bots, yes for an honestly-labelled solo Brain Bet practice mode. Game-design agent should own this call.
- **Daily Brain Bet scoring weight.** Should daily count toward main leaderboard? Same ante? Free? Game-design agent should scope.
- **Live counter and ticker backend cost.** I've assumed Socket.IO presence + a `/api/lounge/stats` rollup endpoint. Engineer agent to verify this is cheap on Render free tier.
- **Streak storage.** Per-user `last_visit_utc_date` and `streak_count` columns. Engineer agent owns schema impact.
- **Mobile layout.** The wireframe above is desktop. The three status cards stack on mobile. Daily Brain Bet strip becomes a card. Header collapses to logo + balance + hamburger; nav links go behind the burger. Standard responsive — flag if there's a problem.

---

## 5. Cited sources

- Lichess — [`lichess.org`](https://lichess.org), [`lichess.org/lobby`](https://lichess.org/lobby) (live counts, seek list, featured game)
- Discord — [`discord.com`](https://discord.com) (no-account browser CTA, mascot hero)
- GitHub — [`github.com`](https://github.com) (animated Copilot demo as hero)
- Linear — [`linear.app`](https://linear.app) (typography, copy register)
- Vercel — [`vercel.com`](https://vercel.com) (Runway hero, hierarchical nav)
- Stripe — [`stripe.com`](https://stripe.com) (specificity microcopy)
- Codingame — [`codingame.com`](https://www.codingame.com) (developer-game framing)
- itch.io — [`itch.io`](https://itch.io) (anonymous browse, anti-saccharine voice)
- PokerNow — [`pokernow.com`](https://www.pokernow.com) (no-account share-link model)
- Lucide — [`lucide.dev`](https://lucide.dev) (recommended icon set, ISC)
- Heroicons — [`heroicons.com`](https://heroicons.com) (fallback icon set, MIT)
- Wordle UX analyses — [Bootcamp](https://medium.com/design-bootcamp/why-wordle-works-a-ux-breakdown-485b1dbba30b), [UX Magazine](https://uxmag.com/articles/the-fascinating-psychology-tricks-that-make-wordle-so-addictive)
- Mailchimp microcopy — [Mailchimp resources](https://mailchimp.com/resources/microcopy/)
- Discord no-account preview discussion — [Discord support thread](https://support.discord.com/hc/en-us/community/posts/4416966517911-A-no-login-required-preview-option-for-servers)
- Empty-state design patterns — [Eleken](https://www.eleken.co/blog-posts/empty-state-ux), [LogRocket](https://blog.logrocket.com/ux-design/empty-states-ux-examples/)
