import { SvelteMap } from 'svelte/reactivity';

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
    164: "Valda's Spire of Secrets: Player Pack", 193: "The Crooked Moon Part One: Player Options & Campaign Setting",
    196: "Monsters of Drakkenheim", 197: "The Gunslinger Class: Valda's Spire of Secrets",
    200: "Cthulhu by Torchlight", 202: "Abomination Vaults",
    205: "Forgotten Realms: Heroes of Faerûn", 207: "Grim Hollow: Player's Guide",
    217: "Grim Hollow: Campaign Setting", 220: "Valda's Spire of Secrets",
    224: "Heliana's Guide to Monster Hunting: Part 2", 225: "Exploring Eberron (2024)",
    238: "Northlands Worldbook", 249: "Dungeon Delver's Guide", 272: "D&D Beyond Drops"
};

export class ParserContext {
    classMap = new SvelteMap<number, string>();
    
    registerClass(id: number, name: string) {
        this.classMap.set(id, name);
    }

    getClassName(id: number): string {
        const name = this.classMap.get(id);
        if (!name) throw new Error(`Missing parent class reference for ID: ${id}. Process Classes first.`);
        return name;
    }

    getSourceName(id: number | null | undefined): string {
        if (!id) return '';
        return SOURCE_MAP[id] || `Source ${id}`;
    }
}

export const parserContext = new ParserContext();