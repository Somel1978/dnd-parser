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
        const hasBaseFeatureIds = this.context.hasClassFeatureIds();

        for (let i = 0; i < parsedData.length; i++) {
            const sub = parsedData[i];
            const parentClassName = this.context.getClassName(sub.parentClassId);
            const sourceName = this.context.getSourceName(sub.sources?.[0]?.sourceId);

            subclassRows.push({
                className: parentClassName,
                name: sub.name,
                description: ExtractionService.cleanText(sub.description),
                source: sourceName,
                link: sub.moreDetailsUrl ? `https://www.dndbeyond.com${sub.moreDetailsUrl}` : '',
                canCastSpells: sub.spellCastingAbilityId != null ? 'true' : 'false',
                sortOrder: i + 1
            });

            // Filter out base class features if we have the cache from ClassParser
            const features = hasBaseFeatureIds
                ? sub.classFeatures.filter(f => !this.context.isBaseClassFeature(f.id))
                : sub.classFeatures;

            for (const feature of features) {
                const featText = ExtractionService.cleanText(feature.description);
                featureRows.push({
                    className: parentClassName,
                    subclassName: sub.name,
                    name: feature.name ?? '',
                    requiredLevel: feature.requiredLevel ?? 3,
                    description: featText,
                    url: feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...ExtractionService.buildGrantRow(featText)
                });
            }
        }

        return {
            subclasses: { rows: subclassRows, sheet: 'subclasses', file: 'subclasses.xlsx' },
            subclassFeatures: {
                rows: featureRows,
                sheet: 'subclassFeatures',
                file: 'subclassFeatures.xlsx',
                note: hasBaseFeatureIds ? undefined : 'Process Classes first to filter base class features'
            }
        };
    }
}