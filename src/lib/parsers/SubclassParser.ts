import { z } from 'zod';
import { DdbSubclassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

/** Strips DDB level prefixes like "8: Ability Score Increase" → "Ability Score Increase" */
const stripLevelPrefix = (name: string) => name.replace(/^\d+:\s*/, '').trim();

/** Yield to the browser event loop — prevents "unresponsive script" on large payloads. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

export class SubclassParser {
    constructor(private context: ParserContext) {}

    async execute(rawData: unknown) {
        const parsedData = z.array(DdbSubclassSchema).parse(rawData);
        const deduped    = ExtractionService.markLegacyDuplicates(parsedData);

        const subclassRows: Record<string, unknown>[] = [];
        const featureRows:  Record<string, unknown>[] = [];

        // Identify shared base class features by counting ID occurrences across subclasses.
        const featureIdCount = new Map<number, number>();
        for (const sub of deduped) {
            const seen = new Set<number>();
            for (const f of sub.classFeatures) {
                if (f.id != null && !seen.has(f.id)) {
                    seen.add(f.id);
                    featureIdCount.set(f.id, (featureIdCount.get(f.id) ?? 0) + 1);
                }
            }
        }
        const isShared = (id: number | undefined) =>
            id != null && (featureIdCount.get(id) ?? 0) > 1;

        const hasBaseFeatureIds = this.context.hasClassFeatureIds();

        for (let i = 0; i < deduped.length; i++) {
            // Yield every 50 subclasses so the browser stays responsive.
            if (i > 0 && i % 50 === 0) await tick();

            const sub        = deduped[i];
            const sourceId   = sub.sources?.[0]?.sourceId ?? 0;
            const parentName = this.context.getClassName(sub.parentClassId);
            const sourceName = this.context.getSourceName(sourceId);
            const uploadId   = `${sourceId}:${sub.name}`;
            const classUploadId = this.context.getClassUploadId(sub.parentClassId);

            subclassRows.push({
                uploadId,
                classUploadId,
                className:     parentName,
                name:          sub.name,
                description:   ExtractionService.cleanText(sub.description),
                source:        sourceName,
                link:          sub.moreDetailsUrl ? `https://www.dndbeyond.com${sub.moreDetailsUrl}` : '',
                canCastSpells: sub.spellCastingAbilityId != null ? 'true' : 'false',
                sortOrder:     i + 1
            });

            const features = sub.classFeatures.filter(f =>
                !isShared(f.id) && !(hasBaseFeatureIds && this.context.isBaseClassFeature(f.id))
            );

            for (const feature of features) {
                const featText   = ExtractionService.cleanText(feature.description);
                const featSrcId  = feature.definition?.sources?.[0]?.sourceId ?? sourceId;
                const featName   = stripLevelPrefix(feature.name ?? '');
                featureRows.push({
                    uploadId:         `${featSrcId}:${sub.name}:${featName}:${feature.requiredLevel ?? 3}`,
                    classUploadId,
                    subclassUploadId: uploadId,
                    className:        parentName,
                    subclassName:     sub.name,
                    name:             featName,
                    requiredLevel:    feature.requiredLevel ?? 3,
                    description:      featText,
                    url:              feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
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