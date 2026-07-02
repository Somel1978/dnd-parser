<script lang="ts">
    type FileKey = 'classes' | 'subclasses' | 'species' | 'backgrounds' | 'feats' | 'spells';

    const SECTIONS = [
        {
            key: 'class' as const,
            title: 'Class Dependent',
            payloads: [
                { key: 'classes' as FileKey,    label: 'Classes',    hint: 'Required first — builds class registry for subclasses' },
                { key: 'subclasses' as FileKey, label: 'Subclasses', hint: 'Requires Classes to be processed first' },
            ]
        },
        { key: 'species' as const, title: 'Species', payloads: [{ key: 'species' as FileKey, label: 'Species & Traits', hint: '' }] },
        { key: 'backgrounds' as const, title: 'Backgrounds', payloads: [{ key: 'backgrounds' as FileKey, label: 'Backgrounds', hint: '' }] },
        { key: 'feats' as const, title: 'Feats', payloads: [{ key: 'feats' as FileKey, label: 'Feats', hint: '' }] },
        { key: 'spells' as const, title: 'Spells', payloads: [{ key: 'spells' as FileKey, label: 'Spells', hint: '' }] },
    ];

    let files    = $state<Partial<Record<FileKey, File>>>({});
    let status   = $state<Partial<Record<FileKey, 'idle'|'processing'|'done'|'error'>>>({});
    let errors   = $state<Partial<Record<FileKey, string>>>({});
    let results  = $state<Partial<Record<FileKey, Record<string,string>>>>({});  // filename → base64

    // classMap persisted between Classes and Subclasses runs
    let classMap = $state<[number,{name:string;uploadId:string}][] | null>(null);

    const classesLoaded = $derived(classMap !== null && classMap.length > 0);

    function handleFile(key: FileKey, e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        files[key] = input.files?.[0] ?? undefined;
        errors[key] = undefined;
        results[key] = undefined;
        if (status[key] !== 'processing') status[key] = 'idle';
    }

    async function convert(key: FileKey) {
        const file = files[key];
        if (!file) return;
        status[key] = 'processing';
        errors[key] = undefined;
        results[key] = undefined;

        try {
            const form = new FormData();
            form.append('type', key);
            form.append('file', file);
            if (key === 'subclasses' && classMap) {
                form.append('classMap', JSON.stringify(classMap));
            }

            const res = await fetch('/api/process', { method: 'POST', body: form });
            const json = await res.json() as { files?: Record<string,string>; classMap?: [number,{name:string;uploadId:string}][]; error?: string };

            if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);

            results[key] = json.files ?? {};
            if (json.classMap) classMap = json.classMap;
            status[key] = 'done';
        } catch (err) {
            errors[key] = err instanceof Error ? err.message : String(err);
            status[key] = 'error';
        }
    }

    function download(filename: string, b64: string) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }
</script>

<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :global(body) { font-family: 'Inter', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }

    .app { max-width: 760px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    h1 { font-size: 1.375rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem; }
    .subtitle { font-size: 0.8125rem; color: #475569; margin-bottom: 2rem; }

    .section { background: #131820; border: 1px solid #1e2840; border-radius: 10px; margin-bottom: 1rem; overflow: hidden; }
    .section-head { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.125rem; background: #0d1220; border-bottom: 1px solid #1e2840; }
    .section-title { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
    .badge { font-size: 0.625rem; font-weight: 700; padding: 0.125rem 0.5rem; border-radius: 99px; background: #14532d33; color: #86efac; border: 1px solid #14532d66; }
    .section-body { padding: 1rem 1.125rem; display: flex; flex-direction: column; gap: 1rem; }

    .payload { display: flex; flex-direction: column; gap: 0.5rem; }
    .payload + .payload { padding-top: 1rem; border-top: 1px solid #1e2840; }
    .payload-label { font-size: 0.75rem; font-weight: 600; color: #94a3b8; display: flex; align-items: center; gap: 0.5rem; }
    .hint { font-size: 0.6875rem; color: #334155; }
    .dep-ok   { font-size: 0.6875rem; color: #4ade80; font-weight: 500; }
    .dep-warn { font-size: 0.6875rem; color: #fb923c; font-weight: 500; }

    .file-row { display: flex; gap: 0.625rem; align-items: center; }
    .file-wrap { flex: 1; }
    input[type="file"] {
        width: 100%; padding: 0.5rem 0.75rem; background: #0b0f1a;
        border: 1px solid #1e2840; border-radius: 6px; color: #64748b;
        font-size: 0.75rem; cursor: pointer;
    }
    input[type="file"]:disabled { opacity: 0.4; cursor: not-allowed; }
    input[type="file"]::file-selector-button {
        background: #1e2840; border: none; color: #94a3b8;
        padding: 0.25rem 0.625rem; border-radius: 4px;
        font-size: 0.6875rem; font-weight: 600; cursor: pointer; margin-right: 0.625rem;
    }

    .btn {
        flex-shrink: 0; font-size: 0.75rem; font-weight: 600;
        padding: 0.4375rem 1rem; border: none; border-radius: 5px;
        cursor: pointer; white-space: nowrap;
    }
    .btn-primary { background: #1d4ed8; color: #fff; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #1e2840; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .results { display: flex; flex-wrap: wrap; gap: 0.375rem; padding-top: 0.25rem; }
    .chip { display: flex; align-items: center; gap: 0.375rem; padding: 0.3125rem 0.5rem 0.3125rem 0.625rem; background: #0b1120; border: 1px solid #1e2840; border-radius: 5px; }
    .chip-name { font-size: 0.6875rem; color: #475569; font-family: monospace; }
    .btn-dl { font-size: 0.6875rem; font-weight: 700; padding: 0.1875rem 0.5rem; border: 1px solid #14532d88; border-radius: 4px; cursor: pointer; background: transparent; color: #4ade80; }
    .btn-dl:hover { background: #14532d44; }

    .error { font-size: 0.75rem; color: #fca5a5; background: #1f0f0f; border: 1px solid #7f1d1d44; border-radius: 4px; padding: 0.5rem 0.75rem; }

    .cache-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1.125rem; border-top: 1px solid #1e2840; background: #0d1220; }
    .cache-label { font-size: 0.6875rem; color: #334155; }
    .cache-ok { font-size: 0.6875rem; color: #4ade80; font-weight: 600; }
    .btn-clear { margin-left: auto; font-size: 0.6875rem; padding: 0.25rem 0.625rem; border: 1px solid #1e2840; border-radius: 4px; background: transparent; color: #475569; cursor: pointer; }
    .btn-clear:hover { color: #f87171; border-color: #f87171; }
</style>

<div class="app">
    <h1>D&amp;D 5e Import Converter</h1>
    <p class="subtitle">Convert D&amp;D Beyond JSON payloads into platform import files — processing runs server-side</p>

    {#each SECTIONS as section (section.key)}
        <div class="section">
            <div class="section-head">
                <span class="section-title">{section.title}</span>
                {#if section.payloads.some(p => status[p.key] === 'done')}
                    <span class="badge">✓ done</span>
                {/if}
                {#if section.payloads.some(p => status[p.key] === 'processing')}
                    <div class="spinner"></div>
                {/if}
            </div>

            <div class="section-body">
                {#each section.payloads as payload (payload.key)}
                    {@const key = payload.key}
                    {@const isSubclasses = key === 'subclasses'}
                    {@const disabled = isSubclasses && !classesLoaded}
                    <div class="payload">
                        <div class="payload-label">
                            {payload.label}
                            {#if payload.hint && !isSubclasses}
                                <span class="hint">{payload.hint}</span>
                            {/if}
                            {#if isSubclasses}
                                {#if classesLoaded}
                                    <span class="dep-ok">✓ {classMap?.length} classes loaded</span>
                                {:else}
                                    <span class="dep-warn">⚠ convert Classes first</span>
                                {/if}
                            {/if}
                        </div>
                        <div class="file-row">
                            <div class="file-wrap">
                                <input type="file" accept=".json,.txt"
                                    disabled={disabled || status[key] === 'processing'}
                                    onchange={(e) => handleFile(key, e)} />
                            </div>
                            <button class="btn btn-primary"
                                disabled={!files[key] || disabled || status[key] === 'processing'}
                                onclick={() => convert(key)}>
                                {#if status[key] === 'processing'}
                                    <div class="spinner"></div>
                                {:else}
                                    Convert
                                {/if}
                            </button>
                        </div>

                        {#if errors[key]}
                            <div class="error">{errors[key]}</div>
                        {/if}

                        {#if results[key]}
                            <div class="results">
                                {#each Object.entries(results[key]!) as [filename, b64] (filename)}
                                    <div class="chip">
                                        <span class="chip-name">{filename}</span>
                                        <button class="btn-dl" onclick={() => download(filename, b64)}>↓</button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            {#if section.key === 'class'}
                <div class="cache-bar">
                    <span class="cache-label">Class cache</span>
                    {#if classesLoaded}
                        <span class="cache-ok">{classMap?.length} classes in session</span>
                    {:else}
                        <span class="cache-label">empty</span>
                    {/if}
                    <button class="btn-clear" onclick={() => { classMap = null; }}>Clear</button>
                </div>
            {/if}
        </div>
    {/each}
</div>