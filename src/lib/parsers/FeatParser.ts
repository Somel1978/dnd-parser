import { z } from 'zod';
import { DdbFeatSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class FeatParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbFeatSchema).parse(rawData);

        // Deduplicate: keep one entry per feat name, preferring the newest source (highest sourceId).
        // The payload contains multiple entries — PHB 2014 + PHB 2024 versions, plus
        // repeatable-feat instances that each get their own entry.
        const deduped = ExtractionService.dedupByName(parsedData);

        const rows: Record<string, unknown>[] = [];

        for (let i = 0; i < deduped.length; i++) {
            const feat = deduped[i];
            const desc = ExtractionService.cleanText(feat.description);
            const snippet = ExtractionService.cleanText(feat.snippet);
            const categories = feat.categories.map(c => c.tagName).join(',');
            const isEpicBoon = (categories.toLowerCase().includes('epic boon') ||
                feat.name.toLowerCase().startsWith('epic boon')) ? 'true' : 'false';

            const asi = ExtractionService.extractASI(desc);
            const prereqs = ExtractionService.buildPrerequisites(feat.prerequisites);

            rows.push({
                name: feat.name,
                description: desc,
                snippet,
                repeatable: feat.isRepeatable ? 'true' : 'false',
                categories,
                prerequisites: prereqs,
                detailsUrl: feat.moreDetailsUrl ? `https://www.dndbeyond.com${feat.moreDetailsUrl}` : '',
                isEpicBoon,
                asiAmount: asi.amount,
                asiStatFixed: asi.fixed,
                asiStatChoices: asi.choices,
                ...ExtractionService.buildGrantRow(desc),
                sortOrder: i + 1
            });
        }

        return { feats: { rows, sheet: 'feats', file: 'feats.xlsx' } };
    }
}