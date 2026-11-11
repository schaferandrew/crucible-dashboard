<script lang="ts">
  // The About page. The authored prose is static (HC-16); every section label, area, tier, rule and the
  // Overall/Combined names come from the current suite's catalog through `view`.
  import { link } from '$lib/paths';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import { INSTALL_SNIPPET, REPO_NAME, REPO_URL, VERSIONING_URL } from './config';
  import type { AboutView } from './shape';

  let { view }: { view: AboutView } = $props();
</script>

<PageHeader title="About Crucible" crumbs={[{ label: 'About' }]}>
  <p class="disclaimer">This page was created and written by or with the help of AI.</p>
  <p>
    Crucible is a small benchmark harness for testing models on the work people actually hand them: building
    and fixing code, editing writing, answering everyday questions, reasoning through a schedule, diagnosing a
    leak. The aim is to answer a practical question: <em
      >which model, through which tool, on which hardware, is good enough for this job?</em
    >
  </p>
</PageHeader>

<div class="prose">
  <h2>How a run works</h2>
  <ol class="steps">
    <li>
      <strong>Task.</strong> Each task is a YAML file: the prompt, the checks or hidden tests that score it, and
      anything it needs, such as a seeded repo, fixture files or a mock email-and-calendar server.
    </li>
    <li>
      <strong>Harness.</strong> The harness hands the prompt to the model. Chat tasks always use
      <strong>direct</strong>, a single API call with no tools. Agentic tasks use a coding agent,
      <strong>opencode</strong> or <strong>pi</strong>, that can read and write files, run commands and
      browse. The same model can do very differently depending on the agent, which is why the Agentic results
      let you switch between them.
    </li>
    <li>
      <strong>Model.</strong> Local models run through LM Studio or Ollama; cloud models run through OpenRouter
      as a reference point.
    </li>
    <li>
      <strong>Run folder.</strong> Every run writes a folder with the prompt, the full transcript, the files the
      model produced, and the metrics: time, time to first token, tool calls, tokens and cost.
    </li>
    <li>
      <strong>Score.</strong> Each run is scored 0–10 automatically: chat answers by fixed checks, agentic work
      by hidden tests the agent never sees, run on the repo it left behind. Some tasks have a critical failure,
      like wrong interest math or an invented news story, that caps the score. Repeat runs of the same setup are
      averaged.
    </li>
    <li>
      <strong>Publish.</strong> Each run, score and status record is published as its own file, keyed by the run's
      permanent ID, and never edited afterwards: a rescore adds a score record, and a bad run gets a status record
      marking it invalid. The results page joins them for the suite you pick.
    </li>
  </ol>

  <h2>Sections and areas</h2>
  <p>
    Every task belongs to one section, {#each view.sectionLabels as label, i (i)}<strong>{label}</strong>{i <
      view.sectionLabels.length - 1
        ? i === view.sectionLabels.length - 2
          ? ' or '
          : ', '
        : ''}{/each}, and the sections are never mixed: not in a run, not in a score. Within each, a task's
    area is the kind of work it covers.
  </p>
  <div class="scroll">
    <table>
      <thead>
        <tr><th scope="col">Area</th><th scope="col">What it means</th><th scope="col">Examples</th></tr>
      </thead>
      {#each view.groups as g (g.id)}
        <tbody>
          <tr class="group"><th colspan="3" scope="colgroup">{g.heading}</th></tr>
          {#each g.areas as a (a.id)}
            <tr><th scope="row">{a.label}</th><td>{a.blurb}</td><td>{a.examples}</td></tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>

  <h2>Tiers</h2>
  <p>
    Tasks are also sorted by how hard they are, so a small model isn't judged on work meant for a frontier
    one.
  </p>
  <ul>
    {#each view.tiers as t (t.id)}
      <li><strong>{t.label}</strong>{t.text ? `: ${t.text}` : ''}</li>
    {/each}
  </ul>
  <p>
    The leaderboard ranks by the <strong>{view.overallLabel}</strong> score: a section's tier scores added together,
    each out of 10. You can leave tiers out of it, to rank on the everyday tiers alone, say. A model that hasn't
    covered every tier in it isn't ranked until that tier is left out.
  </p>
  {#if view.combinedLabel}
    <p>
      The <strong>{view.combinedLabel}</strong> view adds every section together: each tier is its section
      scores added up (out of 10 per section), and the {view.overallLabel} score adds those. A row joins one setup
      per section that matches on everything but the harness (model, packager, format, quant, reasoning, runtime
      or provider, and machine), and a model missing a section isn't ranked there.
    </p>
  {/if}

  <h2>How scores are made</h2>
  <p>
    Every score is computed automatically, the same way every time. Chat tasks are scored by fixed rules that
    run on the model's answer: each passes or fails and is worth a fixed number of points. Agentic tasks are
    scored by hidden tests, a test suite the agent never sees, run against the repo it leaves behind. Anyone
    running the same answer through Crucible gets the same score, and the answer that was checked is published
    with the result, so every score can be audited. The rules for each task in the current suite:
  </p>
  {#each view.ruleTasks as t (t.id)}
    <h3 title={t.id}>{t.name}</h3>
    <ul class="rules">
      {#each t.rules as rule, i (i)}<li>{rule}</li>{/each}
    </ul>
  {/each}

  <h2>Versions: Crucible and the suite</h2>
  <p>
    Two version numbers matter here. <strong>Crucible</strong>{view.crucibleVersion
      ? ` (${view.crucibleVersion} published this suite's catalog)`
      : ''} is the tool you install: the command line, the harnesses, the scoring engine and the format results
    are published in. <strong>The suite</strong> ("Suite {view.suiteId}") is which tasks are scored, at which
    version, with which tiers and weights. The leaderboard always names the suite it shows, and the selector
    at the top of the results switches to an earlier one.
  </p>
  <ul>
    <li>
      <strong>A suite cut</strong> (Suite v2 → v3) promotes new tasks, retires old ones, or changes tiers and weights.
      Each suite is frozen once cut, so a score in Suite v2 means the same thing forever.
    </li>
    <li>
      <strong>A suite patch</strong> (v3 → v3.1) only fixes how a task is scored. Saved answers are rescored; nothing
      needs rerunning.
    </li>
    <li>
      <strong>Runs belong to every suite that includes their task unchanged.</strong> If a task's prompt or files
      change, it gets a new version and older runs of it stop counting until they're rerun. A run from October still
      counts in a later suite if its task didn't change.
    </li>
    <li>
      <strong>New tasks start provisional:</strong> they run, but appear here only once a cut makes them active,
      after they've been checked against a small, a mid-size and a frontier model.
    </li>
  </ul>
  <p>
    The full rules are in <a href={VERSIONING_URL}>Crucible's versioning doc</a>, and what changed in each
    suite is in its
    <a href={view.changelogUrl}>changelog</a>.
  </p>

  <h2>Run it yourself</h2>
  <p>
    Crucible is open source. You need Python 3.9+, Node.js for the agent harnesses (opencode or pi) and, for
    local models, LM Studio or Ollama; cloud models run through OpenRouter.
  </p>
  <pre class="code"><code>{INSTALL_SNIPPET}</code></pre>
  <p>
    <code>crucible run</code> asks which model, what to run (everything, Chat, Agentic, an area, a tier or
    single tasks) and, for agentic tasks, which harness, then prints the one-line command to repeat it.
    Without uv:
    <code>python3 -m venv .venv</code>, activate it, <code>pip install -e .</code>.
  </p>
  <p><a href={REPO_URL}>{REPO_NAME} on GitHub</a> has the full setup for each harness and provider.</p>

  <h2>Share your results</h2>
  <div class="draft">
    Coming soon. Once the results format is standardized, you'll be able to submit your own runs, from your
    models on your hardware, to appear alongside these.
  </div>
  <p class="back"><a href={link('/')}>← Crucible results</a></p>
</div>

<style>
  .disclaimer {
    margin: 0 0 var(--space-3);
    color: var(--muted);
    font-style: italic;
    font-size: var(--text-sm);
  }
  .prose {
    max-width: 60rem;
    margin-bottom: var(--space-7);
  }
  .prose h2 {
    margin-top: var(--space-6);
  }
  .prose h3 {
    margin-top: var(--space-4);
  }
  .steps {
    padding-left: 1.4rem;
  }
  .steps li {
    margin-bottom: var(--space-2);
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 34rem;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  thead th {
    background: var(--tray);
  }
  .group th {
    background: var(--surface-2);
    font-weight: 600;
  }
  tbody th[scope='row'] {
    white-space: nowrap;
    font-weight: 600;
  }
  .rules {
    margin-top: 0;
  }
  .code {
    margin: var(--space-3) 0;
    padding: var(--space-3) var(--space-4);
    background: var(--tray);
    border-radius: var(--radius);
    overflow-x: auto;
    font: var(--text-sm) / var(--leading) var(--mono);
  }
  code {
    font-family: var(--mono);
    font-size: 0.92em;
  }
  .draft {
    padding: var(--space-3) var(--space-4);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--muted);
  }
  .back {
    margin-top: var(--space-5);
  }
</style>
