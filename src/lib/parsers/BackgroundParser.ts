import { z } from 'zod';
import { DdbBackgroundSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class BackgroundParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbBackgroundSchema).parse(rawData);
        const deduped    = ExtractionService.markLegacyDuplicates(parsedData);

        const rows: Record<string, unknown>[] = [];

        for (let i = 0; i < deduped.length; i++) {
            const bg       = deduped[i];
            const sourceId = bg.sources?.[0]?.sourceId ?? 0;
            const uploadId = `${sourceId}:${bg.name}`;

            const skillTxt = ExtractionService.cleanText(bg.skillProficienciesDescription) || ExtractionService.cleanText(bg.description);
            const toolTxt  = ExtractionService.cleanText(bg.toolProficienciesDescription)  || ExtractionService.cleanText(bg.description);
            const langTxt  = ExtractionService.cleanText(bg.languagesDescription)          || ExtractionService.cleanText(bg.description);
            const fullTxt  = ExtractionService.cleanText(bg.description);
            const short    = ExtractionService.cleanText(bg.cardDescription ?? bg.shortDescription ?? '');

            rows.push({
                uploadId,
                name:             bg.name,
                shortDescription: short.length > 300 ? short.slice(0, 300) + '…' : short,
                featureName:      bg.featureName ?? '',
                grantsFeatCategory: '',
                grantsFeatId:     '',
                ...ExtractionService.buildBackgroundGrantRow(skillTxt, toolTxt, langTxt, fullTxt),
                url:       bg.moreDetailsUrl ? `https://www.dndbeyond.com${bg.moreDetailsUrl}` : '',
                sortOrder: i + 1
            });
        }

        return { backgrounds: { rows, sheet: 'backgrounds', file: 'backgrounds.xlsx' } };
    }
}