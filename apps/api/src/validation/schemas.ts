import { isISODate, isValidHHMM } from '@pulsar/shared';
import type { Weekday } from '@pulsar/shared';
import { z } from 'zod';

/** Zod failure → SPEC §4 `details: string[]`. */
export function zodDetails(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
}

const dateSchema = z.string().refine(isISODate, 'must be YYYY-MM-DD');
const hhmmSchema = z.string().refine(isValidHHMM, 'must be HH:MM');

/**
 * Structural schedule schema. Domain semantics (todo→once, ranges, pattern
 * length, at-least-one-active-day…) are enforced by `validateSchedule` from
 * @pulsar/shared so its error strings reach the client verbatim.
 */
export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('once'), date: dateSchema }),
  // Range checks (0..6) are deliberately left to validateSchedule so its
  // error strings reach the client; the cast only fixes the literal types.
  z.object({
    type: z.literal('weekdays'),
    weekdays: z.array(z.number()).transform((days) => days as Weekday[]),
  }),
  z.object({ type: z.literal('monthdays'), monthdays: z.array(z.number()) }),
  z.object({ type: z.literal('interval'), every: z.number(), anchor: dateSchema }),
  z.object({ type: z.literal('cycle'), length: z.number(), pattern: z.array(z.boolean()), anchor: dateSchema }),
]);

const titleSchema = z.string().trim().min(1, 'title must be a non-empty string');

export const createItemSchema = z.object({
  kind: z.enum(['habit', 'todo']),
  title: titleSchema,
  description: z.string().nullable().optional(),
  schedule: scheduleSchema,
  reminderTime: hhmmSchema.nullable().optional(),
  archived: z.boolean().optional(),
});

export const patchItemSchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().nullable().optional(),
    schedule: scheduleSchema.optional(),
    reminderTime: hhmmSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required');

export const completionSchema = z.object({
  status: z.enum(['done', 'skipped']),
});

export const settingsPatchSchema = z
  .object({
    ntfyTopic: z.string().trim().min(1, 'ntfyTopic must be a non-empty string').optional(),
    ntfyServer: z.string().trim().min(1, 'ntfyServer must be a non-empty string').optional(),
    notificationsEnabled: z.boolean().optional(),
    digestTime: hhmmSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required');

export type CreateItemBody = z.infer<typeof createItemSchema>;
export type PatchItemBody = z.infer<typeof patchItemSchema>;
export type SettingsPatchBody = z.infer<typeof settingsPatchSchema>;
