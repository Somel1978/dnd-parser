import { z } from 'zod';
import { DdbClassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

type ClassData = z.infer<typeof DdbClassSchema>;

const CASTER_TYPE: Record<number, string> = { 1: 'FULL', 2: 'HALF', 3: 'THIRD', 6: 'WARLOCK' };
const SUBCLASS_KEYWORDS = ['subclass', 'archetype', 'tradition', 'order', 'circle', 'domain', 'college', 'path', 'patron', 'conclave'];

export class ClassParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData: ClassData[] = z.array(DdbClassSchema).parse(rawData);
        const classRows: Record<string, unknown>[] = [];
        const featureRows: Record<string, unknown>[] = [];
        const spellSlotRows: Record<string, unknown>[] = [];
        const spellsKnownRows: Record<string, unknown>[] = [];

        for (const cls of parsedData) {
            this.context.registerClass(cls.id, cls.name);

            // Find the proficiencies feature for skill/ST extraction
            const profFeature = cls.classFeatures.find(f =>
                f.name === 'Proficiencies' || (f.name ?? '').toLowerCase().startsWith('core ')
            );
            const profText = ExtractionService.cleanText(profFeature?.description ?? '');
            const descText = ExtractionService.cleanText(cls.description);
            const allText = `${profText}\n${descText}`;

            const profData = ExtractionService.extractProficiencies(profText || allText);

            // Subclass available level — find first feature with a subclass keyword at level ≤5
            const subclassFeature = cls.classFeatures
                .filter(f => (f.requiredLevel ?? 99) >= 1 && (f.requiredLevel ?? 99) <= 5)
                .find(f => SUBCLASS_KEYWORDS.some(kw => (f.name ?? '').toLowerCase().includes(kw)));
            const subclassAvailableAtLevel = subclassFeature?.requiredLevel ?? 3;

            classRows.push({
                name: cls.name,
                hitDice: cls.hitDice ?? '',
                canCastSpells: cls.canCastSpells ? 'true' : 'false',
                subclassAvailableAtLevel,
                primaryAbilities: ExtractionService.mapAbilityIds(cls.primaryAbilities),
                equipmentDescription: ExtractionService.cleanText(cls.equipmentDescription),
                description: descText,
                source: this.context.getSourceName(cls.sources?.[0]?.sourceId),
                link: cls.moreDetailsUrl ? `https://www.dndbeyond.com${cls.moreDetailsUrl}` : '',
                sortOrder: classRows.length + 1,
                skillChoiceCount: profData.skillCount || '',
                grantsSavingThrows: profData.stGrants || ExtractionService.extractSavingThrows(allText),
                skillPool: profData.skillPool
            });

            // Class features — register IDs for subclass deduplication, extract grants
            for (const feature of cls.classFeatures) {
                this.context.registerClassFeatureId(feature.id!);
                const featText = ExtractionService.cleanText(feature.description);
                featureRows.push({
                    className: cls.name,
                    name: feature.name ?? '',
                    requiredLevel: feature.requiredLevel ?? 1,
                    description: featText,
                    url: feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...ExtractionService.buildGrantRow(featText)
                });
            }

            // Spell slots and spells known (casters only)
            if (!cls.canCastSpells || !cls.spellRules) continue;
            const rules = cls.spellRules;
            const ctType = CASTER_TYPE[rules.multiClassSpellSlotDivisor as number] ?? 'FULL';

            for (let lv = 1; lv <= 20; lv++) {
                // levelSpellSlots is an array of arrays indexed by level
                const slots: number[] = Array.isArray(rules.levelSpellSlots)
                    ? (rules.levelSpellSlots[lv] ?? [])
                    : (rules.levelSpellSlots?.[lv] ?? []);

                spellSlotRows.push({
                    'Class Name': cls.name, 'Subclass Name': '', 'Caster Type': ctType, 'Level': lv,
                    'Slot 1': slots[0] ?? 0, 'Slot 2': slots[1] ?? 0, 'Slot 3': slots[2] ?? 0,
                    'Slot 4': slots[3] ?? 0, 'Slot 5': slots[4] ?? 0, 'Slot 6': slots[5] ?? 0,
                    'Slot 7': slots[6] ?? 0, 'Slot 8': slots[7] ?? 0, 'Slot 9': slots[8] ?? 0
                });

                const knownArr: number[] = Array.isArray(rules.levelSpellKnownMaxes) ? rules.levelSpellKnownMaxes : [];
                const prepArr: number[] = Array.isArray(rules.levelPreparedSpellMaxes) ? rules.levelPreparedSpellMaxes : [];
                const cantripsArr: number[] = Array.isArray(rules.levelCantripsKnownMaxes) ? rules.levelCantripsKnownMaxes : [];

                spellsKnownRows.push({
                    'Class Name': cls.name, 'Subclass Name': '', 'Level': lv,
                    'Cantrips': cantripsArr[lv] ?? '',
                    'Prepared': prepArr.length > 1 ? (prepArr[lv] ?? '') : (knownArr.length > 1 ? (knownArr[lv] ?? '') : ''),
                    'Additional': '', 'Note': ''
                });
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