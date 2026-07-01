export class ParserContext {
    classMap = $state(new Map<number, string>());
    
    registerClass(id: number, name: string) {
        this.classMap.set(id, name);
    }

    getClassName(id: number): string {
        const name = this.classMap.get(id);
        if (!name) {
            throw new Error(`Missing parent class reference for ID: ${id}. Please process Classes first.`);
        }
        return name;
    }
}

export const parserContext = new ParserContext();
