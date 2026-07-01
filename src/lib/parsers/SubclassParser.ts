import { z } from 'zod';
import { DdbSubclassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

/** Strips DDB level prefixes like "8: Ability Score Increase" → "Ability Score Increase" */
const stripLevelPrefix = (name: string) => name.replace(/^\d+:\s*/, '').trim();

export class SubclassParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSubclassSchema).parse(rawData);
        const deduped    = ExtractionService.markLegacyDuplicates(parsedData);

        const subclassRows: Record<string, unknown>[] = [];
        const featureRows:  Record<string, unknown>[] = [];
        const hasBaseFeatureIds = this.context.hasClassFeatureIds();

        for (let i = 0; i < deduped.length; i++) {
            const sub           = deduped[i];
            const sourceId      = sub.sources?.[0]?.sourceId ?? 0;
            const parentName    = this.context.getClassName(sub.parentClassId);
            const sourceName    = this.context.getSourceName(sourceId);
            const uploadId      = `${sourceId}:${sub.name}`;

            subclassRows.push({
                uploadId,
                className:    parentName,
                name:         sub.name,
                description:  ExtractionService.cleanText(sub.description),
                source:       sourceName,
                link:         sub.moreDetailsUrl ? `https://www.dndbeyond.com${sub.moreDetailsUrl}` : '',
                canCastSpells: sub.spellCastingAbilityId != null ? 'true' : 'false',
                sortOrder:    i + 1
            });

            const features = hasBaseFeatureIds
                ? sub.classFeatures.filter(f => !this.context.isBaseClassFeature(f.id))
                : sub.classFeatures;

            for (const feature of features) {
                const featText  = ExtractionService.cleanText(feature.description);
                const featSrcId = feature.definition?.sources?.[0]?.sourceId ?? sourceId;
                const featName  = stripLevelPrefix(feature.name ?? '');
                featureRows.push({
                    uploadId:     `${featSrcId}:${sub.name}:${featName}:${feature.requiredLevel ?? 3}`,
                    className:    parentName,
                    subclassName: sub.name,
                    name:         featName,
                    requiredLevel: feature.requiredLevel ?? 3,
                    description:  featText,
                    url:          feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...ExtractionService.buildGrantRow(featText)
                });
            }
        }

        return {
            subclasses:       { rows: subclassRows, sheet: 'subclasses',       file: 'subclasses.xlsx' },
            subclassFeatures: { rows: featureRows,  sheet: 'subclassFeatures', file: 'subclassFeatures.xlsx' }
        };
    }
}