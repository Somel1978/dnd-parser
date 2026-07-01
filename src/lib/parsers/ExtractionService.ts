// ── Constants ─────────────────────────────────────────────────────────────────

const SKILLS = [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
    'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
    'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'
];
const LANGUAGES = [
    'Abyssal', 'Celestial', 'Common', 'Common Sign Language', 'Deep Speech',
    'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling',
    'Infernal', 'Orc', 'Primordial', 'Sylvan', 'Undercommon'
];
const TOOLS = [
    "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies",
    "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils",
    "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools",
    "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools",
    "Weaver's Tools", "Woodcarver's Tools", "Disguise Kit", "Forgery Kit",
    "Herbalism Kit", "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools",
    "Gaming Set", "Musical Instrument"
];
const ARTISAN_TOOLS = TOOLS.slice(0, 17);
const DMG_TYPES = [
    'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic',
    'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'
];
const DMG_TYPES_LOWER = DMG_TYPES.map(d => d.toLowerCase());
const ABILITY_SCORES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
const WORD_NUMS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9
};
const ACT_TYPES: Record<number, { u: string; t: boolean }> = {
    1: { u: 'Action', t: false }, 2: { u: 'Bonus Action', t: false },
    3: { u: 'Reaction', t: false }, 4: { u: 'Reaction', t: false },
    6: { u: 'Minute', t: true }, 7: { u: 'Hour', t: true }, 8: { u: 'Special', t: true }
};
const SIZE_MAP: Record<number, string> = {
    2: 'Tiny', 3: 'Small', 4: 'Medium', 5: 'Large', 6: 'Huge', 7: 'Gargantuan'
};
const ZERO_WIDTH = /\u2800|\u200B|\u200C|\u200D|\uFEFF/g;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWordCount(s: string): number {
    return WORD_NUMS[s.toLowerCase()] ?? parseInt(s) ?? 0;
}

function toTitleCase(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}

function capFirst(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

function slugToTitleCase(s: string): string {
    return (s || '').replace(/-legacy$|-ua$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Proficiency result type ───────────────────────────────────────────────────

interface ProficiencyResult {
    skillCount: number;
    skillPool: string;
    skillGrants: string;
    toolCount: number;
    toolPool: string;
    toolGrants: string;
    langCount: number;
    langPool: string;
    langGrants: string;
    stCount: number;
    stPool: string;
    stGrants: string;
}

// ── ExtractionService ─────────────────────────────────────────────────────────

export class ExtractionService {

    // ── Text cleaning ─────────────────────────────────────────────────────────

    /** Strips HTML tags and normalises whitespace. Used everywhere a plain text string is needed.
     *  Injects spaces at block-element boundaries so "None</p><p>Weapons:" → "None Weapons:"
     *  rather than "NoneWeapons:". */
    static cleanText(html: string | null | undefined): string {
        if (!html) return '';
        // Pre-process: replace block element open/close tags with a space so adjacent
        // text content isn't concatenated when tags are later stripped.
        const spaced = html
            .replace(/<\/(p|div|li|td|th|h[1-6])>/gi, ' ')
            .replace(/<(p|br|div|li|tr|td|th|h[1-6])[^>]*>/gi, ' ');
        try {
            const doc = new DOMParser().parseFromString(spaced, 'text/html');
            return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
        } catch {
            return spaced.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }
    }

    /** Preserves newline structure (for label-based extraction inside class feature descriptions). */
    static normalizeDescription(html: string | null | undefined): string {
        if (!html) return '';
        return html
            .replace(/<(p|br|div|li|tr)[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── Simple field extractions ───────────────────────────────────────────────

    static extractFromNormalized(text: string, label: string): string {
        const regex = new RegExp(`(?:^|\\n|\\s)${label}[:\\s]+([^\\n]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    static mapAbilityIds(ids: number[] | null | undefined): string {
        if (!ids || ids.length === 0) return '';
        const map: Record<number, string> = {
            1: 'Strength', 2: 'Dexterity', 3: 'Constitution',
            4: 'Intelligence', 5: 'Wisdom', 6: 'Charisma'
        };
        return ids.map(id => map[id]).filter(Boolean).join(',');
    }

    static mapSizeId(sizeId: number): string {
        return SIZE_MAP[sizeId] ?? 'Medium';
    }

    // ── Senses ────────────────────────────────────────────────────────────────

    static extractSenses(text: string): string {
        const found: string[] = [];
        const patterns = [
            /Darkvision\s+(\d+)\s*(?:ft|feet)/i,
            /Blindsight\s+(\d+)\s*(?:ft|feet)/i,
            /Tremorsense\s+(\d+)\s*(?:ft|feet)/i,
            /Truesight\s+(\d+)\s*(?:ft|feet)/i
        ];
        for (const re of patterns) {
            const m = text.match(re);
            if (m) found.push(m[0].replace(/feet/i, 'ft').replace(/\.\s*$/, '').trim());
        }
        return found.join(', ');
    }

    // ── Speed ─────────────────────────────────────────────────────────────────

    /** Extracts base movement speeds (for species WALK/FLY/SWIM/CLIMB/BURROW integer columns). */
    static extractSpeed(text: string): Record<string, number | undefined> {
        const sp: Record<string, number | undefined> = {};
        const patterns: [string, RegExp][] = [
            ['WALK', /(?:walking|base)\s+speed\s+(?:is|of)\s+(\d+)/i],
            ['WALK', /[Yy]our speed is (\d+)/],
            ['FLY', /fly(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i],
            ['SWIM', /swim(?:ming)?\s+speed\s+(?:is|of)\s+(\d+)/i],
            ['CLIMB', /climb(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i],
            ['BURROW', /burrow(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i]
        ];
        for (const [key, re] of patterns) {
            if (!sp[key]) {
                const m = text.match(re);
                if (m) sp[key] = parseInt(m[1]);
            }
        }
        return sp;
    }

    /** Extracts additive speed bonuses in TYPE:amount format (for grantsSpeed in feature grant rows). */
    static extractGrantSpeed(text: string): string {
        const speeds: string[] = [];
        const seen = new Set<string>();
        const patterns: [string, RegExp][] = [
            ['WALK', /walk(?:ing)?\s+speed\s+increase[sd]?\s+by\s+(\d+)/i],
            ['WALK', /increase[sd]?\s+your\s+walk(?:ing)?\s+speed\s+by\s+(\d+)/i],
            ['WALK', /(?:your\s+)?speed\s+increase[sd]?\s+by\s+(\d+)/i],
            ['FLY', /(?:gain[s]?\s+a\s+)?fly(?:ing)?\s+speed\s+of\s+(\d+)/i],
            ['SWIM', /(?:gain[s]?\s+a\s+)?swim(?:ming)?\s+speed\s+of\s+(\d+)/i],
            ['CLIMB', /(?:gain[s]?\s+a\s+)?climb(?:ing)?\s+speed\s+of\s+(\d+)/i],
            ['BURROW', /(?:gain[s]?\s+a\s+)?burrow(?:ing)?\s+speed\s+of\s+(\d+)/i]
        ];
        for (const [type, re] of patterns) {
            if (!seen.has(type)) {
                const m = text.match(re);
                if (m?.[1]) { speeds.push(`${type}:${m[1]}`); seen.add(type); }
            }
        }
        return speeds.join(',');
    }

    // ── Damage types (resistances / immunities / vulnerabilities) ─────────────

    static extractDamageList(text: string, pattern: RegExp): string {
        const found = new Set<string>();
        let m: RegExpExecArray | null;
        const re = new RegExp(pattern.source, 'gi');
        while ((m = re.exec(text)) !== null) {
            m[1].split(/[,\s]+(?:and\s+)?/i).forEach(w => {
                const cl = w.replace(/damage/i, '').trim().toLowerCase();
                const idx = DMG_TYPES_LOWER.indexOf(cl);
                if (idx >= 0) found.add(DMG_TYPES[idx]);
            });
        }
        return [...found].join(',');
    }

    // ── Innate spells ─────────────────────────────────────────────────────────
    // Format: SpellName:minCharLevel:usesPerDay[:true]
    // - Consumes leading articles (the/a/an) and trailing "spell"/"cantrip" outside capture group
    // - Title-cases spell name (species descriptions use lowercase)
    // - Extracts minCharLevel from "at Nth level" context before the cast mention
    // - Detects :true flag for spells that can also use spell slots

    static extractInnateSpells(text: string): string {
        const entries: string[] = [];
        const re = /(?:cast|use)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][a-zA-Z' -]+?)(?:\s+(?:spell|cantrip|ability))?(?:\s+\([^)]+\))?\s+(?:once|twice|\d+\s+times?|at[\s-]will)\s+per\s+(?:day|long\s+rest|short\s+rest)/gi;
        const lvRe = /(?:starting\s+at|at|once\s+you\s+reach)\s+(\d+)(?:st|nd|rd|th)?\s*level/i;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            let name = m[1].trim().replace(/\s+/g, ' ');
            if (!name || name.length < 2) continue;
            name = toTitleCase(name);
            const before = text.slice(Math.max(0, m.index - 200), m.index);
            const lvM = lvRe.exec(before);
            const minLevel = lvM ? parseInt(lvM[1]) : 1;
            const full = m[0].toLowerCase();
            const uses = (full.includes('at will') || full.includes('at-will')) ? 0
                : full.includes('twice') ? 2
                : (full.match(/(\d+)\s+times?/) ? parseInt(full.match(/(\d+)\s+times?/)![1]) : 1);
            const after = text.slice(m.index + m[0].length, Math.min(text.length, m.index + m[0].length + 200));
            const canSlot = /using\s+(?:a\s+)?spell\s+slot|expend\s+(?:a\s+)?spell\s+slot/i.test(after);
            entries.push(`${name}:${minLevel}:${uses}${canSlot ? ':true' : ''}`);
        }
        return [...new Set(entries)].join(',');
    }

    // ── Size ──────────────────────────────────────────────────────────────────

    static extractSize(text: string): { fixed: string; choices: string } {
        const cM = text.match(/(Small|Medium|Large|Tiny|Huge|Gargantuan)\s+or\s+(Small|Medium|Large|Tiny|Huge|Gargantuan)/i);
        if (cM) return { fixed: '', choices: `${cM[1]},${cM[2]}` };
        const fM = text.match(/(?:size\s+is|you\s+are|Size:)\s*(Tiny|Small|Medium|Large|Huge|Gargantuan)/i);
        return fM ? { fixed: fM[1], choices: '' } : { fixed: '', choices: '' };
    }

    // ── Saving throws (labeled) ───────────────────────────────────────────────

    static extractSavingThrows(text: string): string {
        const pats = [
            /Saving Throws?:\s*([A-Za-z ,&]+?)(?:[<\n]|$)/i,
            /Saving Throw Proficiencies\s+([A-Za-z, ]+?)(?:\n|$)/i
        ];
        for (const re of pats) {
            const m = text.match(re);
            if (m) {
                const s = m[1].split(/[,&]|\s+and\s+/i).map(x => x.trim()).filter(x => ABILITY_SCORES.includes(x));
                if (s.length) return s.join(',');
            }
        }
        return '';
    }

    // ── ASI extraction ────────────────────────────────────────────────────────

    static extractASI(text: string): { amount: string; fixed: string; choices: string } {
        const m = text.match(/Increase your ([A-Za-z ]+?)\s+(?:score\s+)?by\s+(\d+)/i);
        if (!m) return { amount: '', fixed: '', choices: '' };
        const amount = m[2];
        const statPart = m[1].trim();
        if (/ability score/i.test(statPart)) return { amount, fixed: '', choices: ABILITY_SCORES.join(',') };
        if (/\s+or\s+/i.test(statPart)) {
            const choices = statPart.split(/\s+or\s+/i).map(s => s.trim()).filter(s => ABILITY_SCORES.includes(s));
            return { amount, fixed: '', choices: choices.join(',') };
        }
        if (ABILITY_SCORES.includes(statPart)) return { amount, fixed: statPart, choices: '' };
        return { amount: '', fixed: '', choices: '' };
    }

    // ── Casting time ──────────────────────────────────────────────────────────

    static buildCastingTime(activation: { activationTime?: number; activationType?: number } | undefined): string {
        if (!activation?.activationType) return '';
        const def = ACT_TYPES[activation.activationType];
        if (!def) return '';
        const time = activation.activationTime ?? 1;
        if (!def.t) return `${time} ${def.u}`;
        const s = time !== 1 && def.u !== 'Special' ? 's' : '';
        return `${time} ${def.u}${s}`;
    }

    // ── Damage string ─────────────────────────────────────────────────────────

    static buildDamageString(diceStr: string | undefined, subType: string | undefined): string {
        if (!diceStr) return '';
        const skip = ['additional', 'all', 'melee-weapon-attacks'];
        const type = subType && !skip.includes(subType) ? capFirst(subType) : '';
        return type ? `${diceStr} ${type}` : diceStr;
    }

    // ── Comprehensive 3-tier proficiency extractor ────────────────────────────
    // Tier 1: combined "N skills or tools" pattern
    // Tier 2: labeled sections (Skills:, Tools:, Languages:)
    // Tier 3: unlabeled patterns in plain text

    /** Extracts text following a label, stopping at the next known section label or newline.
     *  Prevents "Tools: None Saving Throws: ... Skills: Choose two" from bleeding across sections. */
    private static sectionText(text: string, labelRe: RegExp): string | null {
        const m = text.match(labelRe);
        if (!m) return null;
        const after = text.slice(m.index! + m[0].length);
        const stopRe = /\n|\b(?:Skills?|Tools?|Languages?|Saving\s+Throws?|Weapons?|Armor|Equipment)\s*[:\t]/i;
        const stopM = after.match(stopRe);
        return stopM ? after.slice(0, stopM.index) : after.slice(0, 300);
    }

    static extractProficiencies(text: string): ProficiencyResult {
        let skillCount = 0, skillPool = '', skillGrants = '';
        let toolCount = 0, toolPool = '', toolGrants = '';
        let langCount = 0, langPool = '', langGrants = '';
        let stCount = 0, stPool = '', stGrants = '';

        // ── Tier 1: Combined "N skills or tools" ──────────────────────────────
        const combinedM = text.match(/(\w+)\s+(?:skills?\s+or\s+tools?|tools?\s+or\s+skills?)\s*(?:of\s+your\s+choice)?/i);
        if (combinedM) {
            const n = parseWordCount(combinedM[1]);
            if (n > 0) {
                skillCount = n; skillPool = SKILLS.join(',');
                toolCount = n; toolPool = TOOLS.join(',');
            }
        }

        // ── Tier 2: Labeled sections ──────────────────────────────────────────
        if (!skillCount && !skillGrants) {
            const sec = ExtractionService.sectionText(text, /Skills?(?:\s+Proficiencies)?[:\t]/i);
            if (sec !== null) {
                const cm = sec.match(/Choose\s+(?:any\s+)?(\w+)/i);
                const n = cm ? (WORD_NUMS[cm[1].toLowerCase()] ?? parseInt(cm[1]) ?? 0) : 0;
                if (/choose\s+any/i.test(sec) && n > 0) {
                    skillCount = n; skillPool = SKILLS.join(',');
                } else if (n > 0) {
                    const pm = sec.match(/(?:from among|from)\s+([A-Za-z ,']+?)(?:\.|;|$|\n)/i);
                    const pool = pm ? pm[1].split(/,/).map(s => s.replace(/\s+or\s*$/i, '').trim()).filter(s => SKILLS.includes(s)).join(',') : '';
                    skillCount = n; skillPool = pool || SKILLS.join(',');
                } else {
                    const items = sec.split(/[,;]|\s+and\s+/i).map(s => s.trim()).filter(s => SKILLS.includes(s));
                    if (items.length) skillGrants = items.join(',');
                }
            }
        }

        if (!toolCount && !toolGrants) {
            const sec = ExtractionService.sectionText(text, /Tools?(?:\s+Proficiencies)?[:\t]/i);
            if (sec !== null) {
                const cm = sec.match(/Choose\s+(?:any\s+)?(\w+)/i);
                const n = cm ? (WORD_NUMS[cm[1].toLowerCase()] ?? parseInt(cm[1]) ?? 0) : 0;
                if (/choose\s+any|\bany\s+(?:artisan|tool)/i.test(sec) && n > 0) {
                    toolCount = n; toolPool = /artisan/i.test(sec) ? ARTISAN_TOOLS.join(',') : TOOLS.join(',');
                } else if (n > 0 && /artisan/i.test(sec)) {
                    const f = ARTISAN_TOOLS.filter(t => sec.toLowerCase().includes(t.toLowerCase()));
                    toolCount = n; toolPool = f.length ? f.join(',') : ARTISAN_TOOLS.join(',');
                } else if (n > 0) {
                    const f = TOOLS.filter(t => sec.toLowerCase().includes(t.toLowerCase()));
                    toolCount = n; toolPool = f.length ? f.join(',') : '';
                } else {
                    const f = TOOLS.filter(t => sec.toLowerCase().includes(t.toLowerCase()));
                    if (f.length) toolGrants = f.join(',');
                }
            }
        }

        {
            const sec = ExtractionService.sectionText(text, /Languages?(?:\s+Proficiencies)?[:\t]/i);
            if (sec !== null) {
                const cm = sec.match(/Choose\s+(?:any\s+)?(\w+)/i);
                const n = cm ? (WORD_NUMS[cm[1].toLowerCase()] ?? parseInt(cm[1]) ?? 0) : 0;
                if (/choose\s+any/i.test(sec) && n > 0) {
                    langCount = n; langPool = LANGUAGES.join(',');
                } else if (n > 0) {
                    const pm = sec.match(/(?:from among|from)\s+([A-Za-z ,']+?)(?:\.|;|$|\n)/i);
                    const pool = pm ? pm[1].split(/,/).map(s => s.trim()).filter(s => LANGUAGES.includes(s)).join(',') : '';
                    langCount = n; langPool = pool || LANGUAGES.join(',');
                } else {
                    const items = sec.split(/[,;]|\s+and\s+/i).map(s => s.trim()).filter(s => LANGUAGES.includes(s));
                    if (items.length) langGrants = items.join(',');
                }
            }
        }

        // ── Tier 3: Unlabeled patterns ────────────────────────────────────────

        if (!skillCount && !skillGrants) {
            // Saving throw proficiency
            const stSec = text.match(/proficien\w*\s+in\s+saving\s+throws?[^.]{0,150}/i);
            if (stSec) {
                const seg = stSec[0];
                if (/chosen\s+ability|your\s+choice/i.test(seg)) {
                    stCount = 1; stPool = ABILITY_SCORES.join(',');
                } else {
                    const found = ABILITY_SCORES.filter(v => new RegExp(`\\b${v}\\b`, 'i').test(seg));
                    if (found.length === 1) stGrants = found[0];
                    else if (found.length > 1) { stCount = 1; stPool = found.join(','); }
                }
            }

            // All skills at once
            if (/proficien\w*\s+in\s+all\s+skills?/i.test(text)) {
                skillGrants = SKILLS.join(',');
            } else {
                // "proficiency in N skill(s) of your choice"  — PHB 2014 style
                // "Skill Proficiencies Choose N from ..." — PHB 2024 style (no colon after label)
                const choiceM = text.match(/proficien\w*\s+in\s+(one|two|three|four|\d+)\s+(?:additional\s+)?skills?\s*(?:of\s+your\s+choice|from\b)/i)
                    ?? text.match(/Skill\s+Proficiencies?\s+Choose\s+(one|two|three|\d+)/i)
                    ?? text.match(/proficien\w*\s+Choose\s+(one|two|three|\d+)\s+(?:from\s+)?skills?/i);
                if (choiceM) {
                    const n = parseWordCount(choiceM[1]);
                    const afterIdx = text.search(choiceM[0]) + choiceM[0].length;
                    const afterText = text.slice(afterIdx, afterIdx + 200);
                    const fromM = afterText.match(/(?:following|options?)[^:]*:\s*([A-Za-z,\s]+?)(?:\.|$|\r|\n)/i);
                    let pool = '';
                    if (fromM) {
                        const listed = fromM[1].split(/[,\s]+(?:or\s+|and\s+)?/i).map(s => s.trim()).filter(s => SKILLS.includes(s));
                        pool = listed.join(',');
                    }
                    skillCount = n; skillPool = pool || SKILLS.join(',');
                } else {
                    // "proficiency in Stealth or Athletics (your choice)"
                    const eitherM = text.match(/proficien\w*\s+in\s+(?:either\s+)?(?:the\s+)?([A-Z][a-z\s]+?)\s+(?:or|and)\s+([A-Z][a-z]+)\s+skills?/i);
                    if (eitherM) {
                        const valid = [eitherM[1].trim(), eitherM[2].trim()].filter(s => SKILLS.includes(s));
                        if (valid.length) { skillCount = 1; skillPool = valid.join(','); }
                    } else {
                        // Fixed named skills — only extract if there is no "Choose" nearby,
                        // which would indicate these are choice options, not fixed grants.
                        const hasChoiceContext = /proficien\w*[^.]{0,120}choose/i.test(text);
                        if (!hasChoiceContext) {
                            const found = SKILLS.filter(s => {
                                const re = new RegExp(`\\bproficien\\w*\\b[^.]{0,80}\\b${s.replace(/\s+/g, '\\s+')}\\b`, 'i');
                                return re.test(text);
                            });
                            if (found.length) skillGrants = found.join(',');
                        }
                    }
                }
            }
        }

        if (!toolCount && !toolGrants) {
            // "proficiency with N [artisan/musical/gaming/] tools of your choice"
            const toolChoiceM = text.match(/proficien\w*\s+with\s+(?:one|two|three|four|a|an|\d+)\s+(?:different\s+)?(?:type(?:s)?\s+of\s+)?(?:artisan['\s]?s?\s+)?(?:Musical\s+Instrument|Gaming\s+Set|tool)s?(?:\s+of\s+your\s+choice)?/i);
            if (toolChoiceM) {
                const nm = toolChoiceM[0].match(/\b(one|two|three|four|a|an|\d+)\b/i);
                const n = nm ? (WORD_NUMS[nm[1].toLowerCase()] ?? 1) : 1;
                const seg = toolChoiceM[0].toLowerCase();
                let pool: string;
                if (/musical\s+instrument/i.test(seg)) pool = 'Musical Instrument';
                else if (/gaming\s+set/i.test(seg)) pool = 'Gaming Set';
                else if (/artisan/i.test(seg)) pool = ARTISAN_TOOLS.join(',');
                else pool = TOOLS.join(',');
                toolCount = n; toolPool = pool;
            } else {
                // Fixed named tools
                const found = TOOLS.filter(t => {
                    const re = new RegExp(`\\bproficien\\w*[^.]{0,80}\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    return re.test(text);
                });
                if (found.length) toolGrants = found.join(',');
            }
        }

        return { skillCount, skillPool, skillGrants, toolCount, toolPool, toolGrants, langCount, langPool, langGrants, stCount, stPool, stGrants };
    }

    // ── Grant row builders ────────────────────────────────────────────────────

    /** Full common grant fields — for classFeatures, subclassFeatures, feats. */
    static buildGrantRow(text: string): Record<string, unknown> {
        const p = ExtractionService.extractProficiencies(text);
        const st = p.stGrants || ExtractionService.extractSavingThrows(text);
        return {
            grantsSkills: p.skillGrants, grantsExpertise: '', grantsHalfSkills: '',
            grantsSavingThrows: st,
            skillChoiceCount: p.skillCount || '', skillChoicePool: p.skillPool,
            savingThrowChoiceCount: p.stCount || '', savingThrowChoicePool: p.stPool,
            grantsTools: p.toolGrants, toolChoiceCount: p.toolCount || '', toolChoicePool: p.toolPool,
            grantsLanguages: p.langGrants, languageChoiceCount: p.langCount || '', languageChoicePool: p.langPool,
            grantsResistances: ExtractionService.extractDamageList(text, /resist(?:ance|ant)\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsImmunities: ExtractionService.extractDamageList(text, /immun(?:e|ity)\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsVulnerabilities: ExtractionService.extractDamageList(text, /vulnerable\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsInnateSpells: ExtractionService.extractInnateSpells(text),
            grantsSpeed: ExtractionService.extractGrantSpeed(text),
            grantsSenses: ExtractionService.extractSenses(text)
        };
    }

    /** Species traits: grantsSenses is blank — covered by the dedicated senses column. */
    static buildSpeciesTraitGrantRow(text: string): Record<string, unknown> {
        const row = ExtractionService.buildGrantRow(text);
        row.grantsSenses = '';
        return row;
    }

    /** Backgrounds: no grantsExpertise/grantsHalfSkills/grantsSavingThrows per template.
     *  Proficiency fields come from the background's dedicated description fields. */
    static buildBackgroundGrantRow(skillTxt: string, toolTxt: string, langTxt: string, fullTxt: string): Record<string, unknown> {
        const pSk = ExtractionService.extractProficiencies(skillTxt);
        const pTl = ExtractionService.extractProficiencies(toolTxt);
        const pLg = ExtractionService.extractProficiencies(langTxt);
        return {
            grantsSkills: pSk.skillGrants, skillChoiceCount: pSk.skillCount || '', skillChoicePool: pSk.skillPool,
            savingThrowChoiceCount: '', savingThrowChoicePool: '',
            grantsTools: pTl.toolGrants, toolChoiceCount: pTl.toolCount || '', toolChoicePool: pTl.toolPool,
            grantsLanguages: pLg.langGrants, languageChoiceCount: pLg.langCount || '', languageChoicePool: pLg.langPool,
            grantsResistances: ExtractionService.extractDamageList(fullTxt, /resist(?:ance|ant)\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsImmunities: ExtractionService.extractDamageList(fullTxt, /immun(?:e|ity)\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsVulnerabilities: ExtractionService.extractDamageList(fullTxt, /vulnerable\s+to\s+([\w\s,]+?)\s+damage/gi),
            grantsInnateSpells: ExtractionService.extractInnateSpells(fullTxt),
            grantsSpeed: ExtractionService.extractGrantSpeed(fullTxt),
            grantsSenses: ExtractionService.extractSenses(fullTxt)
        };
    }

    /** Empty grant row — used as a fallback or starting point. */
    static getEmptyGrants(): Record<string, string> {
        return {
            grantsSkills: '', grantsExpertise: '', grantsHalfSkills: '', grantsSavingThrows: '',
            skillChoiceCount: '', skillChoicePool: '', savingThrowChoiceCount: '', savingThrowChoicePool: '',
            grantsTools: '', toolChoiceCount: '', toolChoicePool: '',
            grantsLanguages: '', languageChoiceCount: '', languageChoicePool: '',
            grantsResistances: '', grantsImmunities: '', grantsVulnerabilities: '',
            grantsInnateSpells: '', grantsSpeed: '', grantsSenses: ''
        };
    }

    // ── Prerequisite builder ──────────────────────────────────────────────────
    // Reconstructs clean human-readable prerequisite text from structured prerequisiteMappings
    // instead of joining raw description fragments which are often incomplete.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static buildPrerequisites(prerequisites: any[]): string {
        if (!prerequisites?.length) return '';
        const abilityByVal: Record<number, Set<string>> = {};
        const parts: string[] = [];
        const seen = new Set<string>();

        const add = (s: string) => {
            const c = (s || '').trim().replace(ZERO_WIDTH, '');
            if (c && !seen.has(c)) { seen.add(c); parts.push(c); }
        };

        for (const prereq of prerequisites) {
            const mappings = prereq.prerequisiteMappings ?? [];
            if (!mappings.length) { add(prereq.description ?? ''); continue; }

            for (const m of mappings) {
                const friendly = ((m.friendlySubTypeName ?? '') as string).trim().replace(ZERO_WIDTH, '');
                switch (m.type) {
                    case 'ability-score': {
                        const val = m.value ?? 13;
                        if (!abilityByVal[val]) abilityByVal[val] = new Set();
                        abilityByVal[val].add(friendly || capFirst(m.subType ?? ''));
                        break;
                    }
                    case 'level': {
                        const v = m.value;
                        const sfx = ['', 'st', 'nd', 'rd'][v] ?? 'th';
                        add(`${v}${sfx}-level character`);
                        break;
                    }
                    case 'proficiency':
                        add(`Proficiency with ${(m.subType ?? '').replace(/-/g, ' ')}`);
                        break;
                    case 'class':
                        add(friendly || slugToTitleCase(m.subType));
                        break;
                    case 'feat': {
                        const name = friendly || slugToTitleCase(m.subType);
                        add(`${name} feat`);
                        break;
                    }
                    case 'species':
                    case 'species-option': {
                        const name = friendly || slugToTitleCase(m.subType);
                        if (name) add(name);
                        break;
                    }
                    case 'size':
                        add(`${capFirst(m.subType ?? '')} size`);
                        break;
                    case 'class-feature': {
                        const d = ((prereq.description ?? '') as string).trim().replace(ZERO_WIDTH, '');
                        if (d) add(d);
                        break;
                    }
                    case 'custom-value':
                    default:
                        add(prereq.description ?? '');
                }
            }
        }

        const abilityParts = Object.entries(abilityByVal).map(([val, statSet]) =>
            `${[...statSet].join(' or ')} ${val} or higher`
        );
        return [...abilityParts, ...parts].join(', ');
    }

    // ── Source deduplication ─────────────────────────────────────────────────
    // Payloads contain multiple versions of the same entity (PHB 2014 + PHB 2024),
    // plus repeatable-feat instances that produce identical entries with the same sourceId.
    // Strategy:
    //   1. Group by name (case-insensitive).
    //   2. Within each group, deduplicate entries from the same sourceId (keeps first).
    //   3. All versions are kept with their original name — uploadId (sourceId:name)
    //      is the unique key used by the import server to distinguish them.

    static markLegacyDuplicates<T extends { name: string; sources?: { sourceId: number }[] }>(data: T[]): T[] {
        const groups = new Map<string, T[]>();
        for (const item of data) {
            const key = item.name.toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }

        const result: T[] = [];
        for (const [, group] of groups) {
            if (group.length === 1) { result.push(group[0]); continue; }

            // Deduplicate within the same sourceId (repeatable-feat instances etc.) — keep first
            const bySource = new Map<number, T>();
            for (const item of group) {
                const srcId = item.sources?.[0]?.sourceId ?? 0;
                if (!bySource.has(srcId)) bySource.set(srcId, item);
            }

            // All versions keep their original name — uploadId differentiates them
            for (const [, item] of bySource) {
                result.push(item);
            }
        }
        return result;
    }
}