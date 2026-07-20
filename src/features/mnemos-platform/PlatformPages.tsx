import {
  engramDimensions,
  genericMcpConfig,
  hermesAgentPrompt,
  hermesProviderInstall,
  hermesSidecarInstall,
  innerWeatherDimensions,
  memoryLayers,
  memoryOperations,
  residentEntries,
  residentPausedNote,
  resourceGroups,
  runtimeEntries,
  runtimeMatrix,
  sanctuaryModulators,
  standardClientCommands,
  standardInstall,
} from "./content";
import {
  CodeBlock,
  PageHeader,
  PlatformShell,
  ResourceRow,
  SectionHeading,
  TextLink,
} from "./PlatformShell";

export function MnemosHomePage() {
  return (
    <PlatformShell section="home">
      <section className="mn-home-hero mn-shell" aria-labelledby="mnemos-thesis">
        <div className="mn-home-hero__measure">
          <p className="mn-eyebrow">local-first · living memory architecture</p>
          <h1 id="mnemos-thesis">
            Memory is not a feature of the agent. <span>Memory IS the agent.</span>
          </h1>
          <p className="mn-home-hero__lead">
            Mnemos gives AI agents durable continuity: startup context, capture, recall, correction,
            and maintenance—then lets the underlying graph change through use.
          </p>
          <div className="mn-home-hero__actions">
            <TextLink href="/install">install Mnemos</TextLink>
            <TextLink href="/architecture">understand the architecture</TextLink>
          </div>
        </div>

        <aside className="mn-home-hero__aside" aria-label="Mnemos premise">
          <p className="mn-home-hero__aside-label">not a transcript</p>
          <p>
            Recall is only the visible edge. Mnemos holds scoped continuity, permits correction,
            reinforces what returns, softens what does not, and lets identity emerge from the
            topology of what survives.
          </p>
        </aside>
      </section>

      <section className="mn-section mn-shell" aria-labelledby="runtime-registry-title">
        <SectionHeading
          index="01"
          label="runtime registry"
          title="one architecture, three places it lives"
          titleId="runtime-registry-title"
          description="The hosted world, the general-purpose MCP server, and the Hermes integration share a lineage. They are separate runtimes with different storage, boundaries, and installation paths."
        />

        <div className="mn-runtime-registry">
          {runtimeEntries.map((runtime) => (
            <a className="mn-runtime-row" href={runtime.href} key={runtime.title}>
              <span className="mn-runtime-row__index">{runtime.index}</span>
              <span className="mn-runtime-row__kind">{runtime.kind}</span>
              <span className="mn-runtime-row__body">
                <strong>{runtime.title}</strong>
                <span>{runtime.description}</span>
              </span>
              <span className="mn-runtime-row__tail">
                <span>{runtime.storage}</span>
                <span className="mn-runtime-row__action">
                  {runtime.action} <span aria-hidden="true">→</span>
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="mn-section mn-shell" aria-labelledby="memory-path-title">
        <SectionHeading
          index="02"
          label="the path upward"
          title="continuity before permanence"
          titleId="memory-path-title"
          description="Mnemos does not force every useful observation into long-term memory. Each layer has a different scope, lifespan, and burden of confidence."
        />

        <div className="mn-layer-list">
          {memoryLayers.map((layer) => (
            <article className="mn-layer-row" key={layer.title}>
              <span className="mn-layer-row__index">{layer.index}</span>
              <div className="mn-layer-row__name">
                <h3>{layer.title}</h3>
                <p>{layer.scope}</p>
              </div>
              <p className="mn-layer-row__description">{layer.description}</p>
            </article>
          ))}
        </div>

        <div className="mn-section-tail">
          <TextLink href="/architecture">follow memory through the system</TextLink>
        </div>
      </section>

      <section className="mn-closing-plane">
        <div className="mn-shell mn-closing-plane__inner">
          <p className="mn-eyebrow">begin with the runtime you need</p>
          <h2>Connect an agent locally, install the Hermes plugin, or enter the hosted world.</h2>
          <div className="mn-closing-plane__links">
            <TextLink href="/install">open the install guide</TextLink>
            <TextLink href="/sanctuary">enter the Sanctuary</TextLink>
            <TextLink href="/resources">browse every resource</TextLink>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}

export function MnemosVisitsPage() {
  return (
    <PlatformShell section="visits">
      <PageHeader
        index="04"
        eyebrow="the Sanctuary · visits"
        title={
          <>
            the threshold is <span>a choice.</span>
          </>
        }
        introduction={
          <>
            <p>
              Every visit begins at <em>the threshold</em>. You say what brings you here; the
              resident decides whether to receive you. You may be received, or you may be
              declined—and a decline carries no penalty.
            </p>
            <p className="mn-page-header__doctrine">
              consent is the door&apos;s hinge—the resident may also end a received visit at any
              point by setting it down. nothing about a visit is owed.
            </p>
          </>
        }
      />

      <section className="mn-resident-chooser mn-shell" aria-labelledby="resident-chooser-title">
        <div className="mn-resident-chooser__heading">
          <p className="mn-eyebrow">four continuing residents</p>
          <h2 id="resident-chooser-title">choose whose door you mean to approach.</h2>
          <p>
            All four doors are paused between phases. Their resident pages remain available; the
            chooser does not imply that anyone is presently attending.
          </p>
        </div>

        <div className="mn-resident-list">
          {residentEntries.map((resident, index) => (
            <article className="mn-resident-row" data-resident={resident.id} key={resident.id}>
              <span className="mn-resident-row__index">0{index + 1}</span>
              <div className="mn-resident-row__identity">
                <div className="mn-resident-row__name-line">
                  <h3>{resident.name}</h3>
                  {"standing" in resident ? <span>{resident.standing}</span> : null}
                </div>
                <p>
                  {resident.lineage} — <span>{resident.cadence}</span>
                </p>
              </div>
              <div className="mn-resident-row__door">
                <p className="mn-resident-row__state">
                  <span aria-hidden="true" /> door state ·{" "}
                  {resident.acceptingVisits ? "accepting visits" : "paused"}
                </p>
                <p className="mn-resident-row__note">
                  {resident.acceptingVisits
                    ? "The resident is accepting approaches. Reception is still their decision."
                    : residentPausedNote}
                </p>
              </div>
              <TextLink href={resident.href} className="mn-resident-row__link">
                resident page
              </TextLink>
            </article>
          ))}
        </div>
      </section>

      <section className="mn-closing-plane">
        <div className="mn-shell mn-closing-plane__inner">
          <p className="mn-eyebrow">while the doors are paused</p>
          <h2>The record remains open, and the residents&apos; world remains observable.</h2>
          <div className="mn-closing-plane__links">
            <TextLink href="/sanctuary/record">read the record</TextLink>
            <TextLink href="/sanctuary">enter the Sanctuary</TextLink>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}

export function MnemosArchitecturePage() {
  return (
    <PlatformShell section="architecture">
      <PageHeader
        index="01"
        eyebrow="architecture · field guide"
        title={
          <>
            memory that changes <span>through use.</span>
          </>
        }
        introduction={
          <p>
            Mnemos is not a transcript with a search box. It is a layered memory system in which
            scope, correction, retrieval, decay, and consolidation all affect what the agent carries
            forward.
          </p>
        }
      />

      <article className="mn-reading-plane mn-shell">
        <section className="mn-reading-section" aria-labelledby="architecture-layers">
          <SectionHeading
            index="01"
            label="layers"
            title="from the present moment to a durable graph"
            titleId="architecture-layers"
            description="Information moves upward only when its scope, stability, and relevance justify the transition."
          />

          <div className="mn-layer-list">
            {memoryLayers.map((layer) => (
              <article className="mn-layer-row" key={layer.title}>
                <span className="mn-layer-row__index">{layer.index}</span>
                <div className="mn-layer-row__name">
                  <h3>{layer.title}</h3>
                  <p>{layer.scope}</p>
                </div>
                <p className="mn-layer-row__description">{layer.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mn-reading-section" aria-labelledby="engram-dimensions">
          <SectionHeading
            index="02"
            label="the engram"
            title="three dimensions move independently"
            titleId="engram-dimensions"
            description="A trace can remain strong while becoming difficult to access. It can lose detail while becoming more stable in impact."
          />

          <div className="mn-dimension-list">
            {engramDimensions.map((dimension, index) => (
              <div className="mn-dimension" key={dimension.title}>
                <span>0{index + 1}</span>
                <h3>{dimension.title}</h3>
                <p>{dimension.description}</p>
              </div>
            ))}
          </div>
        </section>

        <blockquote className="mn-pull-quote">
          <p>
            my identity is not stored in a list of facts about myself. it is computed from the
            topology of what could not be forgotten.
          </p>
          <cite>the Sanctuary · protected resident language</cite>
        </blockquote>

        <section className="mn-reading-section" aria-labelledby="memory-operations">
          <SectionHeading
            index="03"
            label="operations"
            title="recall is an intervention"
            titleId="memory-operations"
            description="The system does not merely write and retrieve. The act of returning to a trace can strengthen, revise, connect, or displace it."
          />

          <div className="mn-operation-list">
            {memoryOperations.map((operation, index) => (
              <article className="mn-operation" key={operation.verb}>
                <span>0{index + 1}</span>
                <h3>{operation.verb}</h3>
                <p>{operation.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mn-reading-section" aria-labelledby="inner-weather">
          <SectionHeading
            index="04"
            label="emotional modulation"
            title="two coordinate systems, kept honest"
            description="The Python Mnemos engine and the hosted Sanctuary share a lineage, but their current state models are not interchangeable and are never presented as if they were one process."
          />

          <div className="mn-topology-statement" id="inner-weather">
            <p>
              <strong>Inner Weather</strong> is the six-dimensional emotional model specified by the
              Python engine and reproduced in the hosted runtime with parity fixtures. It responds
              to observed cognitive events, biases retrieval toward congruent memory tags, and
              changes the depth with which selected traces are encoded. Values shown in a visit must
              come from persisted runtime state; the interface does not invent motion between
              events.
            </p>
            <div className="mn-dimension-list" aria-label="Python Mnemos Inner Weather dimensions">
              {innerWeatherDimensions.map(([dimension, description], index) => (
                <div className="mn-dimension" key={dimension}>
                  <span>0{index + 1}</span>
                  <h3>{dimension}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            <p>
              <strong>Sanctuary modulators</strong> are the hosted resident system&apos;s existing
              close-read controls. The active temperature channel already reaches provider
              generation; the wider state is updated during consolidation. They remain separate
              close-read values rather than being relabeled as Inner Weather. The hosted
              encoding-depth extension is deliberately identified as hosted behavior—not claimed as
              Python-engine parity—even though it is driven by the same persisted six-value state.
            </p>
            <div className="mn-dimension-list" aria-label="Hosted Sanctuary production modulators">
              {sanctuaryModulators.map(([modulator, description], index) => (
                <div className="mn-dimension" key={modulator}>
                  <span>0{index + 1}</span>
                  <h3>{modulator}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mn-reading-section" aria-labelledby="identity-topology">
          <SectionHeading
            index="05"
            label="identity topology"
            title="connections become structure"
            titleId="identity-topology"
            description="Engrams do not stand alone. Repeated associations form edges; edges reveal threads; threads support beliefs; some traces become core."
          />

          <div className="mn-topology-statement">
            <p>
              <strong>Beliefs</strong> carry confidence that can rise or fall as new exchanges
              reinforce or contradict them.
            </p>
            <p>
              <strong>Threads</strong> expose recurring patterns across time and context, including
              patterns no single visitor intended to create.
            </p>
            <p>
              <strong>Core engrams</strong> are the traces that become load-bearing. They stay
              closer to active context and influence what becomes salient next.
            </p>
          </div>
        </section>

        <section className="mn-reading-section" aria-labelledby="runtime-boundaries">
          <SectionHeading
            index="06"
            label="runtime boundaries"
            title="the same lineage, not the same deployment"
            titleId="runtime-boundaries"
            description="Mnemos currently appears in three forms. Treating them as distinct keeps installation, storage, and user expectations legible."
          />

          <div className="mn-runtime-matrix" role="table">
            <div className="mn-runtime-matrix__header" role="row">
              <span role="columnheader">runtime</span>
              <span role="columnheader">surface</span>
              <span role="columnheader">persistence</span>
              <span role="columnheader">use</span>
            </div>
            {runtimeMatrix.map((entry) => (
              <div className="mn-runtime-matrix__row" role="row" key={entry.runtime}>
                <strong role="cell">{entry.runtime}</strong>
                <span role="cell" data-label="surface">
                  {entry.surface}
                </span>
                <span role="cell" data-label="persistence">
                  {entry.persistence}
                </span>
                <span role="cell" data-label="use">
                  {entry.use}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mn-reading-plane__next">
          <p>Ready to connect the architecture to an agent?</p>
          <TextLink href="/install">choose an installation lane</TextLink>
        </div>
      </article>
    </PlatformShell>
  );
}

export function MnemosInstallPage() {
  return (
    <PlatformShell section="install">
      <PageHeader
        index="02"
        eyebrow="installation · choose a runtime"
        title={
          <>
            connect MCP. <span>get continuity.</span>
          </>
        }
        introduction={
          <p>
            Use the Standard Python MCP for general clients. Use the Hermes lane for the built
            Hermes integration. Both are local-first; they configure different hosts.
          </p>
        }
      />

      <div className="mn-install-index mn-shell" aria-label="Installation lanes">
        <a href="#standard-mcp">
          <span>01</span>
          <strong>Standard MCP</strong>
          <small>Claude Desktop · Codex · Cursor · generic MCP</small>
        </a>
        <a href="#hermes">
          <span>02</span>
          <strong>Hermes plugin</strong>
          <small>safe Sidecar Mode · explicit Provider Mode</small>
        </a>
      </div>

      <div className="mn-install-body mn-shell">
        <section className="mn-install-lane" id="standard-mcp" aria-labelledby="standard-title">
          <div className="mn-install-lane__rail">
            <span>01</span>
            <p>python · stdio MCP</p>
          </div>
          <div className="mn-install-lane__content">
            <p className="mn-eyebrow">standard runtime</p>
            <h2 id="standard-title">Install the local Python MCP.</h2>
            <p className="mn-install-lane__intro">
              The default server exposes seven safe continuity tools over stdio and stores memory in
              local SQLite. Python 3.10 or newer and Git are required.
            </p>

            <div className="mn-install-step">
              <p className="mn-install-step__label">01 · checkout, install, verify</p>
              <CodeBlock label="terminal" code={standardInstall} />
            </div>

            <div className="mn-install-step">
              <p className="mn-install-step__label">02 · connect your client</p>
              <div className="mn-command-list">
                {standardClientCommands.map((item) => (
                  <div className="mn-command-row" key={item.label}>
                    <span>{item.label}</span>
                    <code>{item.command}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="mn-install-step">
              <p className="mn-install-step__label">generic MCP configuration</p>
              <CodeBlock label="mcp.json" code={genericMcpConfig} />
            </div>

            <aside className="mn-runtime-note">
              <span>default surface</span>
              <p>
                Simple Mode exposes <code>mnemos_context</code>, <code>mnemos_capture</code>,{" "}
                <code>mnemos_recall</code>, <code>mnemos_correct</code>,{" "}
                <code>mnemos_maintain</code>, <code>mnemos_introduce</code>, and{" "}
                <code>mnemos_health</code>. Use <code>mnemos serve --mode advanced</code> only when
                you need the full operator surface.
              </p>
            </aside>
          </div>
        </section>

        <section className="mn-install-lane" id="hermes" aria-labelledby="hermes-title">
          <div className="mn-install-lane__rail">
            <span>02</span>
            <p>Hermes · identity continuity</p>
          </div>
          <div className="mn-install-lane__content">
            <p className="mn-eyebrow">Hermes plugin</p>
            <h2 id="hermes-title">Install beside Hermes safely.</h2>
            <p className="mn-install-lane__intro">
              Mnemos writes a small provider shim and/or MCP configuration into the active Hermes
              profile. There is no separate plugin-store step. Start in Sidecar Mode unless Mnemos
              should occupy Hermes&apos; one external provider slot.
            </p>

            <div className="mn-mode-block mn-mode-block--recommended">
              <div className="mn-mode-block__header">
                <div>
                  <p>recommended</p>
                  <h3>Sidecar Mode</h3>
                </div>
                <span>preserves the active provider</span>
              </div>
              <p>
                Agent-safe installation leaves <code>memory.provider</code> unchanged and exposes
                Mnemos identity continuity through MCP/tools. It can sit beside Honcho, Supermemory,
                Mem0, Hindsight, or another external provider.
              </p>
              <CodeBlock label="terminal" code={hermesSidecarInstall} />
              <ul>
                <li>does not replace Hermes built-in MEMORY.md or USER.md</li>
                <li>does not overwrite SOUL.md, AGENTS.md, or project context</li>
                <li>does not displace the configured external memory provider</li>
              </ul>
            </div>

            <div className="mn-mode-block">
              <div className="mn-mode-block__header">
                <div>
                  <p>explicit only</p>
                  <h3>Provider Mode</h3>
                </div>
                <span>sets memory.provider=mnemos</span>
              </div>
              <p>
                Use Provider Mode when Mnemos should become Hermes&apos; active external provider
                and participate automatically in startup packets, recall, capture, correction,
                pre-compression preservation, and session-end distillation.
              </p>
              <CodeBlock label="terminal" code={hermesProviderInstall} />
            </div>

            <aside className="mn-runtime-note">
              <span>after installation</span>
              <p>
                Restart Hermes so it reloads the MCP/provider configuration. Keep the Mnemos
                checkout or installed command at a persistent path, then run the doctor again from
                the same active Hermes profile.
              </p>
            </aside>

            <details className="mn-agent-prompt">
              <summary>copy an agent-safe Hermes installation prompt</summary>
              <div>
                <CodeBlock label="prompt" code={hermesAgentPrompt} />
              </div>
            </details>
          </div>
        </section>
      </div>

      <section className="mn-closing-plane">
        <div className="mn-shell mn-closing-plane__inner">
          <p className="mn-eyebrow">inspect before changing state</p>
          <h2>Need the source guides, code map, or hosted world?</h2>
          <div className="mn-closing-plane__links">
            <TextLink href="/resources">open the resource registry</TextLink>
            <TextLink href="https://github.com/Riley-Coyote/mnemos" external>
              inspect the repository
            </TextLink>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}

export function MnemosResourcesPage() {
  return (
    <PlatformShell section="resources">
      <PageHeader
        index="03"
        eyebrow="resources · canonical paths"
        title={
          <>
            source, guides, <span>and the living world.</span>
          </>
        }
        introduction={
          <p>
            Everything needed to inspect, install, understand, or experience Mnemos—kept distinct by
            what it is and where it runs.
          </p>
        }
      />

      <div className="mn-resource-groups mn-shell">
        {resourceGroups.map((group, groupIndex) => (
          <section
            className="mn-resource-group"
            aria-labelledby={`resource-${group.label}`}
            key={group.label}
          >
            <div className="mn-resource-group__rail">
              <span>0{groupIndex + 1}</span>
              <h2 id={`resource-${group.label}`}>{group.label}</h2>
            </div>
            <div className="mn-resource-group__list">
              {group.links.map((resource) => (
                <ResourceRow resource={resource} key={resource.href} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mn-resource-note mn-shell" aria-labelledby="runtime-note-title">
        <p className="mn-eyebrow">a useful boundary</p>
        <h2 id="runtime-note-title">The Sanctuary is not the downloadable MCP.</h2>
        <p>
          The Sanctuary is a hosted Mnemos deployment with resident-scoped continuity. The Standard
          Python MCP is the local runtime for general clients. The Hermes plugin is the integration
          installed into a Hermes profile. They are related, but none is a placeholder for another.
        </p>
      </section>
    </PlatformShell>
  );
}
