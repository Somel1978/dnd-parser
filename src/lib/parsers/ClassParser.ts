import { z } from 'zod';
import { DdbClassSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

type ClassData = z.infer<typeof DdbClassSchema>;

const CASTER_TYPE: Record<number, string> = { 1: 'FULL', 2: 'HALF', 3: 'THIRD', 6: 'WARLOCK' };
/** Strips DDB level prefixes like "8: Ability Score Increase" → "Ability Score Increase" */
const stripLevelPrefix = (name: string) => name.replace(/^\d+:\s*/, '').trim();

const SUBCLASS_KEYWORDS = ['subclass', 'archetype', 'tradition', 'order', 'circle', 'domain', 'college', 'path', 'patron', 'conclave'];

function spellRuleValue(collection: unknown, index: number): number | null {
    if (collection == null) return null;
    if (Array.isArray(collection)) {
        const v = collection[index];
        return v != null ? Number(v) : null;
    }
    if (typeof collection === 'object') {
        const v = (collection as Record<string, unknown>)[String(index)];
        return v != null ? Number(v) : null;
    }
    return null;
}

function spellRuleLength(collection: unknown): number {
    if (collection == null) return 0;
    if (Array.isArray(collection)) return collection.filter(v => v != null).length;
    if (typeof collection === 'object') return Object.keys(collection).length;
    return 0;
}

export class ClassParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData: ClassData[] = z.array(DdbClassSchema).parse(rawData);

        // Deduplicate within same sourceId (repeatable instances); keep all source versions.
        // uploadId = `${sourceId}:${name}` is the stable key used by the import server.
        const deduped = ExtractionService.markLegacyDuplicates(parsedData);

        // Register ALL class ID → name mappings before processing.
        // Subclasses reference parentClassId which may belong to any version.
        for (const cls of deduped) {
            this.context.registerClass(cls.id, cls.name);
        }

        const classRows: Record<string, unknown>[] = [];
        const featureRows: Record<string, unknown>[] = [];
        const spellSlotRows: Record<string, unknown>[] = [];
        const spellsKnownRows: Record<string, unknown>[] = [];

        for (const cls of deduped) {
            const sourceId = cls.sources?.[0]?.sourceId ?? 0;
            const uploadId = `${sourceId}:${cls.name}`;

            const profFeature = cls.classFeatures.find(f =>
                f.name === 'Proficiencies' || (f.name ?? '').toLowerCase().startsWith('core ')
            );
            const profText = ExtractionService.cleanText(profFeature?.description ?? '');
            const descText = ExtractionService.cleanText(cls.description);
            const allText  = `${profText}\n${descText}`;
            const profData = ExtractionService.extractProficiencies(profText || allText);

            const subclassFeature = cls.classFeatures
                .filter(f => (f.requiredLevel ?? 99) >= 1 && (f.requiredLevel ?? 99) <= 5)
                .find(f => SUBCLASS_KEYWORDS.some(kw => (f.name ?? '').toLowerCase().includes(kw)));
            const subclassAvailableAtLevel = subclassFeature?.requiredLevel ?? 3;

            classRows.push({
                uploadId,
                name: cls.name,
                hitDice: cls.hitDice ?? '',
                canCastSpells: cls.canCastSpells ? 'true' : 'false',
                subclassAvailableAtLevel,
                primaryAbilities: ExtractionService.mapAbilityIds(cls.primaryAbilities),
                equipmentDescription: ExtractionService.cleanText(cls.equipmentDescription),
                description: descText,
                source: this.context.getSourceName(sourceId),
                link: cls.moreDetailsUrl ? `https://www.dndbeyond.com${cls.moreDetailsUrl}` : '',
                sortOrder: classRows.length + 1,
                skillChoiceCount: profData.skillCount || '',
                grantsSavingThrows: profData.stGrants || ExtractionService.extractSavingThrows(allText),
                skillPool: profData.skillPool
            });

            for (const feature of cls.classFeatures) {
                this.context.registerClassFeatureId(feature.id!);
                const featText   = ExtractionService.cleanText(feature.description);
                const featSrcId  = feature.definition?.sources?.[0]?.sourceId ?? sourceId;
                const featName   = stripLevelPrefix(feature.name ?? '');
                featureRows.push({
                    uploadId: `${featSrcId}:${cls.name}:${featName}:${feature.requiredLevel ?? 1}`,
                    className: cls.name,
                    name: featName,
                    requiredLevel: feature.requiredLevel ?? 1,
                    description: featText,
                    url: feature.moreDetailsUrl ? `https://www.dndbeyond.com${feature.moreDetailsUrl}` : '',
                    ...ExtractionService.buildGrantRow(featText)
                });
            }

            if (!cls.canCastSpells || !cls.spellRules) continue;
            const rules   = cls.spellRules;
            const ctType  = CASTER_TYPE[rules.multiClassSpellSlotDivisor as number] ?? 'FULL';
            const hasPrepared = spellRuleLength(rules.levelPreparedSpellMaxes) > 1;
            const hasKnown    = spellRuleLength(rules.levelSpellKnownMaxes) > 1;

            for (let lv = 1; lv <= 20; lv++) {
                const slotSource = Array.isArray(rules.levelSpellSlots)
                    ? rules.levelSpellSlots[lv]
                    : (rules.levelSpellSlots as Record<string, number[]>)?.[String(lv)];
                const slots: number[] = Array.isArray(slotSource) ? slotSource : [];

                spellSlotRows.push({
                    'Class Name': cls.name, 'Subclass Name': '', 'Caster Type': ctType, 'Level': lv,
                    'Slot 1': slots[0] ?? 0, 'Slot 2': slots[1] ?? 0, 'Slot 3': slots[2] ?? 0,
                    'Slot 4': slots[3] ?? 0, 'Slot 5': slots[4] ?? 0, 'Slot 6': slots[5] ?? 0,
                    'Slot 7': slots[6] ?? 0, 'Slot 8': slots[7] ?? 0, 'Slot 9': slots[8] ?? 0
                });

                const cantrips = spellRuleValue(rules.levelCantripsKnownMaxes, lv);
                const prepared = hasPrepared
                    ? spellRuleValue(rules.levelPreparedSpellMaxes, lv)
                    : hasKnown
                        ? spellRuleValue(rules.levelSpellKnownMaxes, lv)
                        : null;

                spellsKnownRows.push({
                    'Class Name': cls.name, 'Subclass Name': '', 'Level': lv,
                    'Cantrips': cantrips ?? '',
                    'Prepared': prepared ?? '',
                    'Additional': '', 'Note': ''
                });
            }
        }

        return {
            classes:       { rows: classRows,       sheet: 'classes',       file: 'classes.xlsx' },
            classFeatures: { rows: featureRows,     sheet: 'classFeatures', file: 'classFeatures.xlsx' },
            spellSlots:    { rows: spellSlotRows,   sheet: 'spellSlots',    file: 'spellSlots.xlsx' },
            spellsKnown:   { rows: spellsKnownRows, sheet: 'spellsKnown',   file: 'spellsKnown.xlsx' }
        };
    }
}