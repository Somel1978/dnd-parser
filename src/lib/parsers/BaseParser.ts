// All parsers will extend this to guarantee template coverage
export abstract class BaseParser {
    // A mapping helper that guarantees every template key is filled
    protected mapRow<T>(row: T, templateKeys: string[]): Record<string, unknown> {
        const output: Record<string, unknown> = {};
        for (const key of templateKeys) {
            // Fill with row value if it exists, otherwise empty string
            output[key] = (row as any)[key] ?? '';
        }
        return output;
    }
}
