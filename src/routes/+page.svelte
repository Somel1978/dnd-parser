<script lang="ts">
    import { parserContext } from '$lib/parsers/ParserContext.svelte';
    import { SpeciesParser } from '$lib/parsers/SpeciesParser';
    import { downloadExcel } from '$lib/utils/excel';

    let rawJson = $state('');
    let selectedType = $state('species');
    let error = $state<string | null>(null);
    let results = $state<Record<string, { rows: any[], sheet: string, file: string }> | null>(null);

    function processPayload() {
        error = null;
        results = null;
        try {
            const data = JSON.parse(rawJson);
            const payload = data.data || data.results || (Array.isArray(data) ? data : [data]);

            if (selectedType === 'species') {
                const parser = new SpeciesParser(parserContext);
                results = parser.execute(payload);
            } else if (selectedType === 'subclasses') {
                // To be implemented: const parser = new SubclassParser(parserContext);
                // results = parser.execute(payload);
                throw new Error("Subclass parser template ready for implementation.");
            }
            
        } catch (err: any) {
            error = err.issues ? `Validation Failed: ${err.issues[0].message}` : err.message;
        }
    }
</script>

<div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">D&D 5e Import Converter</h1>
    <p style="color: #666; margin-bottom: 24px;">Strict Typed Architecture</p>

    <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Payload Type</label>
        <select bind:value={selectedType} style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 200px;">
            <option value="classes">Classes</option>
            <option value="subclasses">Subclasses</option>
            <option value="species">Species</option>
        </select>
    </div>

    <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Paste JSON Payload</label>
        <textarea 
            bind:value={rawJson} 
            rows="10" 
            style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px;"
            placeholder="Accepts raw array or DDB wrapped payload..."
        ></textarea>
    </div>

    <button 
        onclick={processPayload}
        style="background: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;"
    >
        Process Payload
    </button>

    {#if error}
        <div style="margin-top: 20px; padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 14px;">
            {error}
        </div>
    {/if}

    {#if results}
        <div style="margin-top: 24px;">
            <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">Ready for Download</h2>
            {#each Object.entries(results) as [key, result]}
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 8px;">
                    <div>
                        <strong style="font-size: 14px;">{result.file}</strong>
                        <span style="margin-left: 8px; font-size: 12px; padding: 2px 8px; background: #dcfce3; color: #166534; border-radius: 12px;">
                            {result.rows.length} rows
                        </span>
                    </div>
                    <button 
                        onclick={() => downloadExcel(result.rows, result.sheet, result.file)}
                        style="background: #16a34a; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;"
                    >
                        ↓ Download
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>
