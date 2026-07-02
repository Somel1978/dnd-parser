import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const SOURCE_MAP: Record<number, string> = {
    1: "Player's Handbook 2014", 2: "Player's Handbook 2014", 3: "Basic Rules",
    4: "Elemental Evil Player's Companion", 13: "Sword Coast Adventurer's Guide",
    26: "Explorer's Guide to Wildemount", 27: "Xanathar's Guide to Everything",
    31: "Blood Hunter (Mercer)", 37: "Eberron: Rising from the Last War",
    38: "Guildmasters' Guide to Ravnica", 40: "Lost Laboratory of Kwalish",
    44: "Acquisitions Incorporated", 49: "Wayfinder's Guide to Eberron",
    66: "Icewind Dale: Rime of the Frostmaiden", 67: "Tasha's Cauldron of Everything",
    80: "Strixhaven: A Curriculum of Chaos", 81: "Fizban's Treasury of Dragons",
    83: "Mordenkainen Presents: Monsters of the Multiverse",
    90: "Spelljammer: Adventures in Space - Astral Adventurer's Guide",
    95: "Dragonlance: Shadow of the Dragon Queen", 109: "The Book of Many Things",
    110: "Bigby Presents: Glory of the Giants", 114: "Planescape: Adventures in the Multiverse",
    123: "Tal'Dorei Campaign Setting Reborn", 130: "Lairs of Etharis",
    131: "Dungeons of Drakkenheim", 133: "Humblewood Campaign Setting",
    145: "Player's Handbook", 146: "Dungeon Master's Guide 2024",
    150: "Grim Hollow: Player Pack", 151: "Book of Ebon Tides",
    152: "Tales from the Shadows", 154: "Dr Dhrolin's Dictionary of Dinosaurs",
    160: "Obojima: Tales from the Tall Grass", 162: "Heliana's Guide to Monster Hunting: Part 1",
    164: "Valda's Spire of Secrets: Player Pack",
    193: "The Crooked Moon Part One: Player Options & Campaign Setting",
    196: "Monsters of Drakkenheim", 197: "The Gunslinger Class: Valda's Spire of Secrets",
    200: "Cthulhu by Torchlight", 202: "Abomination Vaults",
    205: "Forgotten Realms: Heroes of Faerûn", 207: "Grim Hollow: Player's Guide",
    217: "Grim Hollow: Campaign Setting", 220: "Valda's Spire of Secrets",
    224: "Heliana's Guide to Monster Hunting: Part 2", 225: "Exploring Eberron (2024)",
    238: "Northlands Worldbook", 249: "Dungeon Delver's Guide", 272: "D&D Beyond Drops"
};

const SESSION_KEY = 'dnd5e_parser_classMap';

interface ClassEntry {
    name: string;
    uploadId: string;
}

/** Persists the class map to sessionStorage so it survives page reloads between payload uploads. */
function saveClassMap(map: Map<number, ClassEntry>): void {
    try {
        const obj: Record<string, ClassEntry> = {};
        for (const [id, entry] of map) obj[String(id)] = entry;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
    } catch { /* sessionStorage unavailable — silently continue */ }
}

function loadClassMap(): Map<number, ClassEntry> {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return new Map();
        const obj = JSON.parse(raw) as Record<string, ClassEntry>;
        return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
    } catch { return new Map(); }
}

export class ParserContext {
    /** Maps DDB class ID → { name, uploadId }. Seeded from sessionStorage on init
     *  so subclass payloads can resolve parent class uploadIds across page reloads. */
    classMap = new SvelteMap<number, ClassEntry>(loadClassMap());

    /** Tracks class feature IDs, used by SubclassParser to filter base class features. */
    classFeatureIds = new SvelteSet<number>();

    registerClass(id: number, name: string, uploadId: string) {
        this.classMap.set(id, { name, uploadId });
        saveClassMap(this.classMap);
    }

    registerClassFeatureId(id: number) {
        this.classFeatureIds.add(id);
    }

    getClassName(id: number): string {
        const entry = this.classMap.get(id);
        if (!entry) throw new Error(`Missing parent class for ID ${id}. Process the Classes payload first.`);
        return entry.name;
    }

    getClassUploadId(id: number): string {
        const entry = this.classMap.get(id);
        if (!entry) throw new Error(`Missing parent class for ID ${id}. Process the Classes payload first.`);
        return entry.uploadId;
    }

    hasClassFeatureIds(): boolean {
        return this.classFeatureIds.size > 0;
    }

    isBaseClassFeature(id: number | undefined): boolean {
        if (id === undefined) return false;
        return this.classFeatureIds.has(id);
    }

    getSourceName(id: number | null | undefined): string {
        if (!id) return '';
        return SOURCE_MAP[id] ?? `Source ${id}`;
    }

    /** Call this to wipe the persisted class map (e.g. when starting a fresh import session). */
    clearClassMap() {
        this.classMap.clear();
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    }
}

export const parserContext = new ParserContext();