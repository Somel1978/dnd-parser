import { z } from 'zod';
import { DdbClassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

type ClassData = z.infer<typeof DdbClassSchema>;

interface FeatureGrants {
    [key: string]: string | undefined;
    grantsSkills: string;
    grantsExpertise: string;
    grantsHalfSkills: string;
    grantsSavingThrows: string;
    skillChoiceCount: string;
    skillChoicePool: string;
    savingThrowChoiceCount: string;
    savingThrowChoicePool: string;
    grantsTools: string;
    toolChoiceCount: string;
    toolChoicePool: string;
    grantsLanguages: string;
    languageChoiceCount: string;
    languageChoicePool: string;
    grantsResistances: string;
    grantsImmunities: string;
    grantsVulnerabilities: string;
    grantsInnateSpells: string;
    grantsSpeed: string;
    grantsSenses: string;
}

export class ClassParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData: ClassData[] = z.array(DdbClassSchema).parse(rawData);
        const classRows: Record<string, unknown>[] = [];
        const featureRows: Record<string, unknown>[] = [];
        const spellSlotRows: Record<string, unknown>[] = [];
        const spellsKnownRows: Record<string, unknown>[] = [];

        for (const cls of parsedData) {
            const textContent = ExtractionService.normalizeDescription(cls.description);
            this.context.registerClass(cls.id, cls.name);

            const hitDie = cls.hitDice ? `d${cls.hitDice}` : ExtractionService.extractFromNormalized(textContent, "Hit Die");
            const primaryAbilities = cls.primaryAbilities.length ? ExtractionService.mapAbilityIds(cls.primaryAbilities) : ExtractionService.extractFromNormalized(textContent, "Primary Ability");
            const savingThrows = ExtractionService.extractFromNormalized(textContent, "Saves");

            classRows.push({
                name: cls.name, hitDice: hitDie, canCastSpells: cls.canCastSpells ? 'true' : 'false',
                subclassAvailableAtLevel: 3, primaryAbilities: primaryAbilities,
                equipmentDescription: ExtractionService.normalizeDescription(cls.equipmentDescription),
                description: textContent, source: this.context.getSourceName(cls.sources?.[0]?.sourceId),
                link: cls.moreDetailsUrl ? `https://www.dndbeyond.com${cls.moreDetailsUrl}` : '',
                sortOrder: classRows.length + 1, skillChoiceCount: '', grantsSavingThrows: savingThrows, skillPool: ''
            });

            for (const feature of cls.classFeatures) {
                const featDesc = ExtractionService.normalizeDescription(feature.description);
                const grants: FeatureGrants = ExtractionService.getEmptyGrants();

                // Define as string array to avoid keyof type issues with toLowerCase()
                const patterns: string[] = ['Skills', 'Tools', 'Languages'];
                
                for (const p of patterns) {
                    const text = ExtractionService.extractFromNormalized(featDesc, p);
                    if (text.toLowerCase().includes('choose')) {
                        const match = text.match(/(\d+)\s+from\s+(.+)/i);
                        if (match) {
                            const countKey = `${p.toLowerCase()}ChoiceCount` as keyof FeatureGrants;
                            const poolKey = `${p.toLowerCase()}ChoicePool` as keyof FeatureGrants;
                            grants[countKey] = match[1];
                            grants[poolKey] = match[2];
                        }
                    } else {
                        const grantKey = `grants${p}` as keyof FeatureGrants;
                        grants[grantKey] = text;
                    }
                }

                featureRows.push({
                    className: cls.name, name: feature.name || '',
                    requiredLevel: feature.requiredLevel || 1,
                    description: featDesc,
                    url: feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...grants
                });
            }

            if (cls.canCastSpells && cls.spellRules) {
                const rules = cls.spellRules;
                const ctType = rules.multiClassSpellSlotDivisor === 1 ? 'FULL' : 'HALF';
                for (let lv = 1; lv <= 20; lv++) {
                    const slots = rules.levelSpellSlots?.[lv.toString()] || [];
                    spellSlotRows.push({
                        'Class Name': cls.name, 'Subclass Name': '', 'Caster Type': ctType, 'Level': lv,
                        'Slot 1': slots[0] || 0, 'Slot 2': slots[1] || 0, 'Slot 3': slots[2] || 0,
                        'Slot 4': slots[3] || 0, 'Slot 5': slots[4] || 0, 'Slot 6': slots[5] || 0,
                        'Slot 7': slots[6] || 0, 'Slot 8': slots[7] || 0, 'Slot 9': slots[8] || 0
                    });
                    spellsKnownRows.push({
                        'Class Name': cls.name, 'Subclass Name': '', 'Level': lv,
                        'Cantrips': rules.levelCantripsKnownMaxes?.[lv.toString()] ?? '',
                        'Prepared': rules.levelPreparedSpellMaxes?.[lv.toString()] ?? rules.levelSpellKnownMaxes?.[lv.toString()] ?? '',
                        'Additional': '', 'Note': ''
                    });
                }
            }
        }
        return { 
            classes: { rows: classRows, sheet: 'classes', file: 'classes.xlsx' },
            classFeatures: { rows: featureRows, sheet: 'classFeatures', file: 'classFeatures.xlsx' },
            spellSlots: { rows: spellSlotRows, sheet: 'spellSlots', file: 'spellSlots.xlsx' },
            spellsKnown: { rows: spellsKnownRows, sheet: 'spellsKnown', file: 'spellsKnown.xlsx' }
        };
    }
}