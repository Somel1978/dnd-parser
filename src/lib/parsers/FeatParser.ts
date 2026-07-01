import { z } from 'zod';
import { DdbFeatSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class FeatParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbFeatSchema).parse(rawData);
        const rows: Record<string, unknown>[] = [];

        for (let i = 0; i < parsedData.length; i++) {
            const feat = parsedData[i];
            const desc = ExtractionService.cleanText(feat.description);
            const categories = feat.categories.map(c => c.tagName).join(',');
            
            let asiAmount = '', asiFixed = '', asiChoices = '';
            const asiMatch = desc.match(/Increase your ([A-Za-z ]+?)\s+(?:score\s+)?by\s+(\d+)/i);
            if (asiMatch) {
                asiAmount = asiMatch[2];
                const statStr = asiMatch[1].trim();
                if (/ability score/i.test(statStr)) asiChoices = 'Strength,Dexterity,Constitution,Intelligence,Wisdom,Charisma';
                else if (/\s+or\s+/i.test(statStr)) asiChoices = statStr.split(/\s+or\s+/i).map(s => s.trim()).join(',');
                else asiFixed = statStr;
            }

            rows.push({
                name: feat.name,
                description: desc,
                snippet: ExtractionService.cleanText(feat.snippet),
                repeatable: feat.isRepeatable ? 'true' : 'false',
                categories: categories,
                prerequisites: '',
                detailsUrl: feat.moreDetailsUrl ? `https://www.dndbeyond.com${feat.moreDetailsUrl}` : '',
                isEpicBoon: (categories.toLowerCase().includes('epic boon') || feat.name.toLowerCase().startsWith('epic boon')) ? 'true' : 'false',
                asiAmount: asiAmount,
                asiStatFixed: asiFixed,
                asiStatChoices: asiChoices,
                ...ExtractionService.getEmptyGrants(),
                sortOrder: i + 1
            });
        }
        return { feats: { rows, sheet: 'feats', file: 'feats.xlsx' } };
    }
}