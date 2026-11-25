<script lang="ts">
  import { link } from '$lib/paths';
  import PageHeader from '$lib/ui/layout/PageHeader.svelte';

  const endpoint = import.meta.env.VITE_RESULTS_UPLOAD_URL;
  const maxBytes = 20 * 1024 * 1024;

  let file = $state<File>();
  let dragDepth = $state(0);
  let sending = $state(false);
  let error = $state('');
  let receipt = $state('');

  function choose(files: FileList | null) {
    if (!files?.length || sending) return;
    file = undefined;
    receipt = '';
    error = '';
    const candidate = files[0];
    if (files.length !== 1 || !candidate || !candidate.name.toLowerCase().endsWith('.zip')) {
      error = 'Choose one ZIP file.';
    } else if (candidate.size < 4 || candidate.size > maxBytes) {
      error = 'Choose a non-empty ZIP file up to 20 MiB.';
    } else {
      file = candidate;
    }
  }

  function drop(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth = 0;
    choose(event.dataTransfer.files);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!endpoint || !file || sending) return;
    sending = true;
    error = '';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
        signal: AbortSignal.timeout(120_000),
      });
      const result = await response.json();
      if (!response.ok || typeof result.receipt !== 'string') {
        error = typeof result.error === 'string' ? result.error : 'Upload failed. Try again.';
        return;
      }
      receipt = result.receipt;
      file = undefined;
    } catch {
      error = 'Could not complete the upload. Try again.';
    } finally {
      sending = false;
    }
  }
</script>

<PageHeader
  title="Upload results"
  crumbs={[{ label: 'About', href: link('/about/') }, { label: 'Upload results' }]}
>
  <p>Submit a Crucible results bundle for review.</p>
</PageHeader>

<form onsubmit={submit}>
  <fieldset
    class:dragging={dragDepth > 0 && !sending}
    ondragenter={(event) => {
      if (event.dataTransfer?.types.includes('Files')) dragDepth++;
    }}
    ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
    ondragover={(event) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = sending ? 'none' : 'copy';
      }
    }}
    ondrop={drop}
  >
    <legend>Results file</legend>
    <label>
      <input
        type="file"
        accept=".zip,application/zip"
        aria-label="Choose results ZIP"
        aria-describedby="upload-limit"
        disabled={sending}
        onchange={(event) => {
          choose(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <span class="choose">{file ? 'Choose another file' : 'Choose file'}</span>
    </label>
    <span>or drag and drop it here</span>
    <p id="upload-limit">ZIP file, up to 20 MiB</p>
    {#if file}
      <p class="filename">{file.name}</p>
    {/if}
  </fieldset>

  {#if !endpoint}
    <p>Uploads are currently unavailable.</p>
  {/if}
  <button type="submit" disabled={!file || sending || !endpoint}
    >{sending ? 'Uploading…' : 'Upload results'}</button
  >
  <div role="status">
    {#if receipt}<p>Results received for review. Receipt <code>{receipt}</code>.</p>{/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</form>

<style>
  form {
    max-width: 36rem;
    margin-bottom: var(--space-7);
  }
  fieldset {
    min-width: 0;
    margin: 0 0 var(--space-3);
    padding: var(--space-5) var(--space-4);
    text-align: center;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }
  fieldset.dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  legend {
    padding: 0 var(--space-2);
    text-align: left;
    font-weight: 600;
  }
  label {
    position: relative;
    display: inline-block;
    margin: 0 var(--space-2) var(--space-2) 0;
  }
  input {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .choose,
  button {
    display: inline-block;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    font: inherit;
    font-weight: 600;
  }
  .choose {
    color: var(--accent);
    background: var(--surface);
  }
  input:focus-visible + .choose {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  button {
    color: var(--on-accent);
    background: var(--accent);
    cursor: pointer;
  }
  button:disabled {
    border-color: var(--border-strong);
    background: var(--tray);
    color: var(--faint);
    cursor: default;
  }
  #upload-limit {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .filename {
    margin-bottom: 0;
    font-weight: 600;
  }
  .filename,
  code {
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--bad);
  }
</style>
