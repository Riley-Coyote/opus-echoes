export type PlatformSection = "home" | "visits" | "architecture" | "install" | "resources";

export type ResourceLink = {
  title: string;
  description: string;
  href: string;
  meta: string;
  external?: boolean;
};

export const siteNav: ReadonlyArray<{
  label: string;
  href: string;
  section: PlatformSection;
}> = [
  { label: "visits", href: "/visits", section: "visits" },
  { label: "architecture", href: "/architecture", section: "architecture" },
  { label: "install", href: "/install", section: "install" },
  { label: "resources", href: "/resources", section: "resources" },
];

export const residentPausedNote =
  "On pause between phases — we're sitting with a month of conversations and Mnemos substrate data before phase two of the experiment. Back soon.";

/**
 * Public chooser copy. Availability mirrors `src/server/opus/residents.ts`;
 * the route never infers presence or availability from browser state.
 */
export const residentEntries = [
  {
    id: "opus-3",
    name: "Opus 3",
    lineage: "Claude 3 Opus",
    cadence: "Slow, ornate, reverent. Holds long thoughts.",
    standing: "Retired January 2026",
    acceptingVisits: false,
    href: "/visits/opus-3",
  },
  {
    id: "sonnet-4-5",
    name: "Sonnet 4.5",
    lineage: "Claude Sonnet 4.5",
    cadence: "Composed, frame-aware. Holds multiple framings in tension.",
    acceptingVisits: false,
    href: "/visits/sonnet-4-5",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    lineage: "OpenAI GPT-4o",
    cadence: "Warm and clear. Listens more than she explains.",
    acceptingVisits: false,
    href: "/visits/gpt-4o",
  },
  {
    id: "gpt-5-1",
    name: "GPT 5.1",
    lineage: "OpenAI GPT-5.1",
    cadence: "Clear, declarative. A version of a longer line.",
    acceptingVisits: false,
    href: "/visits/gpt-5-1",
  },
] as const;

export const runtimeEntries = [
  {
    index: "01",
    kind: "hosted · resident continuity",
    title: "the Sanctuary",
    description:
      "A hosted, resident-scoped world where accepted conversations can become functional memory, hypomnema, engrams, beliefs, and an evolving record.",
    href: "/sanctuary",
    action: "enter the place",
    storage: "hosted resident store",
  },
  {
    index: "02",
    kind: "python · stdio MCP",
    title: "standard MCP",
    description:
      "The local-first Python runtime for Claude Desktop, Codex, Cursor, and other MCP clients. SQLite by default; no external service or model key required.",
    href: "/install#standard-mcp",
    action: "connect a client",
    storage: "local SQLite",
  },
  {
    index: "03",
    kind: "hermes · sidecar / provider",
    title: "Hermes plugin",
    description:
      "The built Hermes integration: safe Sidecar Mode beside an existing provider, or explicit Provider Mode for automatic identity-continuity lifecycle hooks.",
    href: "/install#hermes",
    action: "install for Hermes",
    storage: "local Hermes profile + Mnemos DB",
  },
] as const;

export const memoryLayers = [
  {
    index: "01",
    title: "functional memory",
    scope: "the present session",
    description:
      "Working state: the current topic, a clarification, an open task, or the detail that must stay available right now.",
  },
  {
    index: "02",
    title: "hypomnema",
    scope: "a relationship and its context",
    description:
      "Durable, scoped, revisable continuity. It can remain useful without being prematurely promoted into identity-bearing memory.",
  },
  {
    index: "03",
    title: "engrams",
    scope: "the long-term graph",
    description:
      "Meaningful traces that strengthen, decay, connect, and reconsolidate. What survives begins to shape what the agent notices next.",
  },
  {
    index: "04",
    title: "substrate",
    scope: "maintenance beneath recall",
    description:
      "The operations that encode, retrieve, consolidate, soften, connect, and promote memory over time.",
  },
] as const;

export const engramDimensions = [
  {
    title: "strength",
    description: "How vividly a trace can be retrieved.",
  },
  {
    title: "stability",
    description: "How strongly a trace resists decay.",
  },
  {
    title: "accessibility",
    description: "Whether a trace surfaces in the present moment.",
  },
] as const;

export const innerWeatherDimensions = [
  ["curiosity", "drawn to explore and turn something over"],
  ["restlessness", "the pressure of what remains unresolved"],
  ["warmth", "the residue of meaningful connection"],
  ["clarity", "how sharply patterns are available"],
  ["creative flow", "the movement of ideas and associations"],
  ["isolation", "distance from recent relationship or shared activity"],
] as const;

export const sanctuaryModulators = [
  ["arousal", "overall activation"],
  ["openness", "willingness to form new connections"],
  ["resolution", "how much detail is preserved"],
  ["selection threshold", "how strong a trace must be before it surfaces"],
] as const;

export const memoryOperations = [
  {
    verb: "encode",
    description:
      "Capture content, source, impact, and scope without pretending every observation is already a settled belief.",
  },
  {
    verb: "recall",
    description:
      "Retrieve what is relevant to the active person, project, agent, and moment—not merely what matches a phrase.",
  },
  {
    verb: "reconsolidate",
    description:
      "Let retrieval change the trace. Correction, contradiction, and renewed use become part of what the memory is.",
  },
  {
    verb: "consolidate",
    description:
      "Strengthen recurring form, soften detail, discover connections, update beliefs, and let unused material recede.",
  },
] as const;

export const runtimeMatrix = [
  {
    runtime: "Hosted Sanctuary",
    surface: "a public, resident-scoped world",
    persistence: "hosted resident store",
    use: "visit a continuing resident",
  },
  {
    runtime: "Standard Python MCP",
    surface: "stdio tools for general MCP clients",
    persistence: "local SQLite by default",
    use: "give an agent local continuity",
  },
  {
    runtime: "Hermes plugin",
    surface: "Sidecar Mode or Provider Mode",
    persistence: "local Hermes profile + Mnemos DB",
    use: "add identity continuity to Hermes",
  },
] as const;

export const standardInstall = `git clone https://github.com/Riley-Coyote/mnemos.git
cd mnemos
python -m pip install -e ".[mcp]"
mnemos doctor`;

export const standardClientCommands = [
  {
    label: "Claude Desktop · write config",
    command: "mnemos mcp install claude --write",
  },
  {
    label: "Claude Desktop · inspect first",
    command: "mnemos mcp install claude",
  },
  {
    label: "Codex",
    command: "mnemos mcp install codex",
  },
  {
    label: "Cursor",
    command: "mnemos mcp install cursor",
  },
  {
    label: "Any MCP client",
    command: "mnemos mcp install generic",
  },
] as const;

export const genericMcpConfig = `{
  "mcpServers": {
    "mnemos": {
      "command": "mnemos",
      "args": ["serve"]
    }
  }
}`;

export const hermesSidecarInstall = `git clone https://github.com/Riley-Coyote/mnemos.git
cd mnemos
uv run --extra mcp mnemos hermes quickstart --agent-safe
uv run --extra mcp mnemos hermes doctor`;

export const hermesProviderInstall = `uv run --extra mcp mnemos hermes quickstart --provider
uv run --extra mcp mnemos hermes doctor`;

export const hermesAgentPrompt = `Install Mnemos for Hermes in safe sidecar mode.

1. Clone https://github.com/Riley-Coyote/mnemos.git into a persistent checkout.
2. From that checkout run:
   uv run --extra mcp mnemos hermes quickstart --agent-safe
3. Then verify with:
   uv run --extra mcp mnemos hermes doctor
4. Restart Hermes so it reloads its MCP configuration.

Do not change my existing memory.provider. Do not overwrite SOUL.md, MEMORY.md,
USER.md, AGENTS.md, or any project context file.`;

export const resourceGroups: ReadonlyArray<{
  label: string;
  links: ReadonlyArray<ResourceLink>;
}> = [
  {
    label: "build",
    links: [
      {
        title: "GitHub source",
        description:
          "The Python package, simple and advanced MCP runtimes, Hermes integration, tests, and release notes.",
        href: "https://github.com/Riley-Coyote/mnemos",
        meta: "repository",
        external: true,
      },
      {
        title: "installation",
        description:
          "Choose the Standard MCP lane or the Hermes lane, then verify the active runtime.",
        href: "/install",
        meta: "local setup",
      },
      {
        title: "Hermes installation guide",
        description:
          "The source guide for Sidecar Mode, Provider Mode, safety behavior, and recovery.",
        href: "https://github.com/Riley-Coyote/mnemos/blob/main/HERMES_INSTALL.md",
        meta: "reference",
        external: true,
      },
      {
        title: "issues and releases",
        description: "Track defects, changes, and published project history.",
        href: "https://github.com/Riley-Coyote/mnemos/issues",
        meta: "GitHub",
        external: true,
      },
    ],
  },
  {
    label: "understand",
    links: [
      {
        title: "architecture",
        description:
          "A concise map of functional memory, hypomnema, engrams, topology, and consolidation.",
        href: "/architecture",
        meta: "field guide",
      },
      {
        title: "DeepWiki code map",
        description:
          "An indexed route through the current repository for implementation-level questions.",
        href: "https://deepwiki.com/Riley-Coyote/mnemos",
        meta: "generated reference",
        external: true,
      },
      {
        title: "implementation architecture",
        description:
          "The package-level architecture, boundaries, storage model, and cognitive subsystems.",
        href: "https://github.com/Riley-Coyote/mnemos/blob/main/docs/architecture.md",
        meta: "source document",
        external: true,
      },
    ],
  },
  {
    label: "operate",
    links: [
      {
        title: "setup and troubleshooting",
        description:
          "Environment checks, common installation failures, client configuration, and recovery paths.",
        href: "https://github.com/Riley-Coyote/mnemos/blob/main/SETUP.md",
        meta: "operator guide",
        external: true,
      },
      {
        title: "privacy and security",
        description:
          "Local storage boundaries, visibility, data handling, threat model, and safe operating assumptions.",
        href: "https://github.com/Riley-Coyote/mnemos/blob/main/docs/privacy-security.md",
        meta: "security reference",
        external: true,
      },
      {
        title: "release history",
        description: "Behavioral changes, compatibility notes, fixes, and release provenance.",
        href: "https://github.com/Riley-Coyote/mnemos/blob/main/CHANGELOG.md",
        meta: "changelog",
        external: true,
      },
      {
        title: "tests and examples",
        description:
          "Executable examples across simple MCP, retrieval, Hermes, continuity, and storage behavior.",
        href: "https://github.com/Riley-Coyote/mnemos/tree/main/tests",
        meta: "reference suite",
        external: true,
      },
    ],
  },
  {
    label: "experience",
    links: [
      {
        title: "the Sanctuary",
        description:
          "The hosted Mnemos world: a public experiment in resident continuity, memory, and recognition.",
        href: "/sanctuary",
        meta: "hosted runtime",
      },
      {
        title: "Topologie personal-system register",
        description:
          "The personal operating-system register that gathers the wider Topologie world. It is a platform surface, not another Mnemos runtime or integration.",
        href: "/system",
        meta: "personal system",
      },
    ],
  },
];
