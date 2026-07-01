import { z } from 'zod';
import { DdbBackgroundSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class BackgroundParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbBackgroundSchema).parse(rawData);
        const rows: Record<string, unknown>[] = [];

        for (let i = 0; i < parsedData.length; i++) {
            const bg = parsedData[i];
            const featId = bg.grantedFeats?.[0]?.featIds?.[0] || '';

            rows.push({
                name: bg.name,
                shortDescription: ExtractionService.cleanText(bg.shortDescription),
                featureName: '',
                grantsFeatCategory: '',
                grantsFeatId: featId,
                ...ExtractionService.getEmptyGrants(),
                url: bg.moreDetailsUrl ? `https://www.dndbeyond.com${bg.moreDetailsUrl}` : '',
                sortOrder: i + 1
            });
        }
        return { backgrounds: { rows, sheet: 'backgrounds', file: 'backgrounds.xlsx' } };
    }
}