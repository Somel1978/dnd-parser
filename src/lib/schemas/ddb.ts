import { z } from 'zod';

// ── Reusable sub-schemas ──────────────────────────────────────────────────────

const SourceSchema = z.object({ sourceId: z.number() });

export const DdbTraitSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    description: z.string().nullable().default(''),
    requiredLevel: z.number().nullable().default(1),
    moreDetailsUrl: z.string().nullable().default(''),
    definition: z.object({
        name: z.string().optional(),
        description: z.string().nullable().default(''),
        requiredLevel: z.number().nullable().default(1),
        sources: z.array(SourceSchema).default([])
    }).optional()
});

// ── Classes ───────────────────────────────────────────────────────────────────

export const DdbClassSchema = z.object({
    id: z.number(),
    name: z.string(),
    hitDice: z.number().nullable().default(null),
    canCastSpells: z.boolean().default(false),
    primaryAbilities: z.array(z.number()).default([]),
    description: z.string().nullable().default(''),
    equipmentDescription: z.string().nullable().default(''),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(SourceSchema).default([]),
    classFeatures: z.array(DdbTraitSchema).default([]),
    spellRules: z.any().nullable().default(null)
});

// ── Subclasses ────────────────────────────────────────────────────────────────

export const DdbSubclassSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    parentClassId: z.number(),
    moreDetailsUrl: z.string().nullable().default(''),
    spellCastingAbilityId: z.number().nullable().default(null),
    sources: z.array(SourceSchema).default([]),
    classFeatures: z.array(DdbTraitSchema).default([])
});

// ── Species ───────────────────────────────────────────────────────────────────

export const DdbSpeciesSchema = z.object({
    fullName: z.string(),
    description: z.string().nullable().default(''),
    sizeId: z.number().default(4),
    isSubRace: z.boolean().default(false),
    isLegacy: z.boolean().default(false),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(SourceSchema).default([]),
    weightSpeeds: z.object({
        normal: z.object({
            walk: z.number().default(0), fly: z.number().default(0),
            swim: z.number().default(0), climb: z.number().default(0),
            burrow: z.number().default(0)
        }).default({ walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0 })
    }).default({ normal: { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0 } }),
    racialTraits: z.array(DdbTraitSchema).default([])
});

// ── Backgrounds ───────────────────────────────────────────────────────────────

export const DdbBackgroundSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    shortDescription: z.string().nullable().default(''),
    cardDescription: z.string().nullable().default(''),
    featureName: z.string().nullable().default(''),
    skillProficienciesDescription: z.string().nullable().default(''),
    toolProficienciesDescription: z.string().nullable().default(''),
    languagesDescription: z.string().nullable().default(''),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(SourceSchema).default([])
});

// ── Feats ─────────────────────────────────────────────────────────────────────

const PrerequisiteMappingSchema = z.object({
    type: z.string(),
    subType: z.string().nullable().optional(),
    value: z.number().nullable().optional(),
    friendlyTypeName: z.string().nullable().optional(),
    friendlySubTypeName: z.string().nullable().optional()
});

const PrerequisiteSchema = z.object({
    description: z.string().nullable().default(''),
    prerequisiteMappings: z.array(PrerequisiteMappingSchema).default([])
});

export const DdbFeatSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    snippet: z.string().nullable().default(''),
    isRepeatable: z.boolean().default(false),
    categories: z.array(z.object({ tagName: z.string() })).default([]),
    prerequisites: z.array(PrerequisiteSchema).default([]),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(SourceSchema).default([])
});

// ── Spells ────────────────────────────────────────────────────────────────────

export const DdbSpellSchema = z.object({
    definition: z.object({
        id: z.number(),
        name: z.string(),
        level: z.number(),
        school: z.string().nullable().default(''),
        concentration: z.boolean().default(false),
        ritual: z.boolean().default(false),
        isHomebrew: z.boolean().default(false),
        isLegacy: z.boolean().default(false),
        requiresSavingThrow: z.boolean().default(false),
        requiresAttackRoll: z.boolean().default(false),
        canCastAtHigherLevel: z.boolean().default(false),
        components: z.array(z.number()).default([]),
        tags: z.array(z.string()).default([]),
        duration: z.object({
            durationType: z.string().optional(),
            durationInterval: z.number().optional(),
            durationUnit: z.string().optional()
        }).optional(),
        activation: z.object({
            activationTime: z.number().optional(),
            activationType: z.number().optional()
        }).optional(),
        range: z.object({
            origin: z.string().optional(),
            rangeValue: z.number().optional(),
            aoeType: z.string().optional(),
            aoeValue: z.number().optional()
        }).optional(),
        modifiers: z.array(z.any()).default([]),
        atHigherLevels: z.any().optional(),
        saveDcAbilityId: z.number().nullable().default(null),
        description: z.string().nullable().default(''),
        sources: z.array(SourceSchema).default([])
    })
});