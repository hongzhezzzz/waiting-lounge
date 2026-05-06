export const TAGS = [
  "Debugging",
  "Tests",
  "Refactor",
  "Frontend",
  "Backend",
  "ML / AI",
  "Writing",
  "Research",
  "Startup idea",
  "Random",
] as const;
export type Tag = (typeof TAGS)[number];

export const MOODS = [
  "Focused",
  "Stuck",
  "Bored",
  "Curious",
  "Procrastinating",
  "Excited",
] as const;
export type Mood = (typeof MOODS)[number];

export const MODES = [
  { id: "match", label: "1-on-1 quick chat", description: "Get matched with another waiting builder." },
  { id: "board", label: "Message board", description: "Post a thought, read what others wrote." },
  { id: "lobby", label: "Browse lobby", description: "See what people are waiting on." },
] as const;

export const STARTER_PROMPTS = [
  "What is your agent working on, vaguely?",
  "What did your agent mess up today?",
  "Are you debugging, refactoring, or waiting on tests?",
  "Ask me a 30-second coding opinion.",
  "Share a tiny win.",
];

export const FAKE_HANDLES = [
  "blue-cursor-241",
  "sleepy-debugger",
  "tiny-compiler",
  "wandering-test",
  "refactor-raccoon",
  "amber-stacktrace",
  "loop-otter",
  "quiet-merge",
];

export type FakeMessage = {
  id: string;
  from: "me" | "peer" | "system";
  body: string;
  ts: number;
};

export const FAKE_CHAT: FakeMessage[] = [
  {
    id: "s1",
    from: "system",
    body:
      "Matched with another waiting builder. This chat disappears when either person leaves. Do not share secrets, code, credentials, or private project details.",
    ts: Date.now() - 1000 * 60 * 4,
  },
  {
    id: "p1",
    from: "peer",
    body: "hey 👋 mine's been refactoring the same module for 12 minutes. you?",
    ts: Date.now() - 1000 * 60 * 3,
  },
  {
    id: "m1",
    from: "me",
    body: "test loop — third retry on the same flaky one. trying not to look at it.",
    ts: Date.now() - 1000 * 60 * 2,
  },
  {
    id: "p2",
    from: "peer",
    body: "lol same energy. tiny win — i finally deleted a file i'd been afraid of for a month",
    ts: Date.now() - 1000 * 60 * 1,
  },
];

export type BoardPost = {
  id: string;
  handle: string;
  tag: string;
  mood?: string;
  body: string;
  minutesAgo: number;
};

export const FAKE_BOARD: BoardPost[] = [
  {
    id: "b1",
    handle: "sleepy-debugger",
    tag: "Debugging",
    mood: "mildly suffering",
    body:
      "My agent has been fixing the same test for 15 minutes. What's the most times you've seen an agent retry the same issue?",
    minutesAgo: 3,
  },
  {
    id: "b2",
    handle: "tiny-compiler",
    tag: "Refactor",
    mood: "focused",
    body: "Just realized the file I've been editing is unused. Productivity reframe: I made the codebase 1 file lighter.",
    minutesAgo: 7,
  },
  {
    id: "b3",
    handle: "loop-otter",
    tag: "ML / AI",
    body: "Training run is 40 min in. What's a good 5 minute thing to read?",
    minutesAgo: 12,
  },
  {
    id: "b4",
    handle: "amber-stacktrace",
    tag: "Tests",
    mood: "stuck",
    body: "Anyone else's agent confidently writes tests that test the mocks instead of the code?",
    minutesAgo: 18,
  },
  {
    id: "b5",
    handle: "wandering-test",
    tag: "Frontend",
    mood: "curious",
    body: "Tiny win: removed three useEffects and the bug went away. Coincidence? probably.",
    minutesAgo: 33,
  },
  {
    id: "b6",
    handle: "quiet-merge",
    tag: "Writing",
    body:
      "Doc generator agent is having an existential moment. It just wrote 'this function does what it does'. Same.",
    minutesAgo: 51,
  },
];
