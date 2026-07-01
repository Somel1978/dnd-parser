import { z } from 'zod';
import { DdbSpeciesSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class SpeciesParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSpeciesSchema).parse(rawData);

        // Remap fullName → name so markLegacyDuplicates can group by it.
        // uploadId uses the original fullName + sources[0].sourceId before any remapping.
        const deduped = ExtractionService.markLegacyDuplicates(
            parsedData.map(sp => ({ ...sp, name: sp.fullName }))
        );

        const speciesRows: Record<string, unknown>[] = [];
        const traitRows:   Record<string, unknown>[] = [];

        for (let i = 0; i < deduped.length; i++) {
            const sp         = deduped[i];
            const sourceId   = sp.sources?.[0]?.sourceId ?? 0;
            const uploadId   = `${sourceId}:${sp.name}`;
            const sourceName = this.context.getSourceName(sourceId);

            speciesRows.push({
                uploadId,
                name:        sp.name,
                description: ExtractionService.cleanText(sp.description),
                source:      sourceName,
                link:        sp.moreDetailsUrl ? `https://www.dndbeyond.com${sp.moreDetailsUrl}` : '',
                isSubrace:   sp.isSubRace ? 'true' : 'false',
                isLegacy:    sp.isLegacy  ? 'true' : 'false',
                sortOrder:   i + 1
            });

            let explicitSpeedFound = false;
            let explicitSizeFound  = false;

            for (const trait of sp.racialTraits) {
                const def      = trait.definition;
                const rawDesc  = def?.description ?? trait.description ?? '';
                const desc     = ExtractionService.cleanText(rawDesc);
                const speeds   = ExtractionService.extractSpeed(desc);
                const sz       = ExtractionService.extractSize(desc);
                const traitName = def?.name ?? trait.name ?? '';
                const traitSrcId = def?.sources?.[0]?.sourceId ?? sourceId;

                if (speeds['WALK']) explicitSpeedFound = true;
                if (sz.fixed || sz.choices || /size|medium|small|tiny|large/i.test(desc)) explicitSizeFound = true;

                traitRows.push({
                    uploadId:     `${traitSrcId}:${sp.name}:${traitName}`,
                    speciesName:  sp.name,
                    name:         traitName,
                    description:  desc,
                    requiredLevel: def?.requiredLevel ?? trait.requiredLevel ?? 1,
                    size:         sz.fixed, sizeChoices: sz.choices,
                    senses:       ExtractionService.extractSenses(desc),
                    WALK: speeds['WALK'] ?? '', FLY: speeds['FLY'] ?? '',
                    SWIM: speeds['SWIM'] ?? '', CLIMB: speeds['CLIMB'] ?? '', BURROW: speeds['BURROW'] ?? '',
                    ...ExtractionService.buildSpeciesTraitGrantRow(desc)
                });
            }

            if (!explicitSpeedFound || !explicitSizeFound) {
                const ws = sp.weightSpeeds.normal;
                traitRows.push({
                    uploadId:     `${sourceId}:${sp.name}:Base Physiology`,
                    speciesName:  sp.name,
                    name:         'Base Physiology',
                    description:  'Inherent physical characteristics.',
                    requiredLevel: 1,
                    size:         explicitSizeFound ? '' : ExtractionService.mapSizeId(sp.sizeId),
                    sizeChoices:  '', senses: '',
                    WALK:   explicitSpeedFound ? '' : (ws.walk || ''),
                    FLY:    ws.fly    || '', SWIM:   ws.swim   || '',
                    CLIMB:  ws.climb  || '', BURROW: ws.burrow || '',
                    ...ExtractionService.getEmptyGrants()
                });
            }
        }

        return {
            species:       { rows: speciesRows, sheet: 'species',       file: 'species.xlsx' },
            speciesTraits: { rows: traitRows,   sheet: 'speciesTraits', file: 'speciesTraits.xlsx' }
        };
    }
}