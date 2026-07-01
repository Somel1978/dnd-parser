import { z } from 'zod';
import { DdbSubclassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class SubclassParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSubclassSchema).parse(rawData);
        const subclassRows: Record<string, unknown>[] = [];
        const featureRows: Record<string, unknown>[] = [];

        for (let i = 0; i < parsedData.length; i++) {
            const sub = parsedData[i];
            const sourceName = this.context.getSourceName(sub.sources?.[0]?.sourceId);
            const parentClassName = this.context.getClassName(sub.parentClassId);

            subclassRows.push({
                className: parentClassName,
                name: sub.name,
                description: ExtractionService.cleanText(sub.description),
                source: sourceName,
                link: sub.moreDetailsUrl ? `https://www.dndbeyond.com${sub.moreDetailsUrl}` : '',
                canCastSpells: sub.spellCastingAbilityId ? 'true' : 'false',
                sortOrder: i + 1
            });

            for (const feature of sub.classFeatures) {
                featureRows.push({
                    className: parentClassName,
                    subclassName: sub.name,
                    name: feature.name || '',
                    requiredLevel: feature.requiredLevel || 3,
                    description: ExtractionService.cleanText(feature.description),
                    url: feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...ExtractionService.getEmptyGrants()
                });
            }
        }
        return { 
            subclasses: { rows: subclassRows, sheet: 'subclasses', file: 'subclasses.xlsx' },
            subclassFeatures: { rows: featureRows, sheet: 'subclassFeatures', file: 'subclassFeatures.xlsx' }
        };
    }
}