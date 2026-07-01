<script lang="ts">
    import { parserContext } from '$lib/parsers/ParserContext.svelte';
    import { ClassParser } from '$lib/parsers/ClassParser';
    import { SubclassParser } from '$lib/parsers/SubclassParser';
    import { SpeciesParser } from '$lib/parsers/SpeciesParser';
    import { FeatParser } from '$lib/parsers/FeatParser';
    import { BackgroundParser } from '$lib/parsers/BackgroundParser';
    import { SpellParser } from '$lib/parsers/SpellParser';
    import { downloadExcel } from '$lib/utils/excel';

    let rawJson = $state('');
    let selectedType = $state('classes');
    let error = $state<string | null>(null);
    
    type ResultData = { rows: Record<string, unknown>[], sheet: string, file: string };
    let results = $state<Record<string, ResultData> | null>(null);

    // UX States
    let isProcessing = $state(false);
    let downloadingStates = $state<Record<string, boolean>>({});

    async function processPayload() {
        error = null;
        results = null;
        isProcessing = true;

        // Yield to the browser to paint the "Processing..." button state
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const data = JSON.parse(rawJson);
            const payload = data.data || data.results || (Array.isArray(data) ? data : [data]);

            if (selectedType === 'classes') {
                const parser = new ClassParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            } else if (selectedType === 'subclasses') {
                const parser = new SubclassParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            } else if (selectedType === 'species') {
                const parser = new SpeciesParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            } else if (selectedType === 'feats') {
                const parser = new FeatParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            } else if (selectedType === 'backgrounds') {
                const parser = new BackgroundParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            } else if (selectedType === 'spells') {
                const parser = new SpellParser(parserContext);
                results = parser.execute(payload) as Record<string, ResultData>;
            }
            
        } catch (err) {
            if (err && typeof err === 'object' && 'issues' in err) {
                const zodError = err as { issues: { message: string }[] };
                error = `Validation Failed: ${zodError.issues[0].message}`;
            } else if (err instanceof Error) {
                error = err.message;
            } else {
                error = 'An unknown processing error occurred.';
            }
        } finally {
            isProcessing = false;
        }
    }

    async function handleDownload(rows: Record<string, unknown>[], sheet: string, file: string) {
        // Prevent double clicks
        if (downloadingStates[file]) return;
        
        downloadingStates[file] = true;

        // Yield to the browser to paint the "Building file..." text before the thread blocks
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            downloadExcel(rows, sheet, file);
        } catch (err) {
            error = "Failed to build Excel file.";
            console.error(err);
        } finally {
            downloadingStates[file] = false;
        }
    }
</script>

<div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">D&D 5e Import Converter</h1>
    <p style="color: #666; margin-bottom: 24px;">Strict Typed Architecture</p>

    <div style="margin-bottom: 16px;">
        <label for="payloadType" style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Payload Type</label>
        <select id="payloadType" bind:value={selectedType} disabled={isProcessing} style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 200px; background: {isProcessing ? '#f3f4f6' : '#fff'};">
            <option value="classes">Classes</option>
            <option value="subclasses">Subclasses</option>
            <option value="species">Species</option>
            <option value="feats">Feats</option>
            <option value="backgrounds">Backgrounds</option>
            <option value="spells">Spells</option>
        </select>
    </div>

    <div style="margin-bottom: 16px;">
        <label for="rawJson" style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Paste JSON Payload</label>
        <textarea 
            id="rawJson"
            bind:value={rawJson} 
            disabled={isProcessing}
            rows="10" 
            style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; background: {isProcessing ? '#f3f4f6' : '#fff'};"
            placeholder="Accepts raw array or DDB wrapped payload..."
        ></textarea>
    </div>

    <button 
        onclick={processPayload}
        disabled={isProcessing}
        style="background: {isProcessing ? '#93c5fd' : '#2563eb'}; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: {isProcessing ? 'wait' : 'pointer'}; font-weight: 500; transition: background 0.2s;"
    >
        {isProcessing ? '⏳ Parsing JSON...' : 'Process Payload'}
    </button>

    {#if error}
        <div style="margin-top: 20px; padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 14px;">
            {error}
        </div>
    {/if}

    {#if results}
        <div style="margin-top: 24px;">
            <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">Ready for Download</h2>
            {#each Object.values(results) as result (result.file)}
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 8px;">
                    <div>
                        <strong style="font-size: 14px;">{result.file}</strong>
                        <span style="margin-left: 8px; font-size: 12px; padding: 2px 8px; background: #dcfce3; color: #166534; border-radius: 12px;">
                            {result.rows.length} rows
                        </span>
                    </div>
                    <button 
                        onclick={() => handleDownload(result.rows, result.sheet, result.file)}
                        disabled={downloadingStates[result.file]}
                        style="background: {downloadingStates[result.file] ? '#9ca3af' : '#16a34a'}; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: {downloadingStates[result.file] ? 'wait' : 'pointer'}; font-size: 12px; font-weight: 500; min-width: 110px; transition: background 0.2s;"
                    >
                        {downloadingStates[result.file] ? '⏳ Building...' : '↓ Download'}
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>