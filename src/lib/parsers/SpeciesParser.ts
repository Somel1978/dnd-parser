import { z } from 'zod';
import { DdbSpeciesSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class SpeciesParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSpeciesSchema).parse(rawData);
        const speciesRows: Record<string, unknown>[] = [];
        const traitRows: Record<string, unknown>[] = [];

        for (let i = 0; i < parsedData.length; i++) {
            const sp = parsedData[i];
            // Source lives at the top-level species object
            const sourceName = this.context.getSourceName(sp.sources?.[0]?.sourceId);

            speciesRows.push({
                name: sp.fullName,
                description: ExtractionService.cleanText(sp.description),
                source: sourceName,
                link: sp.moreDetailsUrl ? `https://www.dndbeyond.com${sp.moreDetailsUrl}` : '',
                isSubrace: sp.isSubRace ? 'true' : 'false',
                isLegacy: sp.isLegacy ? 'true' : 'false',
                sortOrder: i + 1
            });

            let explicitSpeedFound = false;
            let explicitSizeFound = false;

            for (const trait of sp.racialTraits) {
                const def = trait.definition;
                const rawDesc = def?.description ?? trait.description ?? '';
                const desc = ExtractionService.cleanText(rawDesc);
                const speeds = ExtractionService.extractSpeed(desc);
                const sz = ExtractionService.extractSize(desc);

                if (speeds['WALK']) explicitSpeedFound = true;
                if (sz.fixed || sz.choices || /size|medium|small|tiny|large/i.test(desc)) explicitSizeFound = true;

                traitRows.push({
                    speciesName: sp.fullName,
                    name: def?.name ?? trait.name ?? '',
                    description: desc,
                    requiredLevel: def?.requiredLevel ?? trait.requiredLevel ?? 1,
                    size: sz.fixed,
                    sizeChoices: sz.choices,
                    // grantsSenses is the canonical senses field for species traits
                    senses: ExtractionService.extractSenses(desc),
                    WALK: speeds['WALK'] ?? '', FLY: speeds['FLY'] ?? '',
                    SWIM: speeds['SWIM'] ?? '', CLIMB: speeds['CLIMB'] ?? '', BURROW: speeds['BURROW'] ?? '',
                    // Species trait grants (grantsSenses blank — covered by dedicated senses column above)
                    ...ExtractionService.buildSpeciesTraitGrantRow(desc)
                });
            }

            // Synthetic "Base Physiology" row if neither speed nor size was found in any trait
            if (!explicitSpeedFound || !explicitSizeFound) {
                const ws = sp.weightSpeeds.normal;
                traitRows.push({
                    speciesName: sp.fullName,
                    name: 'Base Physiology',
                    description: 'Inherent physical characteristics.',
                    requiredLevel: 1,
                    size: explicitSizeFound ? '' : ExtractionService.mapSizeId(sp.sizeId),
                    sizeChoices: '', senses: '',
                    WALK: explicitSpeedFound ? '' : (ws.walk || ''),
                    FLY: ws.fly || '', SWIM: ws.swim || '', CLIMB: ws.climb || '', BURROW: ws.burrow || '',
                    ...ExtractionService.getEmptyGrants()
                });
            }
        }

        return {
            species: { rows: speciesRows, sheet: 'species', file: 'species.xlsx' },
            speciesTraits: { rows: traitRows, sheet: 'speciesTraits', file: 'speciesTraits.xlsx' }
        };
    }
}