import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { readFileSync } from 'fs';

const SPELL_LISTS: Record<number, string> = JSON.parse(
    readFileSync(new URL('../lib/data/spell-lists.json', import.meta.url), 'utf8')
) as Record<number, string>;
import { DdbClassSchema, DdbSubclassSchema, DdbSpeciesSchema,
         DdbBackgroundSchema, DdbFeatSchema, DdbSpellSchema } from '$lib/schemas/ddb';

// ── Payload parsing ───────────────────────────────────────────────────────────

function parsePayload(raw: string): unknown[] {
    const tryParse = (s: string): unknown[] | null => {
        try {
            const d = JSON.parse(s);
            if (Array.isArray(d)) return d;
            const r = d as Record<string, unknown>;
            const arr = (r.data as unknown[] | undefined) ?? (r.results as unknown[] | undefined);
            return arr ?? [d];
        } catch { return null; }
    };
    const single = tryParse(raw.trim());
    if (single) return single;
    const items: unknown[] = [];
    let pos = 0; const str = raw.trim();
    while (pos < str.length) {
        let depth = 0, inStr = false, esc = false, start = -1;
        while (pos < str.length) {
            const ch = str[pos];
            if (esc)  { esc = false; pos++; continue; }
            if (ch === '\\' && inStr) { esc = true; pos++; continue; }
            if (ch === '"') { inStr = !inStr; pos++; continue; }
            if (inStr) { pos++; continue; }
            if ((ch === '{' || ch === '[') && depth++ === 0) start = pos;
            if ((ch === '}' || ch === ']') && --depth === 0) {
                const chunk = tryParse(str.slice(start, pos + 1));
                if (chunk) items.push(...chunk);
                pos++; while (pos < str.length && /\s/.test(str[pos])) pos++;
                break;
            }
            pos++;
        }
        if (depth !== 0) break;
    }
    return items;
}

// ── Python extractor ──────────────────────────────────────────────────────────

type Grants = Record<string, unknown>;

function runExtractor(descriptions: {id: number; text: string}[]): Promise<Map<number, Grants>> {
    return new Promise((resolve, reject) => {
        if (descriptions.length === 0) { resolve(new Map()); return; }
        const candidates = [
            join(process.cwd(), 'python', 'extractor.py'),
            join(process.cwd(), '..', 'python', 'extractor.py'),
        ];
        const pythonPath = candidates.find(existsSync) ?? candidates[0];
        const py = spawn('python3', [pythonPath]);
        let stdout = '', stderr = '';
        py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        py.stdin.on('error', () => { /* suppress EPIPE */ });
        py.on('close', (code) => {
            if (code !== 0) { reject(new Error(`Python extractor failed (exit ${code}):\n${stderr}`)); return; }
            const map = new Map<number, Grants>();
            for (const line of stdout.trim().split('\n')) {
                try {
                    const obj = JSON.parse(line) as Record<string, unknown>;
                    if (obj.done && Array.isArray(obj.results)) {
                        for (const r of obj.results as {id:number; grants:Grants}[]) map.set(r.id, r.grants);
                    }
                } catch { /* progress lines */ }
            }
            resolve(map);
        });
        py.stdin.write(JSON.stringify({ descriptions }));
        py.stdin.end();
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_MAP: Record<number, {name: string; slug: string}> = {
    1: {name:"Basic Rules (2014)", slug:"basic-rules-2014"},
    2: {name:"Player’s Handbook (2014)", slug:"phb-2014"},
    3: {name:"Dungeon Master’s Guide (2014)", slug:"dmg-2014"},
    5: {name:"Monster Manual (2014)", slug:"mm-2014"},
    6: {name:"Curse of Strahd", slug:"cos"},
    8: {name:"Lost Mine of Phandelver", slug:"lmop"},
    9: {name:"Out of the Abyss", slug:"oota"},
    10: {name:"Princes of the Apocalypse", slug:"pota"},
    12: {name:"Storm King's Thunder", slug:"skt"},
    13: {name:"Sword Coast Adventurer's Guide", slug:"scag"},
    14: {name:"Tales from the Yawning Portal", slug:"tftyp"},
    15: {name:"Volo's Guide to Monsters", slug:"vgtm"},
    25: {name:"Tomb of Annihilation", slug:"toa"},
    27: {name:"Xanathar's Guide to Everything", slug:"xgte"},
    28: {name:"The Tortle Package", slug:"ttp"},
    33: {name:"Mordenkainen’s Tome of Foes", slug:"mtof"},
    34: {name:"Rrakkma", slug:"ddia-mord"},
    35: {name:"Waterdeep: Dragon Heist", slug:"wdh"},
    36: {name:"Waterdeep: Dungeon of the Mad Mage", slug:"wdotmm"},
    37: {name:"Wayfinder's Guide to Eberron", slug:"wgte"},
    38: {name:"Guildmasters’ Guide to Ravnica", slug:"ggtr"},
    40: {name:"Lost Laboratory of Kwalish", slug:"llok"},
    41: {name:"Dragon of Icespire Peak", slug:"doip"},
    43: {name:"Ghosts of Saltmarsh", slug:"gos"},
    44: {name:"Acquisitions Incorporated", slug:"ai"},
    47: {name:"Hunt for the Thessalhydra", slug:"hftt"},
    48: {name:"Baldur’s Gate: Descent into Avernus", slug:"bgdia"},
    49: {name:"Eberron: Rising from the Last War", slug:"erftlw"},
    50: {name:"Storm Lord’s Wrath", slug:"slw"},
    51: {name:"Sleeping Dragon’s Wake", slug:"sdw"},
    52: {name:"Divine Contention", slug:"dc"},
    53: {name:"Sage Advice Compendium (2014)", slug:"sac"},
    54: {name:"Monstrous Compendium Vol. 3: Minecraft Creatures", slug:"mcv3"},
    55: {name:"Locathah Rising", slug:"lr"},
    56: {name:"Infernal Machine Rebuild", slug:"imr"},
    57: {name:"Mordenkainen's Fiendish Folio Volume 1", slug:"mffv1"},
    59: {name:"Explorer's Guide to Wildemount", slug:"egtw"},
    60: {name:"One Grung Above", slug:"oga"},
    61: {name:"Mythic Odysseys of Theros", slug:"moot"},
    62: {name:"Frozen Sick", slug:"wa"},
    66: {name:"Icewind Dale: Rime of the Frostmaiden", slug:"idrotf"},
    67: {name:"Tasha’s Cauldron of Everything", slug:"tcoe"},
    68: {name:"Candlekeep Mysteries", slug:"cm"},
    69: {name:"Van Richten’s Guide to Ravenloft", slug:"vrgtr"},
    79: {name:"The Wild Beyond the Witchlight", slug:"twbtw"},
    80: {name:"Strixhaven: A Curriculum of Chaos", slug:"sacoc"},
    81: {name:"Fizban's Treasury of Dragons", slug:"ftod"},
    83: {name:"Critical Role: Call of the Netherdeep", slug:"cotn"},
    85: {name:"Mordenkainen Presents: Monsters of the Multiverse", slug:"motm"},
    87: {name:"Journeys through the Radiant Citadel", slug:"jttrc"},
    89: {name:"Monstrous Compendium Vol. 1: Spelljammer Creatures", slug:"mcv1"},
    90: {name:"Spelljammer: Adventures in Space", slug:"sais"},
    91: {name:"The Vecna Dossier", slug:"tvd"},
    92: {name:"The Radiant Citadel", slug:"trc"},
    93: {name:"Spelljammer Academy", slug:"sja"},
    94: {name:"Dragons of Stormwreck Isle", slug:"dosi"},
    95: {name:"Dragonlance: Shadow of the Dragon Queen", slug:"sotdq"},
    100: {name:"Unearthed Arcana", slug:"ua"},
    101: {name:"Monstrous Compendium Vol. 2: Dragonlance Creatures", slug:"mcv2"},
    102: {name:"Tyranny of Dragons", slug:"tod"},
    103: {name:"Keys from the Golden Vault", slug:"kftgv"},
    104: {name:"Thieves’ Gallery", slug:"tg"},
    105: {name:"Prisoner 13", slug:"p13"},
    109: {name:"The Book of Many Things", slug:"tbomt"},
    110: {name:"Bigby Presents: Glory of the Giants", slug:"gotg"},
    111: {name:"Legendary Magic Items", slug:"lmi"},
    112: {name:"Misplaced Monsters: Volume One", slug:"mpmv1"},
    113: {name:"Phandelver and Below: The Shattered Obelisk", slug:"pbtso"},
    114: {name:"Planescape: Adventures in the Multiverse", slug:"paitm"},
    116: {name:"Domains of Delight: A Feywild Accessory", slug:"dod"},
    121: {name:"Giants of the Star Forge", slug:"gotsf"},
    122: {name:"Baldur’s Gate Gazetteer", slug:"bgg"},
    123: {name:"Tal’Dorei Campaign Setting Reborn", slug:"tcsr"},
    124: {name:"Monstrous Compendium Vol. 4: Eldraine Creatures", slug:"mcv4"},
    125: {name:"Adventure Atlas: The Mortuary", slug:"aatm"},
    126: {name:"Lightning Keep", slug:"lke"},
    128: {name:"Intro to Stormwreck Isle", slug:"itsi"},
    129: {name:"Heroes’ Feast: Saving the Children’s Menu ", slug:"hfscm"},
    131: {name:"Dungeons of Drakkenheim", slug:"dodr"},
    132: {name:"Vecna: Eve of Ruin", slug:"veor"},
    133: {name:"Humblewood Campaign Setting", slug:"hcs"},
    135: {name:"Vecna: Nest of the Eldritch Eye", slug:"vnee"},
    136: {name:"Descent into the Lost Caverns of Tsojcanth", slug:"dilct"},
    137: {name:"Quests from the Infinite Staircase", slug:"qftis"},
    139: {name:"Tome of Beasts 1", slug:"tob1"},
    142: {name:"Flee, Mortals!", slug:"fm"},
    143: {name:"Where Evil Lives", slug:"wel"},
    145: {name:"Player’s Handbook", slug:"phb-2024"},
    146: {name:"Dungeon Master’s Guide", slug:"dmg-2024"},
    147: {name:"Monster Manual", slug:"mm-2024"},
    148: {name:"The Lord of the Rings Roleplaying", slug:"lotrr"},
    149: {name:"Uni and the Hunt for the Lost Horn", slug:"uhlh"},
    150: {name:"Grim Hollow: Player Pack", slug:"ghpp"},
    151: {name:"Book of Ebon Tides", slug:"boet"},
    152: {name:"Tales from the Shadows", slug:"tfts"},
    153: {name:"Scions of Elemental Evil", slug:"soee"},
    155: {name:"The Illrigger Revised", slug:"tir"},
    156: {name:"The Griffon’s Saddlebag: Book Two", slug:"gsb2"},
    157: {name:"Hold Back The Dead", slug:"hbtd"},
    158: {name:"Humblewood Tales", slug:"hwt"},
    159: {name:"Monsters of Drakkenheim", slug:"modr"},
    160: {name:"Obojima: Tales from the Tall Grass", slug:"ottg"},
    161: {name:"The Malady of Minarrh", slug:"tmom"},
    162: {name:"Heliana’s Guide to Monster Hunting: Part 1", slug:"hgtmh1"},
    163: {name:"Dragon Delves", slug:"drde"},
    164: {name:"Valda’s Spire of Secrets: Player Pack", slug:"vsspp"},
    166: {name:"Grim Hollow: Lairs of Etharis", slug:"loe"},
    167: {name:"Ruins of Symbaroum: Setting Handbook", slug:"ssh"},
    188: {name:"One-Shot Wonders: 10 Coastal One-Shot Adventures", slug:"oswcst"},
    189: {name:"One-Shot Wonders: 10 Desert One-Shot Adventures", slug:"oswdst"},
    190: {name:"One-Shot Wonders: 10 Forest One-Shot Adventures", slug:"oswfst"},
    191: {name:"Eberron: Forge of the Artificer", slug:"efota"},
    193: {name:"The Crooked Moon Part Two: Monsters & Adventure Campaign", slug:"tcmp2"},
    195: {name:"Borderlands Quest: Goblin Trouble", slug:"bqgt"},
    197: {name:"The Gunslinger Class: Valda’s Spire of Secrets", slug:"tgc"},
    199: {name:"Heroes of the Borderlands", slug:"hotb"},
    200: {name:"Cthulhu by Torchlight", slug:"ctbt"},
    202: {name:"Abomination Vaults", slug:"av"},
    203: {name:"Stranger Things: Welcome to the Hellfire Club", slug:"wthc"},
    205: {name:"Forgotten Realms: Heroes of Faerûn", slug:"frhof"},
    206: {name:"Forgotten Realms: Adventures in Faerûn", slug:"fraif"},
    207: {name:"Grim Hollow: Player’s Guide", slug:"ghpg"},
    208: {name:"Grim Hollow: Campaign Guide", slug:"ghcg"},
    216: {name:"Netheril’s Fall", slug:"nf"},
    217: {name:"Astarion's Book of Hungers", slug:"aboh"},
    218: {name:"Forgotten Realms: The Tenebrous Stone", slug:"frtts"},
    220: {name:"Lorwyn: First Light", slug:"lfl"},
    222: {name:"Fated Flight of the Recluse", slug:"ffotr"},
    223: {name:"One-Shot Wonders: Holiday Adventure Pack", slug:"oswhap"},
    224: {name:"Heliana’s Guide to Monster Hunting: Part 2", slug:"hgtmh2"},
    225: {name:"Exploring Eberron (2024)", slug:"exeb"},
    227: {name:"Faster, Purple Worm! Everybody Dies, Vol. 1", slug:"fpw1"},
    228: {name:"The Pugilist Class (2024)", slug:"tpc"},
    229: {name:"The Griffon’s Saddlebag: Book One", slug:"gsb1"},
    230: {name:"Dr Dhrolin’s Dictionary of Dinosaurs", slug:"dddod"},
    232: {name:"Ravenloft: The Horrors Within", slug:"rthw"},
    237: {name:"Borderlands Quest: Dagger Danger!", slug:"bqdd"},
    238: {name:"Northlands Worldbook", slug:"nwb"},
    239: {name:"Northlands Sagas", slug:"ns"},
    240: {name:"Dungeon Masters: Ravenloft Play-Along Pack", slug:"dmr"},
    248: {name:"Shadows of Sithicus", slug:"sos"},
    249: {name:"Steinhardt's Guide to the Eldritch Hunt Player Pack", slug:"sgehpp"},
    269: {name:"Legends of Greyhawk: Elemental Evil Rising", slug:"logeer"},
    272: {name:"Legends of Greyhawk: Tales from Turtleback Cove", slug:"logttc"},
    295: {name:"Legends of Greyhawk: Secrets of the Free City", slug:"logsfc"},
    304: {name:"Tarokka", slug:"taro"},
};
const srcName = (id?: number | null) => id ? (SOURCE_MAP[id]?.name ?? `Source ${id}`) : '';

function cleanText(html: string | null | undefined): string {
    if (!html) return '';
    return html
        .replace(/<\/(p|div|li|td|th|h[1-6])>/gi, ' ')
        .replace(/<(p|br|div|li|tr|td|th|h[1-6])[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/[\u2018\u2019\u201a\u201b\u02bc]/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const stripLevel = (name: string) => name.replace(/^\d+:\s*/, '').trim();

const ABILITY_MAP: Record<number, string> = {1:'Strength',2:'Dexterity',3:'Constitution',4:'Intelligence',5:'Wisdom',6:'Charisma'};
const COMP_MAP:    Record<number, string> = {1:'V',2:'S',3:'M',4:'R'};
const STAT_MAP:    Record<number, string> = {1:'Strength',2:'Dexterity',3:'Constitution',4:'Intelligence',5:'Wisdom',6:'Charisma'};
const ACT_MAP:     Record<number, string> = {1:'Action',2:'Bonus Action',3:'Bonus Action',4:'Reaction',6:'Minute',7:'Hour',8:'Special'};
const CASTER_MAP:  Record<number, string> = {1:'FULL',2:'HALF',3:'THIRD',6:'WARLOCK'};
const SUBCLASS_KW = ['subclass','archetype','tradition','order','circle','domain','college','path','patron','conclave'];
const SIZE_MAP:    Record<number, string> = {2:'Tiny',3:'Small',4:'Medium',5:'Large',6:'Huge',7:'Gargantuan'};

/** Empty grant row — all fields the platform import server reads via grantFields(). */
function emptyGrants(): Grants {
    return {
        grantsSkills:'', grantsExpertise:'', grantsHalfSkills:'',
        expertiseChoiceCount:'', expertiseChoicePool:'',
        grantsSavingThrows:'',
        skillChoiceCount:'', skillChoicePool:'',
        savingThrowChoiceCount:'', savingThrowChoicePool:'',
        grantsTools:'', toolChoiceCount:'', toolChoicePool:'',
        grantsLanguages:'', languageChoiceCount:'', languageChoicePool:'',
        grantsResistances:'', grantsImmunities:'', grantsVulnerabilities:'',
        grantsInnateSpells:'', grantsSpeed:'', grantsSenses:'',
        grantsFeatId:'', grantsFeatCategory:'',
    };
}

/** Merge Python extractor output into the full grant row, normalising field names. */
function mergeGrants(pyGrants: Grants): Grants {
    const g = emptyGrants();
    for (const [k, v] of Object.entries(pyGrants)) {
        if (k in g) (g as Record<string,unknown>)[k] = v;
    }
    return g;
}

function toExcel(rows: Record<string, unknown>[], sheet: string): Buffer {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function dedupBySource<T>(items: T[], key: (i: T) => {name: string; sourceId: number}): T[] {
    const groups = new Map<string, Map<number, T>>();
    for (const item of items) {
        const { name, sourceId } = key(item);
        const k = name.toLowerCase();
        if (!groups.has(k)) groups.set(k, new Map());
        if (!groups.get(k)!.has(sourceId)) groups.get(k)!.set(sourceId, item);
    }
    const result: T[] = [];
    for (const bySource of groups.values()) for (const item of bySource.values()) result.push(item);
    return result;
}

function getSpellArr(rules: Record<string, unknown>, key: string): (number | null)[] {
    const v = rules[key];
    if (Array.isArray(v)) return v as (number | null)[];
    if (v && typeof v === 'object') {
        const obj = v as Record<string, number>;
        return Array.from({length: 21}, (_, i) => obj[String(i)] ?? null);
    }
    return [];
}

// ── Class processor ───────────────────────────────────────────────────────────

// Detect feat category granted by a feature based on description text
function detectFeatCategory(desc: string): string {
    const tl = desc.toLowerCase();
    if (/fighting\s+style|style\s+of\s+fighting/i.test(tl) && /choose|adopt|select/i.test(tl)) return 'Fighting Style';
    if (/epic\s+boon/i.test(tl)) return 'Epic Boon';
    if (/origin\s+feat/i.test(tl)) return 'Origin';
    if (/general\s+feat/i.test(tl)) return 'General';
    if (/ability\s+score\s+improv/i.test(tl) || /ability\s+score\s+increas/i.test(tl)) return 'General';
    if (/feat\s+of\s+your\s+choice|you\s+gain\s+a\s+feat|choose\s+a\s+feat/i.test(tl)) return 'General';
    return '';
}

async function processClasses(items: unknown[]) {
    const parsed = z.array(DdbClassSchema).parse(items);
    const deduped = dedupBySource(parsed, c => ({ name: c.name, sourceId: c.sources?.[0]?.sourceId ?? 0 }));

    // Collect feature descriptions for Python grant extraction
    const descs: {id: number; text: string}[] = [];
    let descId = 0;

    // Class-level descriptions (for grantsSavingThrows on class row)
    const clsDescIds: number[] = [];
    for (let ci = 0; ci < deduped.length; ci++) {
        clsDescIds.push(descId);
        descs.push({ id: descId++, text: cleanText(deduped[ci].description) });
    }

    // Feature descriptions
    const featDescIds: {clsIdx: number; featIdx: number; descId: number}[] = [];
    for (let ci = 0; ci < deduped.length; ci++) {
        for (let fi = 0; fi < deduped[ci].classFeatures.length; fi++) {
            descs.push({ id: descId, text: cleanText(deduped[ci].classFeatures[fi].description) });
            featDescIds.push({ clsIdx: ci, featIdx: fi, descId: descId++ });
        }
    }

    const grants = await runExtractor(descs);

    const classRows: Record<string, unknown>[] = [];
    const featureRows: Record<string, unknown>[] = [];
    const spellSlotRows: Record<string, unknown>[] = [];
    const spellsKnownRows: Record<string, unknown>[] = [];

    for (let ci = 0; ci < deduped.length; ci++) {
        const cls = deduped[ci];
        const sourceId = cls.sources?.[0]?.sourceId ?? 0;
        const uploadId = `${sourceId}:${cls.name}`;
        const clsGrants = mergeGrants(grants.get(clsDescIds[ci]) ?? {});

        // Subclass available level
        const subFeat = cls.classFeatures
            .filter(f => (f.requiredLevel ?? 99) >= 1 && (f.requiredLevel ?? 99) <= 5)
            .find(f => SUBCLASS_KW.some(kw => (f.name ?? '').toLowerCase().includes(kw)));

        classRows.push({
            uploadId,
            name: cls.name,
            hitDice: cls.hitDice ?? '',
            canCastSpells: cls.canCastSpells ? 'true' : 'false',
            subclassAvailableAtLevel: subFeat?.requiredLevel ?? 3,
            primaryAbilities: (cls.primaryAbilities ?? []).map(id => ABILITY_MAP[id] ?? '').filter(Boolean).join(','),
            equipmentDescription: cleanText(cls.equipmentDescription),
            description: cleanText(cls.description),
            source: srcName(sourceId),
            link: cls.moreDetailsUrl ? `https://www.dndbeyond.com${cls.moreDetailsUrl}` : '',
            sortOrder: ci + 1,
            skillChoiceCount: clsGrants.skillChoiceCount || '',
            grantsSavingThrows: clsGrants.grantsSavingThrows || '',
            skillPool: clsGrants.skillChoicePool || '',
        });
    }

    // Class features
    for (const { clsIdx, featIdx, descId: dId } of featDescIds) {
        const cls = deduped[clsIdx];
        const f = cls.classFeatures[featIdx];
        const sourceId = cls.sources?.[0]?.sourceId ?? 0;
        const featSrcId = (f.definition?.sources?.[0]?.sourceId) ?? sourceId;
        const featName = stripLevel(f.name ?? '');
        const g = mergeGrants(grants.get(dId) ?? {});
        featureRows.push({
            uploadId: `${featSrcId}:${cls.name}:${featName}:${f.requiredLevel ?? 1}`,
            classUploadId: `${sourceId}:${cls.name}`,
            className: cls.name,
            name: featName,
            requiredLevel: f.requiredLevel ?? 1,
            description: cleanText(f.description),
            url: f.moreDetailsUrl ? `https://www.dndbeyond.com${f.moreDetailsUrl}` : '',
            ...g,
            grantsFeatCategory: detectFeatCategory(cleanText(f.description)),
        });
    }

    // Spell slots & spells known
    for (const cls of deduped) {
        if (!cls.canCastSpells || !cls.spellRules) continue;
        const sourceId = cls.sources?.[0]?.sourceId ?? 0;
        const rules = cls.spellRules as Record<string, unknown>;
        const ctType = CASTER_MAP[rules.multiClassSpellSlotDivisor as number] ?? 'FULL';
        const cantrips  = getSpellArr(rules, 'levelCantripsKnownMaxes');
        const prepared  = getSpellArr(rules, 'levelPreparedSpellMaxes');
        const known     = getSpellArr(rules, 'levelSpellKnownMaxes');
        const hasPrepared = prepared.filter(Boolean).length > 1;
        const hasKnown    = known.filter(Boolean).length > 1;

        for (let lv = 1; lv <= 20; lv++) {
            const slotSrc = rules.levelSpellSlots;
            const slots: number[] = Array.isArray(slotSrc)
                ? ((slotSrc as (number[]|null)[])[lv] ?? [])
                : ((slotSrc as Record<string, number[]>)?.[String(lv)] ?? []);

            spellSlotRows.push({
                'Class Name': cls.name, 'Subclass Name': '', 'Class Upload ID': `${sourceId}:${cls.name}`,
                'Caster Type': ctType, 'Level': lv,
                'Slot 1': slots[0]??0,'Slot 2': slots[1]??0,'Slot 3': slots[2]??0,
                'Slot 4': slots[3]??0,'Slot 5': slots[4]??0,'Slot 6': slots[5]??0,
                'Slot 7': slots[6]??0,'Slot 8': slots[7]??0,'Slot 9': slots[8]??0,
            });
            spellsKnownRows.push({
                'Class Name': cls.name, 'Subclass Name': '', 'Class Upload ID': `${sourceId}:${cls.name}`, 'Level': lv,
                'Cantrips':  cantrips[lv]  ?? '',
                'Prepared':  hasPrepared ? (prepared[lv] ?? '') : hasKnown ? (known[lv] ?? '') : '',
                'Additional': '', 'Note': '',
            });
        }
    }

    return {
        'classes.xlsx':       toExcel(classRows,       'classes'),
        'classFeatures.xlsx': toExcel(featureRows,     'classFeatures'),
        'spellSlots.xlsx':    toExcel(spellSlotRows,   'spellSlots'),
        'spellsKnown.xlsx':   toExcel(spellsKnownRows, 'spellsKnown'),
    };
}

// ── Subclass processor ────────────────────────────────────────────────────────

async function processSubclasses(items: unknown[], classMap: Map<number, {name: string; uploadId: string}>) {
    const parsed = z.array(DdbSubclassSchema).parse(items);

    // Identify shared base class features
    const idCount = new Map<number, number>();
    for (const sub of parsed) {
        const seen = new Set<number>();
        for (const f of sub.classFeatures) {
            if (f.id != null && !seen.has(f.id)) { seen.add(f.id); idCount.set(f.id, (idCount.get(f.id) ?? 0) + 1); }
        }
    }
    const isShared = (id?: number) => id != null && (idCount.get(id) ?? 0) > 1;

    const deduped = dedupBySource(parsed, s => ({ name: s.name, sourceId: s.sources?.[0]?.sourceId ?? 0 }));

    // Collect unique feature descriptions
    const descs: {id: number; text: string}[] = [];
    type FMeta = { subIdx: number; srcId: number; subName: string; featName: string; level: number; parentUploadId: string; parentSrcId: number; parentName: string };
    const featMeta: FMeta[] = [];
    let descId = 0;

    for (let si = 0; si < deduped.length; si++) {
        const sub = deduped[si];
        const sourceId = sub.sources?.[0]?.sourceId ?? 0;
        const parent = classMap.get(sub.parentClassId) ?? { name: `Class${sub.parentClassId}`, uploadId: `0:unknown` };
        for (const f of sub.classFeatures.filter(f => !isShared(f.id))) {
            descs.push({ id: descId, text: cleanText(f.description) });
            featMeta.push({
                subIdx: si,
                srcId: (f.definition?.sources?.[0]?.sourceId) ?? sourceId,
                subName: sub.name, featName: stripLevel(f.name ?? ''), level: f.requiredLevel ?? 3,
                parentUploadId: parent.uploadId, parentSrcId: sourceId, parentName: parent.name,
            });
            descId++;
        }
    }

    const grants = await runExtractor(descs);

    const subclassRows: Record<string, unknown>[] = [];
    const featureRows:  Record<string, unknown>[] = [];

    for (let si = 0; si < deduped.length; si++) {
        const sub = deduped[si];
        const sourceId = sub.sources?.[0]?.sourceId ?? 0;
        const parent = classMap.get(sub.parentClassId) ?? { name: `Class${sub.parentClassId}`, uploadId: `0:unknown` };
        subclassRows.push({
            uploadId: `${sourceId}:${sub.name}`,
            classUploadId: parent.uploadId,
            className: parent.name,
            name: sub.name,
            description: cleanText(sub.description),
            source: srcName(sourceId),
            link: sub.moreDetailsUrl ? `https://www.dndbeyond.com${sub.moreDetailsUrl}` : '',
            canCastSpells: sub.spellCastingAbilityId != null ? 'true' : 'false',
            sortOrder: si + 1,
        });
    }

    for (let i = 0; i < featMeta.length; i++) {
        const m = featMeta[i];
        const g = mergeGrants(grants.get(i) ?? {});
        featureRows.push({
            uploadId: `${m.srcId}:${m.subName}:${m.featName}:${m.level}`,
            classUploadId: m.parentUploadId,
            subclassUploadId: `${m.parentSrcId}:${m.subName}`,
            className: m.parentName,
            subclassName: m.subName,
            name: m.featName,
            requiredLevel: m.level,
            description: descs[i]?.text ?? '',
            url: '',
            ...g,
            grantsFeatCategory: detectFeatCategory(descs[i]?.text ?? ''),
        });
    }

    return {
        'subclasses.xlsx':       toExcel(subclassRows, 'subclasses'),
        'subclassFeatures.xlsx': toExcel(featureRows,  'subclassFeatures'),
    };
}

// ── Species processor ─────────────────────────────────────────────────────────

function extractSenses(text: string): string {
    const found: string[] = [];
    for (const re of [
        /Darkvision\s+(\d+)\s*(?:ft|feet)/i,
        /Blindsight\s+(\d+)\s*(?:ft|feet)/i,
        /Tremorsense\s+(\d+)\s*(?:ft|feet)/i,
        /Truesight\s+(\d+)\s*(?:ft|feet)/i,
    ]) {
        const m = text.match(re);
        if (m) found.push(m[0].replace(/feet/i, 'ft').replace(/\.\s*$/, '').trim());
    }
    return found.join(', ');
}

function extractSpeed(text: string): Record<string, number | undefined> {
    const sp: Record<string, number | undefined> = {};
    const pats: [string, RegExp][] = [
        ['WALK', /(?:walking|base)\s+speed\s+(?:is|of)\s+(\d+)/i],
        ['WALK', /[Yy]our speed is (\d+)/],
        ['FLY',  /fly(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i],
        ['SWIM', /swim(?:ming)?\s+speed\s+(?:is|of)\s+(\d+)/i],
        ['CLIMB',/climb(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i],
        ['BURROW',/burrow(?:ing)?\s+speed\s+(?:is|of)\s+(\d+)/i],
    ];
    for (const [key, re] of pats) {
        if (!sp[key]) { const m = text.match(re); if (m) sp[key] = parseInt(m[1]); }
    }
    return sp;
}

function extractSize(text: string): { fixed: string; choices: string } {
    const cM = text.match(/(Small|Medium|Large|Tiny|Huge|Gargantuan)\s+or\s+(Small|Medium|Large|Tiny|Huge|Gargantuan)/i);
    if (cM) return { fixed: '', choices: `${cM[1]},${cM[2]}` };
    const fM = text.match(/(?:size\s+is|you\s+are|Size:)\s*(Tiny|Small|Medium|Large|Huge|Gargantuan)/i);
    return fM ? { fixed: fM[1], choices: '' } : { fixed: '', choices: '' };
}

async function processSpecies(items: unknown[]) {
    const parsed = z.array(DdbSpeciesSchema).parse(items);
    const withName = parsed.map(s => ({ ...s, name: s.fullName }));
    const deduped = dedupBySource(withName, s => ({ name: s.name, sourceId: s.sources?.[0]?.sourceId ?? 0 }));

    const descs: {id: number; text: string}[] = [];
    type TMeta = { spName: string; traitName: string; level: number; srcId: number; speciesUploadId: string; sizeId: number };
    const traitMeta: TMeta[] = [];
    let descId = 0;

    for (const sp of deduped) {
        const sourceId = sp.sources?.[0]?.sourceId ?? 0;
        const speciesUploadId = `${sourceId}:${sp.name}`;
        for (const t of sp.racialTraits) {
            const def = t.definition;
            descs.push({ id: descId, text: cleanText(def?.description ?? t.description ?? '') });
            traitMeta.push({
                spName: sp.name, traitName: def?.name ?? t.name ?? '',
                level: def?.requiredLevel ?? t.requiredLevel ?? 1,
                srcId: def?.sources?.[0]?.sourceId ?? sourceId,
                speciesUploadId, sizeId: sp.sizeId,
            });
            descId++;
        }
    }

    const grants = await runExtractor(descs);

    const speciesRows = deduped.map((sp, i) => {
        const sourceId = sp.sources?.[0]?.sourceId ?? 0;
        return {
            uploadId: `${sourceId}:${sp.name}`,
            name: sp.name, description: cleanText(sp.description),
            source: srcName(sourceId),
            link: sp.moreDetailsUrl ? `https://www.dndbeyond.com${sp.moreDetailsUrl}` : '',
            isSubrace: sp.isSubRace ? 'true' : 'false',
            isLegacy: sp.isLegacy ? 'true' : 'false',
            sortOrder: i + 1,
        };
    });

    // Per-species: track whether any trait explicitly provides speed/size
    // so we know whether to add a Base Physiology fallback row
    const traitRows: Record<string, unknown>[] = [];
    let currentSpName = '';
    let explicitSpeed = false;
    let explicitSize  = false;

    for (let i = 0; i < traitMeta.length; i++) {
        const m = traitMeta[i];
        const desc = descs[i]?.text ?? '';
        const g = mergeGrants(grants.get(i) ?? {});
        const speeds = extractSpeed(desc);
        const sz = extractSize(desc);
        const senses = extractSenses(desc);

        // Detect species boundary
        if (m.spName !== currentSpName) {
            // Flush Base Physiology for previous species if needed
            if (currentSpName !== '') {
                const prevSp = deduped.find(s => s.name === currentSpName)!;
                const prevSrcId = prevSp.sources?.[0]?.sourceId ?? 0;
                if (!explicitSpeed || !explicitSize) {
                    const ws = prevSp.weightSpeeds?.normal;
                    traitRows.push({
                        uploadId: `${prevSrcId}:${currentSpName}:Base Physiology`,
                        speciesUploadId: `${prevSrcId}:${currentSpName}`,
                        speciesName: currentSpName,
                        name: 'Base Physiology',
                        requiredLevel: 1,
                        description: 'Inherent physical characteristics.',
                        size: explicitSize ? '' : (SIZE_MAP[prevSp.sizeId] ?? ''),
                        sizeChoices: '', senses: '',
                        WALK:   explicitSpeed ? '' : (ws?.walk   || ''),
                        FLY:    ws?.fly    || '',
                        SWIM:   ws?.swim   || '',
                        CLIMB:  ws?.climb  || '',
                        BURROW: ws?.burrow || '',
                        ...emptyGrants(),
                    });
                }
            }
            currentSpName = m.spName;
            explicitSpeed = false;
            explicitSize  = false;
            }

        if (speeds['WALK']) explicitSpeed = true;
        if (sz.fixed || sz.choices || /size|medium|small|tiny|large/i.test(desc)) explicitSize = true;

        traitRows.push({
            uploadId: `${m.srcId}:${m.spName}:${m.traitName}`,
            speciesUploadId: m.speciesUploadId,
            speciesName: m.spName,
            name: m.traitName, requiredLevel: m.level,
            description: desc,
            size: sz.fixed, sizeChoices: sz.choices,
            senses,
            WALK: speeds['WALK'] ?? '', FLY: speeds['FLY'] ?? '',
            SWIM: speeds['SWIM'] ?? '', CLIMB: speeds['CLIMB'] ?? '',
            BURROW: speeds['BURROW'] ?? '',
            ...g,
            grantsFeatCategory: detectFeatCategory(desc),
        });
    }

    // Flush last species
    if (currentSpName) {
        const lastSp = deduped.find(s => s.name === currentSpName)!;
        const lastSrcId = lastSp.sources?.[0]?.sourceId ?? 0;
        if (!explicitSpeed || !explicitSize) {
            const ws = lastSp.weightSpeeds?.normal;
            traitRows.push({
                uploadId: `${lastSrcId}:${currentSpName}:Base Physiology`,
                speciesUploadId: `${lastSrcId}:${currentSpName}`,
                speciesName: currentSpName,
                name: 'Base Physiology',
                requiredLevel: 1,
                description: 'Inherent physical characteristics.',
                size: explicitSize ? '' : (SIZE_MAP[lastSp.sizeId] ?? ''),
                sizeChoices: '', senses: '',
                WALK:   explicitSpeed ? '' : (ws?.walk   || ''),
                FLY:    ws?.fly    || '',
                SWIM:   ws?.swim   || '',
                CLIMB:  ws?.climb  || '',
                BURROW: ws?.burrow || '',
                ...emptyGrants(),
            });
        }
    }

    return { 'species.xlsx': toExcel(speciesRows, 'species'), 'speciesTraits.xlsx': toExcel(traitRows, 'speciesTraits') };
}

// ── Background processor ──────────────────────────────────────────────────────

const SKILLS = new Set([
    'Acrobatics','Animal Handling','Arcana','Athletics','Deception','History',
    'Insight','Intimidation','Investigation','Medicine','Nature','Perception',
    'Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival'
]);

function parseSkillProf(text: string): { grantsSkills: string; skillChoiceCount: number; skillChoicePool: string } {
    if (!text) return { grantsSkills: '', skillChoiceCount: 0, skillChoicePool: '' };
    const t = text.replace(/\s+/g, ' ').trim();

    // Choice pattern: "Choose N from X, Y, Z" or "Choose two from among X, Y"
    const choiceM = t.match(/Choose\s+(\w+)\s+(?:from\s+among|from)\s+(.+)/i);
    if (choiceM) {
        const WORD_NUMS: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6 };
        const count = WORD_NUMS[choiceM[1].toLowerCase()] ?? parseInt(choiceM[1]) ?? 1;
        const pool = extractSkillNames(choiceM[2]);
        return { grantsSkills: '', skillChoiceCount: count, skillChoicePool: pool.join(',') };
    }

    // Direct grants: "History, Insight" or "History and Insight"
    const skills = extractSkillNames(t);
    return { grantsSkills: skills.join(','), skillChoiceCount: 0, skillChoicePool: '' };
}

function extractSkillNames(text: string): string[] {
    const found: string[] = [];
    // Sort by length desc to match "Sleight of Hand" before "Sleight"
    const sorted = [...SKILLS].sort((a, b) => b.length - a.length);
    const lower = text.toLowerCase();
    for (const skill of sorted) {
        if (lower.includes(skill.toLowerCase()) && !found.includes(skill)) {
            found.push(skill);
        }
    }
    return found;
}

// Tool categories — expanded when a background grants "one type of X"
const ARTISAN_TOOLS = [
    "Alchemist's Supplies","Brewer's Supplies","Calligrapher's Supplies",
    "Carpenter's Tools","Cartographer's Tools","Cobbler's Tools","Cook's Utensils",
    "Glassblower's Tools","Jeweler's Tools","Leatherworker's Tools","Mason's Tools",
    "Painter's Supplies","Potter's Tools","Smith's Tools","Tinker's Tools",
    "Weaver's Tools","Woodcarver's Tools",
];
const GAMING_SETS = [
    "Dice Set","Dragonchess Set","Playing Card Set","Three-Dragon Ante Set",
];
const MUSICAL_INSTRUMENTS = [
    "Bagpipes","Drum","Dulcimer","Flute","Lute","Lyre",
    "Horn","Pan Flute","Shawm","Viol",
];
// Maps lowercase category/alias → expanded tool list
const TOOL_CATEGORY_MAP: Record<string, string[]> = {
    "artisan's tools": ARTISAN_TOOLS,
    "artisans' tools": ARTISAN_TOOLS,
    "artisan tools": ARTISAN_TOOLS,
    "gaming set": GAMING_SETS,
    "gaming sets": GAMING_SETS,
    "musical instrument": MUSICAL_INSTRUMENTS,
    "musical instruments": MUSICAL_INSTRUMENTS,
    "wind musical instrument": MUSICAL_INSTRUMENTS,
};

// Maps lowercase specific tool name → canonical form
const TOOL_CANON: Record<string, string> = {
    "alchemist's supplies": "Alchemist's Supplies",
    "alchemists' supplies": "Alchemist's Supplies",
    "brewer's supplies": "Brewer's Supplies",
    "calligrapher's supplies": "Calligrapher's Supplies",
    "calligraphers' supplies": "Calligrapher's Supplies",
    "calligrapher's tools": "Calligrapher's Supplies",
    "carpenter's tools": "Carpenter's Tools",
    "carpenter's": "Carpenter's Tools",
    "cartographer's tools": "Cartographer's Tools",
    "cartographer's": "Cartographer's Tools",
    "cobbler's tools": "Cobbler's Tools",
    "cook's utensils": "Cook's Utensils",
    "disguise kit": "Disguise Kit",
    "forgery kit": "Forgery Kit",
    "glassblower's tools": "Glassblower's Tools",
    "herbalism kit": "Herbalism Kit",
    "jeweler's tools": "Jeweler's Tools",
    "leatherworker's tools": "Leatherworker's Tools",
    "mason's tools": "Mason's Tools",
    "mason's": "Mason's Tools",
    "navigator's tools": "Navigator's Tools",
    "navigator's": "Navigator's Tools",
    "painter's supplies": "Painter's Supplies",
    "poisoner's kit": "Poisoner's Kit",
    "potter's tools": "Potter's Tools",
    "smith's tools": "Smith's Tools",
    "thieves' tools": "Thieves' Tools",
    "thieves tools": "Thieves' Tools",
    "tinker's tools": "Tinker's Tools",
    "weaver's tools": "Weaver's Tools",
    "woodcarver's tools": "Woodcarver's Tools",
    "vehicles (land)": "Vehicles (Land)",
    "vehicles (water)": "Vehicles (Water)",
    "vehicles (space)": "Vehicles (Space)",
    "vehicles (sea/air)": "Vehicles (Sea/Air)",
    "vehicles (water, land)": "Vehicles (Water, Land)",
    "dice set": "Dice Set",
    "dragonchess set": "Dragonchess Set",
    "playing card set": "Playing Card Set",
    "three-dragon ante set": "Three-Dragon Ante Set",
    "bagpipes": "Bagpipes",
    "drum": "Drum",
    "dulcimer": "Dulcimer",
    "flute": "Flute",
    "lute": "Lute",
    "lyre": "Lyre",
    "horn": "Horn",
    "pan flute": "Pan Flute",
    "shawm": "Shawm",
    "viol": "Viol",
    "firearms": "Firearms",
};

function resolveToolToken(token: string): string[] {
    const key = token.trim().toLowerCase()
        // Strip leading quantity/type/other words
        .replace(/^(?:one\s+other\s+(?:set|type|kind)\s+of\s+|one\s+(?:type|kind|set)?\s*(?:of\s+)?|any\s+one\s+|one\s+|a\s+)/i, '')
        // Strip trailing non-canonical parentheticals
        .replace(/\s*\((?!land|water|space|sea\/air|water,\s*land)[^)]+\)/gi, '')
        .trim();
    // Check category first
    if (TOOL_CATEGORY_MAP[key]) return TOOL_CATEGORY_MAP[key];
    // Check specific tool
    const canonical = TOOL_CANON[key];
    if (canonical) return [canonical];
    // Fallback: title-case preserving apostrophes
    return [token.trim().replace(/(?<![\w'])[a-z]/g, c => c.toUpperCase())];
}

function parseToolProf(text: string): { grantsTools: string; toolChoiceCount: number; toolChoicePool: string } {
    if (!text) return { grantsTools: '', toolChoiceCount: 0, toolChoicePool: '' };
    const t = text.replace(/\s+/g, ' ').trim();
    const WORD_NUMS: Record<string, number> = { one:1,two:2,three:3,four:4,five:5 };

    // "You gain proficiency in N X of your choice"
    const gainChoiceM = t.match(/gain\s+proficiency\s+(?:with|in)\s+(\w+)\s+(.+?)(?:\s+of\s+your\s+choice|\.)?$/i);
    if (gainChoiceM && /choice/i.test(t)) {
        const count = WORD_NUMS[gainChoiceM[1].toLowerCase()] ?? parseInt(gainChoiceM[1]) ?? 1;
        const pool = resolveToolToken(gainChoiceM[2]).join(',');
        return { grantsTools: '', toolChoiceCount: count, toolChoicePool: pool };
    }
    // "You gain proficiency with one tool of your choice"
    if (/gain\s+proficiency\s+(?:with|in)\s+one\s+tool\s+of\s+your\s+choice/i.test(t)) {
        return { grantsTools: '', toolChoiceCount: 1, toolChoicePool: '' };
    }

    // "Choose N from/among X, Y, and Z"
    const chooseFromM = t.match(/Choose\s+(\w+)\s+(?:from\s+among|from)\s+(.+)/i);
    if (chooseFromM) {
        const count = WORD_NUMS[chooseFromM[1].toLowerCase()] ?? parseInt(chooseFromM[1]) ?? 1;
        const tokens = chooseFromM[2].split(/,|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
        const pool = tokens.flatMap(resolveToolToken).join(',');
        return { grantsTools: '', toolChoiceCount: count, toolChoicePool: pool };
    }

    // "Choose X, Y, or Z" (explicit list)
    const chooseListM = t.match(/^Choose\s+(.+)/i);
    if (chooseListM) {
        const tokens = chooseListM[1].split(/,|\s+or\s+/i).map(s => s.trim()).filter(Boolean);
        const pool = tokens.flatMap(resolveToolToken).join(',');
        return { grantsTools: '', toolChoiceCount: 1, toolChoicePool: pool };
    }

    // "One type of X" / "Any one X" / "Your choice of X" / "One gaming set"
    const oneM = t.match(/^(?:Any\s+one\s+|One\s+(?:type|kind|set)?\s*(?:of\s+)?|Your\s+choice\s+of\s+)(.+?)(?:\s+of\s+your\s+choice.*)?$/i);
    if (oneM && /^(?:any|one|your)/i.test(t)) {
        // Split on comma or "or" — e.g. "one gaming set, thieves' tools" or "one artisan's or musical instrument"
        const tokens = oneM[1].split(/,|\s+or\s+(?:one\s+(?:type\s+of\s+)?)?/i).map(s => s.trim()).filter(Boolean);
        const resolvedTokens = tokens.map(resolveToolToken);
        const categoryPools = resolvedTokens.filter(r => r.length > 1).flat();
        const specificGrants = resolvedTokens.filter(r => r.length === 1).flat();
        const pool = categoryPools.join(',');
        const grants = specificGrants.join(',');
        if (pool && grants) return { grantsTools: grants, toolChoiceCount: 1, toolChoicePool: pool };
        if (pool) return { grantsTools: '', toolChoiceCount: 1, toolChoicePool: pool };
        return { grantsTools: grants, toolChoiceCount: 0, toolChoicePool: '' };
    }

    // "X or Y" / "X, Y, or Z" → choice of 1, expand each token
    if (/\bor\b/i.test(t)) {
        const clean = t.replace(/^Either\s+/i, '').replace(/\s*\(one\s+of\s+your\s+choice\)/i, '');
        // Split on comma or "or" to handle "X, Y, or Z"
        const tokens = clean.split(/,|\s+or\s+/i).map(s => s.trim()).filter(Boolean);
        const pool = tokens.flatMap(resolveToolToken).join(',');
        return { grantsTools: '', toolChoiceCount: 1, toolChoicePool: pool };
    }

    // Direct grants: split on comma and "and", resolve each
    const tokens = t.split(/,|\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    // If any token resolves to a category (multiple tools), treat as choice of 1 from expanded pool
    let hasCategory = false;
    const resolvedParts: string[][] = tokens.map(tok => {
        const r = resolveToolToken(tok);
        if (r.length > 1) hasCategory = true;
        return r;
    });
    if (hasCategory) {
        // Mixed: specific tools become grants, categories become choice pool
        const grants: string[] = [];
        const pool: string[] = [];
        resolvedParts.forEach((r) => {
            if (r.length > 1) pool.push(...r);
            else grants.push(...r);
        });
        if (pool.length && !grants.length) return { grantsTools: '', toolChoiceCount: 1, toolChoicePool: pool.join(',') };
        // Has both specific grants and a category choice — put specific as grants, category as pool
        return { grantsTools: grants.join(','), toolChoiceCount: 1, toolChoicePool: pool.join(',') };
    }
    return { grantsTools: resolvedParts.flat().join(','), toolChoiceCount: 0, toolChoicePool: '' };
}

const ALL_LANGUAGES = [
    'Abyssal','Aquan','Auran','Celestial','Common','Deep Speech','Draconic',
    'Dwarvish','Elvish','Giant','Gnomish','Goblin','Halfling','Infernal',
    'Orc','Primordial','Sylvan','Terran','Undercommon',
];

function parseLangProf(text: string): { grantsLanguages: string; languageChoiceCount: number; languageChoicePool: string } {
    if (!text) return { grantsLanguages: '', languageChoiceCount: 0, languageChoicePool: '' };
    const t = text.replace(/\s+/g, ' ').trim().replace(/\.$/,'');
    const WORD_NUMS: Record<string, number> = { one:1,two:2,three:3,four:4 };

    // "Choose N of X, Y, Z" / "Choose either X or Y"
    const chooseM = t.match(/Choose\s+(\w+)(?:\s+of|,)?\s+(?:one\s+of\s+which\s+must\s+be\s+)?(.+)/i)
        ?? t.match(/Choose\s+either\s+(.+)/i);
    if (chooseM) {
        const count = WORD_NUMS[chooseM[1].toLowerCase()] ?? parseInt(chooseM[1]) ?? 1;
        const pool = chooseM[2]?.replace(/^(Abyssal|Celestial|.*)?\s+recommended\).*$/i, '').trim() ?? '';
        return { grantsLanguages: '', languageChoiceCount: count, languageChoicePool: pool };
    }

    // "Two/One of your choice" / "Any one of your choice"
    const ofChoiceM = t.match(/^(?:Any\s+)?(\w+)\s+(?:language\s+)?of\s+your\s+choice/i);
    if (ofChoiceM) {
        const count = WORD_NUMS[ofChoiceM[1].toLowerCase()] ?? 1;
        return { grantsLanguages: '', languageChoiceCount: count, languageChoicePool: '' };
    }

    // "One of your choice of X, Y, Z"
    const oneOfM = t.match(/[Oo]ne\s+of\s+your\s+choice\s+of\s+(.+)/i);
    if (oneOfM) return { grantsLanguages: '', languageChoiceCount: 1, languageChoicePool: oneOfM[1] };

    // "X and one other of your choice" / "X and one other language of your choice"
    const andChoiceM = t.match(/^(.+?)\s+and\s+(?:one|\d+)\s+other\s+(?:language\s+)?of\s+your\s+choice/i);
    if (andChoiceM) {
        return { grantsLanguages: andChoiceM[1].trim(), languageChoiceCount: 1, languageChoicePool: '' };
    }

    // "X or Y" / "X or one other of your choice ..."  → choice of 1
    if (/\bor\b/i.test(t)) {
        const parts = t.split(/\s+or\s+/i);
        // "X or one other of your choice if you already speak X" → grant X + choice of 1
        if (/one other|if you already/i.test(t)) {
            const fixed = parts[0].trim();
            return { grantsLanguages: fixed, languageChoiceCount: 1, languageChoicePool: ALL_LANGUAGES.filter(l => l.toLowerCase() !== fixed.toLowerCase()).join(',') };
        }
        // "X or Y of your choice" → choice of 1
        if (/your choice/i.test(t)) {
            const fixed = parts[0].trim();
            return { grantsLanguages: '', languageChoiceCount: 1, languageChoicePool: fixed };
        }
        const pool = parts.map(s => s.trim()).join(',');
        return { grantsLanguages: '', languageChoiceCount: 1, languageChoicePool: pool };
    }

    // "you can speak as well as understand X"
    const speakM = t.match(/(?:speak|understand)\s+(?:as\s+well\s+as\s+\w+\s+)?(.+)/i);
    if (speakM) return { grantsLanguages: speakM[1].trim(), languageChoiceCount: 0, languageChoicePool: '' };

    // Direct grant
    return { grantsLanguages: t, languageChoiceCount: 0, languageChoicePool: '' };
}

function resolveFeatGrant(grantedFeats: {id: number; name: string; featIds: number[]}[] | null): { grantsFeatId: string; grantsFeatCategory: string } {
    const isAbilityScore = (name: string) =>
        /ability score/i.test(name) || /^abiity scores?$/i.test(name) || /ability score increase/i.test(name);

    const feats = (grantedFeats ?? []).filter(gf => !isAbilityScore(gf.name));
    if (!feats.length) return { grantsFeatId: '', grantsFeatCategory: '' };

    // Any entry with multiple featIds = player choice from origin pool
    const hasChoice = feats.some(gf => gf.featIds.length > 1);
    if (hasChoice) return { grantsFeatId: '', grantsFeatCategory: 'Origin' };

    // Single specific feat
    return { grantsFeatId: feats[0].name, grantsFeatCategory: '' };
}

async function processBackgrounds(items: unknown[]) {
    const parsed = z.array(DdbBackgroundSchema).parse(items);
    const deduped = dedupBySource(parsed, b => ({ name: b.name, sourceId: b.sources?.[0]?.sourceId ?? 0 }));

    const rows = deduped.map((b, i) => {
        const sourceId = b.sources?.[0]?.sourceId ?? 0;
        const skillP = parseSkillProf(cleanText(b.skillProficienciesDescription));
        const toolP  = parseToolProf(cleanText(b.toolProficienciesDescription));
        const langP  = parseLangProf(cleanText(b.languagesDescription));
        const { grantsFeatId, grantsFeatCategory } = resolveFeatGrant(b.grantedFeats);

        return {
            uploadId: `${sourceId}:${b.name}`,
            name: b.name,
            shortDescription: cleanText(b.shortDescription ?? b.cardDescription ?? ''),
            featureName: b.featureName ?? '',
            grantsFeatCategory,
            grantsFeatId,
            grantsSkills:           skillP.grantsSkills,
            skillChoiceCount:       skillP.skillChoiceCount || '',
            skillChoicePool:        skillP.skillChoicePool,
            savingThrowChoiceCount: '',
            savingThrowChoicePool:  '',
            grantsTools:            toolP.grantsTools,
            toolChoiceCount:        toolP.toolChoiceCount || '',
            toolChoicePool:         toolP.toolChoicePool,
            grantsLanguages:        langP.grantsLanguages,
            languageChoiceCount:    langP.languageChoiceCount || '',
            languageChoicePool:     langP.languageChoicePool,
            grantsResistances:      '',
            grantsImmunities:       '',
            grantsVulnerabilities:  '',
            grantsInnateSpells:     '',
            grantsSpeed:            '',
            grantsSenses:           '',
            url: b.moreDetailsUrl ? `https://www.dndbeyond.com${b.moreDetailsUrl}` : '',
            sortOrder: i + 1,
        };
    });

    return { 'backgrounds.xlsx': toExcel(rows, 'backgrounds') };
}

// ── Feat processor ────────────────────────────────────────────────────────────

const ABILITY_SCORES = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];

function extractASI(text: string): { asiAmount: string; asiStatFixed: string; asiStatChoices: string } {
    // Match "Increase your/one/a X[, Y, or Z] [score] by N"
    const m = text.match(/Increase\s+(?:your|one|a)\s+([A-Za-z, ]+?)\s+(?:score\s+)?by\s+(\d+)/i);
    if (!m) return { asiAmount: '', asiStatFixed: '', asiStatChoices: '' };
    const amount = m[2];
    const statPart = m[1].trim();
    if (/ability score|one ability|of your choice|chosen ability/i.test(statPart)) {
        return { asiAmount: amount, asiStatFixed: '', asiStatChoices: ABILITY_SCORES.join(',') };
    }
    // Extract all ability score names from the stat part (handles "X, Y, or Z")
    const found = ABILITY_SCORES.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(statPart));
    if (found.length > 1) return { asiAmount: amount, asiStatFixed: '', asiStatChoices: found.join(',') };
    if (found.length === 1) return { asiAmount: amount, asiStatFixed: found[0], asiStatChoices: '' };
    return { asiAmount: '', asiStatFixed: '', asiStatChoices: '' };
}

async function processFeats(items: unknown[]) {
    const parsed = z.array(DdbFeatSchema).parse(items);
    const deduped = dedupBySource(parsed, f => ({ name: f.name, sourceId: f.sources?.[0]?.sourceId ?? 0 }));

    const descs = deduped.map((f, i) => ({ id: i, text: cleanText(f.description) }));
    const grants = await runExtractor(descs);

    const rows = deduped.map((feat, i) => {
        const sourceId = feat.sources?.[0]?.sourceId ?? 0;
        const g = mergeGrants(grants.get(i) ?? {});
        const catNames = feat.categories.map((c: {tagName: string}) => c.tagName);
        const cats = catNames.join(',');
        const isEpicBoon = catNames.includes('Epic Boon');
        return {
            uploadId: `${sourceId}:${feat.name}`,
            name: feat.name,
            description: cleanText(feat.description),
            snippet: cleanText(feat.snippet),
            repeatable: feat.isRepeatable ? 'true' : 'false',
            categories: cats,
            prerequisites: (feat.prerequisites ?? []).map((p: {description: string | null}) => p.description ?? '').filter(Boolean).join('; '),
            detailsUrl: feat.moreDetailsUrl ? `https://www.dndbeyond.com${feat.moreDetailsUrl}` : '',
            link: feat.moreDetailsUrl ? `https://www.dndbeyond.com${feat.moreDetailsUrl}` : '',
            isEpicBoon: isEpicBoon ? 'true' : 'false',
            ...extractASI(cleanText(feat.description)),
            source: srcName(sourceId),
            sortOrder: i + 1,
            ...g,
        };
    });

    return { 'feats.xlsx': toExcel(rows, 'feats') };
}

// ── Spell processor ───────────────────────────────────────────────────────────

type SpellModifier = {
    type?: string; subType?: string;
    die?: { diceString?: string; fixedValue?: number | null };
    value?: number | null;
    atHigherLevels?: { higherLevelDefinitions?: { level: number; dice?: { diceString?: string } }[] }
};

function buildDamageString(diceStr: string | undefined, subType: string | undefined): string {
    if (!diceStr) return '';
    const skip = ['additional', 'all', 'melee-weapon-attacks'];
    const type = subType && !skip.includes(subType) ? subType.charAt(0).toUpperCase() + subType.slice(1) : '';
    return type ? `${diceStr} ${type}` : diceStr;
}


function buildUpcastDamage(dmgMods: SpellModifier[], slotIncrement: number): string {
    // Build upcast damage string with + prefix per modifier
    const parts: string[] = [];
    for (const mod of dmgMods) {
        const hl = mod.atHigherLevels?.higherLevelDefinitions ?? [];
        const hlEntry = hl.find(h => h.level === slotIncrement);
        if (!hlEntry?.dice?.diceString) continue;
        const str = buildDamageString(hlEntry.dice.diceString, mod.subType);
        if (str) parts.push(`+${str}`);
    }
    return parts.join(' ');
}

function buildCantripLevelDamage(dmgMods: SpellModifier[], charLevel: number): string {
    const parts: string[] = [];
    for (const mod of dmgMods) {
        const hl = mod.atHigherLevels?.higherLevelDefinitions ?? [];
        const hlEntry = hl.find(h => h.level === charLevel);
        if (!hlEntry?.dice?.diceString) continue;
        const str = buildDamageString(hlEntry.dice.diceString, mod.subType);
        if (str) parts.push(str);
    }
    return parts.join(' + ');
}

async function processSpells(items: unknown[]) {
    const parsed = z.array(DdbSpellSchema).parse(items);
    // Deduplicate by definition.id — spells appear once per class spell list
    const seen = new Set<number>();
    const deduped = parsed.filter(w => {
        if (seen.has(w.definition.id)) return false;
        seen.add(w.definition.id);
        return true;
    });

    const rows = deduped.map(w => {
        const s = w.definition;
        const act = s.activation;

        // Casting time with proper pluralization
        const actTime = act?.activationTime ?? 0;
        const actType = act?.activationType as number;
        let castingTime = '';
        if (actTime && actType) {
            const unit = ACT_MAP[actType] ?? String(actType);
            const plural = actTime > 1 && (unit === 'Minute' || unit === 'Hour') ? unit + 's' : unit;
            castingTime = `${actTime} ${plural}`;
        }

        // Slug: remove apostrophes before replacing non-alphanumeric
        const slug = s.name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '');

        const dmgMods = ((s.modifiers ?? []) as SpellModifier[]).filter(m => m.type === 'damage' && m.die?.diceString);

        let cantripDmg = '', c5 = '', c11 = '', c17 = '';
        let spellDmg = '', upcastPerSlot = '', upcastEvery2 = '';

        if (s.level === 0) {
            // Cantrip: base damage + level scaling
            cantripDmg = dmgMods.map(m => buildDamageString(m.die?.diceString, m.subType)).filter(Boolean).join(' + ');
            c5  = buildCantripLevelDamage(dmgMods, 5);
            c11 = buildCantripLevelDamage(dmgMods, 11);
            c17 = buildCantripLevelDamage(dmgMods, 17);
        } else {
            // Spell: combine all damage types
            spellDmg = dmgMods.map(m => buildDamageString(m.die?.diceString, m.subType)).filter(Boolean).join(' + ');
            upcastPerSlot  = buildUpcastDamage(dmgMods, 1);
            upcastEvery2   = buildUpcastDamage(dmgMods, 2);
        }

        // Components: "V, S, M (description)"
        const compLetters = (s.components ?? []).map((c: number) => COMP_MAP[c] ?? '').filter(Boolean).join(', ');
        const compDesc = s.componentsDescription?.trim();
        const components = compDesc ? `${compLetters} (${compDesc})` : compLetters;

        return {
            'Spell ID': s.id, 'Name': s.name,
            'Link': `https://www.dndbeyond.com/spells/${s.id}-${slug}`,
            'Level': s.level === 0 ? 'Cantrip' : s.level,
            'School': s.school ?? '',
            'Concentration': s.concentration ? 'true' : 'false',
            'Ritual': s.ritual ? 'true' : 'false',
            'Is Homebrew': s.isHomebrew ? 'true' : 'false',
            'Is Legacy': s.isLegacy ? 'true' : 'false',
            'Cantrip Damage': cantripDmg, 'Cantrip Dmg Lvl 5': c5, 'Cantrip Dmg Lvl 11': c11, 'Cantrip Dmg Lvl 17': c17,
            'Spell Damage': spellDmg, 'Upcast Per Slot': upcastPerSlot, 'Upcast Every 2 Slots': upcastEvery2,
            'Spell Progression': '',
            'Progression Note': '',
            'Range Origin': s.range?.origin ?? '',
            'Range Value (ft)': s.range?.rangeValue ?? '',
            'AoE Type': s.range?.aoeType ?? '',
            'AoE Value (ft)': s.range?.aoeValue ?? '',
            'Duration Type': s.duration?.durationType ?? '',
            'Duration Interval': s.duration?.durationInterval ?? '',
            'Duration Unit': s.duration?.durationUnit ?? '',
            'Requires Saving Throw': s.requiresSavingThrow ? 'true' : 'false',
            'Saving Throw': s.saveDcAbilityId ? (STAT_MAP[s.saveDcAbilityId] ?? '') : '',
            'Requires Attack Roll': s.requiresAttackRoll ? 'true' : 'false',
            'Can Cast Higher Level': s.canCastAtHigherLevel ? 'true' : 'false',
            'Casting Time': castingTime,
            'Components': components,
            'Description': cleanText(s.description),
            'Source Book': srcName(s.sources?.[0]?.sourceId),
            'Tags': (s.tags ?? []).join(', '),
            'Spell List': SPELL_LISTS[s.id] ?? '',
        };
    });

    return { 'spells.xlsx': toExcel(rows, 'spells') };
}

// ── Request handler ───────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
    const form = await request.formData();
    const type = form.get('type') as string;
    const file = form.get('file') as File;
    const classMapRaw = form.get('classMap') as string | null;

    if (!file || !type) return new Response(JSON.stringify({ error: 'Missing file or type' }), { status: 400 });

    const raw = await file.text();
    const items = parsePayload(raw);

    const classMap = new Map<number, {name: string; uploadId: string}>();
    if (classMapRaw) {
        for (const [id, entry] of JSON.parse(classMapRaw) as [number, {name: string; uploadId: string}][]) {
            classMap.set(id, entry);
        }
    }

    let files: Record<string, Buffer>;
    let resultClassMap: [number, {name: string; uploadId: string}][] | null = null;

    try {
        switch (type) {
            case 'classes': {
                files = await processClasses(items);
                // Build classMap from deduplicated classes
                const clsData = z.array(DdbClassSchema).parse(items);
                const deduped = dedupBySource(clsData, c => ({ name: c.name, sourceId: c.sources?.[0]?.sourceId ?? 0 }));
                resultClassMap = deduped.map(c => {
                    const sid = c.sources?.[0]?.sourceId ?? 0;
                    return [c.id, { name: c.name, uploadId: `${sid}:${c.name}` }] as [number, {name: string; uploadId: string}];
                });
                break;
            }
            case 'subclasses':  files = await processSubclasses(items, classMap); break;
            case 'species':     files = await processSpecies(items); break;
            case 'backgrounds': files = await processBackgrounds(items); break;
            case 'feats':       files = await processFeats(items); break;
            case 'spells':      files = await processSpells(items); break;
            default: return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }

    const output: Record<string, string> = {};
    for (const [name, buf] of Object.entries(files)) output[name] = buf.toString('base64');

    return new Response(JSON.stringify({ files: output, classMap: resultClassMap }), {
        headers: { 'Content-Type': 'application/json' }
    });
};