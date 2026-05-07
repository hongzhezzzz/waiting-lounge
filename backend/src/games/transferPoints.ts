// Atomic point operations. All mutations of users.points go through here.
import { getPool } from "../db/index.js";
import { v4 as uuid } from "uuid";

export type AnteResult = {
  gameRoundId: string;
  pendingRefundIds: string[];
};

// Deduct ante from both players atomically; create the game_rounds row;
// also write a pending_refund row per player (cleared on settle, processed
// on cold-start if still unresolved). Throws if either player is short.
export async function chargeAntes(args: {
  gameType: string;
  roundSubtype?: string | null;
  durationMin: number;
  ante: number;
  playerAId: string;
  playerBId: string;
}): Promise<AnteResult> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const ordered = [args.playerAId, args.playerBId].sort();
    const lock = await client.query<{ id: string; points: number }>(
      `select id, points from users where id = any($1) order by id for update`,
      [ordered],
    );
    if (lock.rows.length !== 2) throw new Error("Player(s) not found");
    for (const row of lock.rows) {
      if (row.points < args.ante) {
        throw new Error(`User ${row.id} has insufficient points (${row.points} < ${args.ante})`);
      }
    }

    const gameRound = await client.query<{ id: string }>(
      `insert into game_rounds (game_type, round_subtype, duration_min, ante, player_a_id, player_b_id, outcome)
       values ($1, $2, $3, $4, $5, $6, 'in_progress')
       returning id`,
      [args.gameType, args.roundSubtype ?? null, args.durationMin, args.ante, args.playerAId, args.playerBId],
    );
    const gameRoundId = gameRound.rows[0].id;

    await client.query(
      `update users set points = points - $1 where id = $2`,
      [args.ante, args.playerAId],
    );
    await client.query(
      `update users set points = points - $1 where id = $2`,
      [args.ante, args.playerBId],
    );
    await client.query(
      `insert into point_transactions (user_id, delta, reason, game_round_id) values ($1, $2, 'ante', $3), ($4, $5, 'ante', $6)`,
      [args.playerAId, -args.ante, gameRoundId, args.playerBId, -args.ante, gameRoundId],
    );

    const pa = await client.query<{ id: string }>(
      `insert into pending_refunds (user_id, amount, reason, game_round_id) values ($1, $2, 'ante', $3) returning id`,
      [args.playerAId, args.ante, gameRoundId],
    );
    const pb = await client.query<{ id: string }>(
      `insert into pending_refunds (user_id, amount, reason, game_round_id) values ($1, $2, 'ante', $3) returning id`,
      [args.playerBId, args.ante, gameRoundId],
    );

    await client.query("commit");

    return {
      gameRoundId,
      pendingRefundIds: [pa.rows[0].id, pb.rows[0].id],
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export type SettleResult = {
  outcome: "win" | "tie";
  winnerId: string | null;
  loserId: string | null;
  payout: number;       // points moved on win (= 2 * ante)
  newBalances: Record<string, number>; // userId -> new balance
};

// Settle a game atomically. Cancels the pending_refunds for both players.
// On win: full pot goes to winnerId. On tie: each player keeps their ante
// (we add ante back to each — net zero — so the user-visible balance is
// unchanged from pre-game).
export async function settleGame(args: {
  gameRoundId: string;
  ante: number;
  playerAId: string;
  playerBId: string;
  winnerId: string | null;  // null means tie
  pendingRefundIds: string[];
}): Promise<SettleResult> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    // Cancel the pending refunds (mark processed) so cold-start refund won't double-pay.
    if (args.pendingRefundIds.length > 0) {
      await client.query(
        `update pending_refunds set processed_at = now() where id = any($1) and processed_at is null`,
        [args.pendingRefundIds],
      );
    }

    const newBalances: Record<string, number> = {};

    if (args.winnerId === null) {
      // Tie — refund both antes.
      const ordered = [args.playerAId, args.playerBId].sort();
      const upd = await client.query<{ id: string; points: number }>(
        `update users set points = points + $1 where id = any($2) returning id, points`,
        [args.ante, ordered],
      );
      for (const row of upd.rows) newBalances[row.id] = row.points;

      await client.query(
        `insert into point_transactions (user_id, delta, reason, game_round_id)
         values ($1, $2, 'tie_refund', $3), ($4, $5, 'tie_refund', $6)`,
        [args.playerAId, args.ante, args.gameRoundId, args.playerBId, args.ante, args.gameRoundId],
      );
      await client.query(
        `update game_rounds set winner_id = null, outcome = 'tie', ended_at = now() where id = $1`,
        [args.gameRoundId],
      );

      await client.query("commit");
      return {
        outcome: "tie",
        winnerId: null,
        loserId: null,
        payout: 0,
        newBalances,
      };
    }

    // Win — winner takes 2x ante (their own back + opponent's). Loser already
    // had their ante deducted at game start, so we just credit the winner.
    const loserId = args.winnerId === args.playerAId ? args.playerBId : args.playerAId;
    const upd = await client.query<{ id: string; points: number }>(
      `update users set points = points + $1 where id = $2 returning id, points`,
      [args.ante * 2, args.winnerId],
    );
    for (const row of upd.rows) newBalances[row.id] = row.points;

    // Loser's balance unchanged from post-ante state — fetch it for the response.
    const lo = await client.query<{ id: string; points: number }>(
      `select id, points from users where id = $1`,
      [loserId],
    );
    if (lo.rows[0]) newBalances[lo.rows[0].id] = lo.rows[0].points;

    await client.query(
      `insert into point_transactions (user_id, delta, reason, game_round_id) values ($1, $2, 'win', $3)`,
      [args.winnerId, args.ante * 2, args.gameRoundId],
    );
    await client.query(
      `update game_rounds set winner_id = $1, outcome = 'win', ended_at = now() where id = $2`,
      [args.winnerId, args.gameRoundId],
    );

    await client.query("commit");
    return {
      outcome: "win",
      winnerId: args.winnerId,
      loserId,
      payout: args.ante * 2,
      newBalances,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Process pending refunds on backend startup. Any unresolved game_rounds
// (outcome = 'in_progress') get aborted; their pending_refunds get processed
// (i.e. ante credited back) so antes from games that died mid-flight are
// recovered.
export async function processStalePendingRefunds(): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const stale = await client.query<{ id: string; user_id: string; amount: number; game_round_id: string | null }>(
      `select id, user_id, amount, game_round_id
         from pending_refunds
        where processed_at is null
        for update skip locked`,
    );
    if (stale.rows.length === 0) {
      await client.query("commit");
      return 0;
    }

    for (const row of stale.rows) {
      await client.query(
        `update users set points = points + $1 where id = $2`,
        [row.amount, row.user_id],
      );
      await client.query(
        `insert into point_transactions (user_id, delta, reason, game_round_id) values ($1, $2, 'abort_refund', $3)`,
        [row.user_id, row.amount, row.game_round_id],
      );
      await client.query(
        `update pending_refunds set processed_at = now() where id = $1`,
        [row.id],
      );
    }

    // Mark any in-progress game_rounds as aborted.
    const roundIds = Array.from(new Set(stale.rows.map((r) => r.game_round_id).filter(Boolean) as string[]));
    if (roundIds.length > 0) {
      await client.query(
        `update game_rounds set outcome = 'aborted', ended_at = now() where id = any($1) and outcome = 'in_progress'`,
        [roundIds],
      );
    }

    await client.query("commit");
    return stale.rows.length;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
