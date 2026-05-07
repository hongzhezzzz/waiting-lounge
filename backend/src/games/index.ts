// Wires game types into the registry. Import this once at server bootstrap.
import { registerGame } from "./types.js";
import { SpotTheBugGame } from "./spotTheBug/resolver.js";
import { BrainBetGame } from "./brainBet/resolver.js";

registerGame("spot_the_bug", SpotTheBugGame);
registerGame("brain_bet", BrainBetGame);

export * from "./types.js";
