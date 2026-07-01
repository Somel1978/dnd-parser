import { z } from 'zod';
import { DdbSpellSchema } from '../schemas/ddb';
import { ExtractionService } from './ExtractionService';
import type { ParserContext } from './ParserContext.svelte';

type SpellModifier = { type?: string; subType?: string; die?: { diceString?: string; } };

export class SpellParser {
    constructor(private context: ParserContext) {}

    execute(rawData: unknown) {
        const parsedData = z.array(DdbSpellSchema).parse(rawData);
        const rows: Record<string, unknown>[] = [];
        const statMap: Record<number, string> = { 
            1: 'Strength', 2: 'Dexterity', 3: 'Constitution', 
            4: 'Intelligence', 5: 'Wisdom', 6: 'Charisma' 
        };

        for (const wrapper of parsedData) {
            const spell = wrapper.definition;
            const sourceName = this.context.getSourceName(spell.sources?.[0]?.sourceId);
            const dmgMod = spell.modifiers.find((m: SpellModifier) => m.type === 'damage' && m.die?.diceString) as SpellModifier | undefined;
            const dmgStr = dmgMod && dmgMod.die?.diceString ? `${dmgMod.die.diceString} ${dmgMod.subType || ''}`.trim() : '';
            
            rows.push({
                'Spell ID': spell.id,
                'Name': spell.name,
                'Link': `https://www.dndbeyond.com/spells/${spell.id}`,
                'Level': spell.level === 0 ? 'Cantrip' : spell.level,
                'School': spell.school,
                'Concentration': spell.concentration ? 'true' : 'false',
                'Ritual': spell.ritual ? 'true' : 'false',
                'Is Homebrew': spell.isHomebrew ? 'true' : 'false',
                'Is Legacy': spell.isLegacy ? 'true' : 'false',
                'Cantrip Damage': spell.level === 0 ? dmgStr : '',
                'Cantrip Dmg Lvl 5': '', 'Cantrip Dmg Lvl 11': '', 'Cantrip Dmg Lvl 17': '',
                'Spell Damage': spell.level > 0 ? dmgStr : '',
                'Upcast Per Slot': '', 'Upcast Every 2 Slots': '',
                'Spell Progression': '', 'Progression Note': '',
                'Range Origin': spell.range?.origin || '',
                'Range Value (ft)': spell.range?.rangeValue || '',
                'AoE Type': spell.range?.aoeType || '',
                'AoE Value (ft)': spell.range?.aoeValue || '',
                'Duration Type': spell.duration?.durationType || '',
                'Duration Interval': spell.duration?.durationInterval || '',
                'Duration Unit': spell.duration?.durationUnit || '',
                'Requires Saving Throw': spell.saveDcAbilityId ? 'true' : 'false',
                'Saving Throw': spell.saveDcAbilityId ? (statMap[spell.saveDcAbilityId] || '') : '',
                'Requires Attack Roll': '', 'Can Cast Higher Level': '',
                'Casting Time': '', 'Components': '', 
                'Description': ExtractionService.cleanText(spell.description),
                'Source Book': sourceName,
                'Tags': '',
                'Spell List': ''
            });
        }
        return { spells: { rows, sheet: 'spells', file: 'spells.xlsx' } };
    }
}