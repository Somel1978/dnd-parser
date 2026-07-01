import { z } from 'zod';
import { DdbSpeciesSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

export class SpeciesParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSpeciesSchema).parse(rawData);
        const speciesRows = [];
        const traitRows = [];

        for (const sp of parsedData) {
            speciesRows.push({
                name: sp.fullName,
                description: ExtractionService.stripHtml(sp.description)
            });

            let explicitSpeedFound = false;
            let explicitSizeFound = false;

            for (const trait of sp.racialTraits) {
                const desc = ExtractionService.stripHtml(trait.definition.description);
                const speeds = ExtractionService.extractSpeed(desc);
                
                if (speeds['WALK']) explicitSpeedFound = true;
                if (/size|medium|small|tiny|large/i.test(desc)) explicitSizeFound = true;

                traitRows.push({
                    speciesName: sp.fullName,
                    name: trait.definition.name,
                    description: desc,
                    WALK: speeds['WALK'] || '',
                    FLY: speeds['FLY'] || ''
                });
            }

            if (!explicitSpeedFound || !explicitSizeFound) {
                traitRows.push({
                    speciesName: sp.fullName,
                    name: "Base Physiology",
                    description: "Inherent physical characteristics.",
                    size: explicitSizeFound ? '' : ExtractionService.mapSizeId(sp.sizeId),
                    WALK: explicitSpeedFound ? '' : sp.weightSpeeds.normal.walk,
                    FLY: sp.weightSpeeds.normal.fly,
                    SWIM: sp.weightSpeeds.normal.swim
                });
            }
        }

        return { 
            species: { rows: speciesRows, sheet: 'species', file: 'species.xlsx' },
            speciesTraits: { rows: traitRows, sheet: 'speciesTraits', file: 'speciesTraits.xlsx' }
        };
    }
}
