import { z } from 'zod';
import { DdbSpellSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

type SpellModifier = { type?: string; subType?: string; die?: { diceString?: string }; atHigherLevels?: { higherLevelDefinitions?: { level: number; dice?: { diceString?: string } }[] } };

const COMP_MAP: Record<number, string> = { 1: 'V', 2: 'S', 3: 'M' };
const STAT_MAP: Record<number, string> = {
    1: 'Strength', 2: 'Dexterity', 3: 'Constitution',
    4: 'Intelligence', 5: 'Wisdom', 6: 'Charisma'
};

export class SpellParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSpellSchema).parse(rawData);
        const rows: Record<string, unknown>[] = [];

        for (const wrapper of parsedData) {
            const spell = wrapper.definition;
            const sourceName = this.context.getSourceName(spell.sources?.[0]?.sourceId);

            // Damage extraction
            const dmgMods = (spell.modifiers as SpellModifier[]).filter(m => m.type === 'damage' && m.die?.diceString);
            const firstDmg = dmgMods[0] as SpellModifier | undefined;
            const baseDie = firstDmg?.die?.diceString;
            const subType = firstDmg?.subType;
            const modHL = firstDmg?.atHigherLevels?.higherLevelDefinitions ?? [];

            let cantripDmg = '', c5 = '', c11 = '', c17 = '';
            let spellDmg = '', upcastPerSlot = '', upcastEvery2 = '';

            if (spell.level === 0) {
                cantripDmg = ExtractionService.buildDamageString(baseDie, subType);
                c5  = ExtractionService.buildDamageString(modHL.find(h => h.level === 5)?.dice?.diceString, subType);
                c11 = ExtractionService.buildDamageString(modHL.find(h => h.level === 11)?.dice?.diceString, subType);
                c17 = ExtractionService.buildDamageString(modHL.find(h => h.level === 17)?.dice?.diceString, subType);
            } else {
                spellDmg = ExtractionService.buildDamageString(baseDie, subType);
                const up1 = modHL.find(h => h.level === 1);
                if (up1?.dice?.diceString) upcastPerSlot = ExtractionService.buildDamageString(up1.dice.diceString, subType);
                const up2 = modHL.find(h => h.level === 2);
                if (up2?.dice?.diceString) upcastEvery2 = ExtractionService.buildDamageString(up2.dice.diceString, subType);
            }

            const components = (spell.components ?? []).map((c: number) => COMP_MAP[c] ?? '').filter(Boolean).join(',');
            const castingTime = ExtractionService.buildCastingTime(spell.activation);
            const saveStat = spell.saveDcAbilityId ? (STAT_MAP[spell.saveDcAbilityId] ?? '') : '';
            const link = `https://www.dndbeyond.com/spells/${spell.id}-${spell.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;

            rows.push({
                'Spell ID': spell.id,
                'Name': spell.name,
                'Link': link,
                'Level': spell.level === 0 ? 'Cantrip' : spell.level,
                'School': spell.school ?? '',
                'Concentration': spell.concentration ? 'true' : 'false',
                'Ritual': spell.ritual ? 'true' : 'false',
                'Is Homebrew': spell.isHomebrew ? 'true' : 'false',
                'Is Legacy': spell.isLegacy ? 'true' : 'false',
                'Cantrip Damage': cantripDmg,
                'Cantrip Dmg Lvl 5': c5,
                'Cantrip Dmg Lvl 11': c11,
                'Cantrip Dmg Lvl 17': c17,
                'Spell Damage': spellDmg,
                'Upcast Per Slot': upcastPerSlot,
                'Upcast Every 2 Slots': upcastEvery2,
                'Spell Progression': '',
                'Progression Note': '',
                'Range Origin': spell.range?.origin ?? '',
                'Range Value (ft)': spell.range?.rangeValue ?? '',
                'AoE Type': spell.range?.aoeType ?? '',
                'AoE Value (ft)': spell.range?.aoeValue ?? '',
                'Duration Type': spell.duration?.durationType ?? '',
                'Duration Interval': spell.duration?.durationInterval ?? '',
                'Duration Unit': spell.duration?.durationUnit ?? '',
                'Requires Saving Throw': spell.requiresSavingThrow ? 'true' : 'false',
                'Saving Throw': saveStat,
                'Requires Attack Roll': spell.requiresAttackRoll ? 'true' : 'false',
                'Can Cast Higher Level': spell.canCastAtHigherLevel ? 'true' : 'false',
                'Casting Time': castingTime,
                'Components': components,
                'Description': ExtractionService.cleanText(spell.description),
                'Source Book': sourceName,
                'Tags': (spell.tags ?? []).join(','),
                'Spell List': ''
            });
        }

        return { spells: { rows, sheet: 'spells', file: 'spells.xlsx' } };
    }
}