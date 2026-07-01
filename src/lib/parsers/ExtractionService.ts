export class ExtractionService {
    static stripHtml(html: string | null | undefined): string {
        if (!html) return '';
        return html.replace(/<[^>]+>/g, '').trim();
    }

    static extractSpeed(text: string): Record<string, number> {
        const speeds: Record<string, number> = {};
        const walkMatch = text.match(/walk(?:ing)?\s+speed\s+increase[sd]?\s+by\s+(\d+)/i);
        if (walkMatch) speeds['WALK'] = parseInt(walkMatch[1], 10);
        
        const flyMatch = text.match(/(?:gain[s]?\s+a\s+)?fly(?:ing)?\s+speed\s+of\s+(\d+)/i);
        if (flyMatch) speeds['FLY'] = parseInt(flyMatch[1], 10);
        
        return speeds;
    }

    static mapSizeId(id: number): string {
        const sizes: Record<number, string> = { 2: 'Tiny', 3: 'Small', 4: 'Medium', 5: 'Large' };
        return sizes[id] || '';
    }
}
