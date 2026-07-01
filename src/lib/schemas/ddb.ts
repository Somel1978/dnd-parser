import { z } from 'zod';

export const DdbTraitSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    description: z.string().nullable().default(''),
    requiredLevel: z.number().nullable().default(1),
    moreDetailsUrl: z.string().nullable().default(''),
    definition: z.object({
        name: z.string().optional(),
        description: z.string().nullable().default(''),
        requiredLevel: z.number().nullable().default(1)
    }).optional()
});

export const DdbClassSchema = z.object({
    id: z.number(),
    name: z.string(),
    hitDice: z.number().nullable().default(null),
    canCastSpells: z.boolean().default(false),
    primaryAbilities: z.array(z.number()).default([]),
    description: z.string().nullable().default(''),
    equipmentDescription: z.string().nullable().default(''),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(z.object({ sourceId: z.number() })).default([]),
    classFeatures: z.array(DdbTraitSchema).default([]),
    spellRules: z.any().nullable().default(null)
});

export const DdbSubclassSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    parentClassId: z.number(),
    moreDetailsUrl: z.string().nullable().default(''),
    spellCastingAbilityId: z.number().nullable().default(null),
    sources: z.array(z.object({ sourceId: z.number() })).default([]),
    classFeatures: z.array(DdbTraitSchema).default([])
});

export const DdbSpeciesSchema = z.object({
    fullName: z.string(),
    description: z.string().nullable().default(''),
    sizeId: z.number().default(4),
    isSubRace: z.boolean().default(false),
    isLegacy: z.boolean().default(false),
    moreDetailsUrl: z.string().nullable().default(''),
    sources: z.array(z.object({ sourceId: z.number() })).default([]),
    weightSpeeds: z.object({
        normal: z.object({
            walk: z.number().default(0),
            fly: z.number().default(0),
            swim: z.number().default(0),
            climb: z.number().default(0),
            burrow: z.number().default(0)
        }).default({ walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0 })
    }).default({ normal: { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0 } }),
    racialTraits: z.array(DdbTraitSchema).default([])
});

export const DdbBackgroundSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    shortDescription: z.string().nullable().default(''),
    skillProficienciesDescription: z.string().nullable().default(''),
    toolProficienciesDescription: z.string().nullable().default(''),
    languagesDescription: z.string().nullable().default(''),
    grantedFeats: z.array(z.object({ featIds: z.array(z.number()) })).default([]),
    moreDetailsUrl: z.string().nullable().default('')
});

export const DdbFeatSchema = z.object({
    name: z.string(),
    description: z.string().nullable().default(''),
    snippet: z.string().nullable().default(''),
    isRepeatable: z.boolean().default(false),
    categories: z.array(z.object({ tagName: z.string() })).default([]),
    prerequisites: z.array(z.any()).default([]),
    moreDetailsUrl: z.string().nullable().default('')
});

export const DdbSpellSchema = z.object({
    definition: z.object({
        id: z.number(),
        name: z.string(),
        level: z.number(),
        school: z.string().nullable().default(''),
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
        saveDcAbilityId: z.number().nullable().default(null),
        description: z.string().nullable().default(''),
        isLegacy: z.boolean().default(false),
        isHomebrew: z.boolean().default(false),
        concentration: z.boolean().default(false),
        ritual: z.boolean().default(false),
        sources: z.array(z.object({ sourceId: z.number() })).default([])
    })
});