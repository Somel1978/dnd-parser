export class ExtractionService {
    static normalizeDescription(html: string | null | undefined): string {
        if (!html) return '';
        // Keep structure, but replace tags with line breaks
        return html
            .replace(/<(p|br|div|li|tr)[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Strict Parser:
     * Only returns a match if the label is found followed by a colon or space.
     * This prevents false positives.
     */
    static extractFromNormalized(text: string, label: string): string {
        const regex = new RegExp(`(?:^|\\n|\\s)${label}[:\\s]+([^\\n]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    static mapAbilityIds(ids: number[] | null | undefined): string {
        if (!ids || ids.length === 0) return '';
        const map: Record<number, string> = { 1: 'Strength', 2: 'Dexterity', 3: 'Constitution', 4: 'Intelligence', 5: 'Wisdom', 6: 'Charisma' };
        return ids.map(id => map[id]).filter(Boolean).join(',');
    }

    static getEmptyGrants() {
        return {
            grantsSkills: '', grantsExpertise: '', grantsHalfSkills: '', grantsSavingThrows: '',
            skillChoiceCount: '', skillChoicePool: '', savingThrowChoiceCount: '', savingThrowChoicePool: '',
            grantsTools: '', toolChoiceCount: '', toolChoicePool: '',
            grantsLanguages: '', languageChoiceCount: '', languageChoicePool: '',
            grantsResistances: '', grantsImmunities: '', grantsVulnerabilities: '',
            grantsInnateSpells: '', grantsSpeed: '', grantsSenses: ''
        };
    }
}