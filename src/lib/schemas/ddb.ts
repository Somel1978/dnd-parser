import { z } from 'zod';

export const DdbTraitSchema = z.object({
    definition: z.object({
        name: z.string(),
        description: z.string(),
        requiredLevel: z.number().nullable().default(1)
    })
});

export const DdbSpeciesSchema = z.object({
    fullName: z.string(),
    description: z.string(),
    sizeId: z.number(),
    weightSpeeds: z.object({
        normal: z.object({
            walk: z.number().default(0),
            fly: z.number().default(0),
            swim: z.number().default(0)
        })
    }),
    racialTraits: z.array(DdbTraitSchema).default([])
});

export const DdbSubclassSchema = z.object({
    name: z.string(),
    description: z.string(),
    parentClassId: z.number(),
    moreDetailsUrl: z.string().nullable(),
    classFeatures: z.array(DdbTraitSchema).default([])
});
