import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { z } from 'zod';
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

const SOURCE_MAP: Record<number, string> = {
    1:"Player's Handbook 2014",2:"Player's Handbook 2014",3:"Basic Rules",
    4:"Elemental Evil Player's Companion",13:"Sword Coast Adventurer's Guide",
    26:"Explorer's Guide to Wildemount",27:"Xanathar's Guide to Everything",
    37:"Eberron: Rising from the Last War",44:"Acquisitions Incorporated",
    67:"Tasha's Cauldron of Everything",80:"Strixhaven: A Curriculum of Chaos",
    81:"Fizban's Treasury of Dragons",95:"Dragonlance: Shadow of the Dragon Queen",
    109:"The Book of Many Things",110:"Bigby Presents: Glory of the Giants",
    123:"Tal'Dorei Campaign Setting Reborn",130:"Lairs of Etharis",
    131:"Dungeons of Drakkenheim",133:"Humblewood Campaign Setting",
    145:"Player's Handbook",146:"Dungeon Master's Guide 2024",
    191:"Exploring Eberron (2024)",196:"Monsters of Drakkenheim",
    225:"Exploring Eberron (2024)",232:"Grim Hollow: Campaign Setting",
};
const srcName = (id?: number | null) => id ? (SOURCE_MAP[id] ?? `Source ${id}`) : '';

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
const COMP_MAP:    Record<number, string> = {1:'V',2:'S',3:'M'};
const STAT_MAP:    Record<number, string> = {1:'Strength',2:'Dexterity',3:'Constitution',4:'Intelligence',5:'Wisdom',6:'Charisma'};
const ACT_MAP:     Record<number, string> = {1:'Action',2:'Bonus Action',3:'Reaction',4:'Minute',6:'Hour'};
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

async function processBackgrounds(items: unknown[]) {
    const parsed = z.array(DdbBackgroundSchema).parse(items);
    const deduped = dedupBySource(parsed, b => ({ name: b.name, sourceId: b.sources?.[0]?.sourceId ?? 0 }));

    const descs = deduped.map((b, i) => ({ id: i, text: cleanText(b.description) }));
    const grants = await runExtractor(descs);

    const rows = deduped.map((b, i) => {
        const sourceId = b.sources?.[0]?.sourceId ?? 0;
        const g = mergeGrants(grants.get(i) ?? {});
        return {
            uploadId: `${sourceId}:${b.name}`,
            name: b.name,
            shortDescription: cleanText(b.cardDescription ?? b.shortDescription ?? '').slice(0, 300),
            featureName: b.featureName ?? '',
            grantsFeatCategory: '',
            grantsFeatId: '',
            url: b.moreDetailsUrl ? `https://www.dndbeyond.com${b.moreDetailsUrl}` : '',
            source: srcName(sourceId),
            sortOrder: i + 1,
            ...g,
        };
    });

    return { 'backgrounds.xlsx': toExcel(rows, 'backgrounds') };
}

// ── Feat processor ────────────────────────────────────────────────────────────

async function processFeats(items: unknown[]) {
    const parsed = z.array(DdbFeatSchema).parse(items);
    const deduped = dedupBySource(parsed, f => ({ name: f.name, sourceId: f.sources?.[0]?.sourceId ?? 0 }));

    const descs = deduped.map((f, i) => ({ id: i, text: cleanText(f.description) }));
    const grants = await runExtractor(descs);

    const rows = deduped.map((feat, i) => {
        const sourceId = feat.sources?.[0]?.sourceId ?? 0;
        const g = mergeGrants(grants.get(i) ?? {});
        const cats = feat.categories.map((c: {tagName: string}) => c.tagName).join(',');
        return {
            uploadId: `${sourceId}:${feat.name}`,
            name: feat.name,
            description: cleanText(feat.description),
            snippet: cleanText(feat.snippet),
            repeatable: feat.isRepeatable ? 'true' : 'false',
            categories: cats,
            prerequisites: (feat.prerequisites ?? []).map((p: {description: string | null}) => p.description ?? '').filter(Boolean).join('; '),
            detailsUrl: feat.moreDetailsUrl ? `https://www.dndbeyond.com${feat.moreDetailsUrl}` : '',
            isEpicBoon: (cats.toLowerCase().includes('epic boon') || feat.name.toLowerCase().startsWith('epic boon')) ? 'true' : 'false',
            asiAmount: '',
            asiStatFixed: '',
            asiStatChoices: '',
            source: srcName(sourceId),
            sortOrder: i + 1,
            ...g,
        };
    });

    return { 'feats.xlsx': toExcel(rows, 'feats') };
}

// ── Spell processor ───────────────────────────────────────────────────────────

type SpellModifier = { type?: string; subType?: string; die?: { diceString?: string }; atHigherLevels?: { higherLevelDefinitions?: { level: number; dice?: { diceString?: string } }[] } };

function buildDamageString(diceStr: string | undefined, subType: string | undefined): string {
    if (!diceStr) return '';
    const skip = ['additional', 'all', 'melee-weapon-attacks'];
    const type = subType && !skip.includes(subType) ? subType.charAt(0).toUpperCase() + subType.slice(1) : '';
    return type ? `${diceStr} ${type}` : diceStr;
}

async function processSpells(items: unknown[]) {
    const parsed = z.array(DdbSpellSchema).parse(items);

    const rows = parsed.map(w => {
        const s = w.definition;
        const act = s.activation;
        const castingTime = (act?.activationTime && act?.activationType)
            ? `${act.activationTime} ${ACT_MAP[act.activationType as number] ?? act.activationType}`
            : '';
        const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

        const dmgMods = ((s.modifiers ?? []) as SpellModifier[]).filter(m => m.type === 'damage' && m.die?.diceString);
        const firstDmg = dmgMods[0];
        const baseDie = firstDmg?.die?.diceString;
        const subType = firstDmg?.subType;
        const modHL = firstDmg?.atHigherLevels?.higherLevelDefinitions ?? [];

        let cantripDmg = '', c5 = '', c11 = '', c17 = '';
        let spellDmg = '', upcastPerSlot = '', upcastEvery2 = '';

        if (s.level === 0) {
            cantripDmg = buildDamageString(baseDie, subType);
            c5  = buildDamageString(modHL.find(h => h.level === 5)?.dice?.diceString, subType);
            c11 = buildDamageString(modHL.find(h => h.level === 11)?.dice?.diceString, subType);
            c17 = buildDamageString(modHL.find(h => h.level === 17)?.dice?.diceString, subType);
        } else {
            spellDmg = buildDamageString(baseDie, subType);
            const up1 = modHL.find(h => h.level === 1);
            if (up1?.dice?.diceString) upcastPerSlot = buildDamageString(up1.dice.diceString, subType);
            const up2 = modHL.find(h => h.level === 2);
            if (up2?.dice?.diceString) upcastEvery2 = buildDamageString(up2.dice.diceString, subType);
        }

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
            'Spell Progression': '', 'Progression Note': '',
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
            'Components': (s.components ?? []).map((c: number) => COMP_MAP[c] ?? '').filter(Boolean).join(','),
            'Description': cleanText(s.description),
            'Source Book': srcName(s.sources?.[0]?.sourceId),
            'Tags': (s.tags ?? []).join(','),
            'Spell List': '',
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