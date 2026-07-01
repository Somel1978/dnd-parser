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
                const desc = ExtractionService.cleanText(trait.definition?.description || trait.description);
                const speeds = ExtractionService.extractSpeed(desc);
                
                if (speeds['WALK']) explicitSpeedFound = true;
                if (/size|medium|small|tiny|large/i.test(desc)) explicitSizeFound = true;

                traitRows.push({
                    speciesName: sp.fullName,
                    name: trait.definition?.name || trait.name || '',
                    description: desc,
                    requiredLevel: trait.definition?.requiredLevel || trait.requiredLevel || 1,
                    size: '', sizeChoices: '', senses: '',
                    WALK: speeds['WALK'] || '', FLY: speeds['FLY'] || '',
                    SWIM: speeds['SWIM'] || '', CLIMB: speeds['CLIMB'] || '', BURROW: speeds['BURROW'] || '',
                    ...ExtractionService.getEmptyGrants()
                });
            }

            if (!explicitSpeedFound || !explicitSizeFound) {
                traitRows.push({
                    speciesName: sp.fullName,
                    name: "Base Physiology",
                    description: "Inherent physical characteristics.",
                    requiredLevel: 1,
                    size: explicitSizeFound ? '' : ExtractionService.mapSizeId(sp.sizeId),
                    sizeChoices: '', senses: '',
                    WALK: explicitSpeedFound ? '' : (sp.weightSpeeds.normal.walk || ''),
                    FLY: sp.weightSpeeds.normal.fly || '',
                    SWIM: sp.weightSpeeds.normal.swim || '',
                    CLIMB: sp.weightSpeeds.normal.climb || '',
                    BURROW: sp.weightSpeeds.normal.burrow || '',
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