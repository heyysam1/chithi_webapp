import { z } from "zod";
import {
  USERNAME_MIN,
  USERNAME_MAX,
  USERNAME_REGEX,
  RESERVED_USERNAMES,
  LETTER_BODY_MIN,
  LETTER_BODY_MAX,
  HINT_MAX_COUNT,
  HINT_MAX_LEN,
  RIDDLE_Q_MAX,
  RIDDLE_ANSWER_MIN,
  RIDDLE_ANSWER_MAX,
  PASSCODE_LENGTH,
} from "./constants";

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN, "errors.validation.usernameTooShort")
  .max(USERNAME_MAX, "errors.validation.usernameTooLong")
  .regex(USERNAME_REGEX, "errors.validation.usernameInvalid")
  .refine(
    (name) => !RESERVED_USERNAMES.includes(name.toLowerCase() as (typeof RESERVED_USERNAMES)[number]),
    { message: "errors.validation.usernameReserved" }
  );

export const CreateMailboxSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "errors.validation.nameRequired")
      .max(50, "errors.validation.nameTooLong"),
    username: usernameSchema,
    durationKey: z.enum(["12h", "24h", "3d", "7d"], {
      errorMap: () => ({ message: "errors.validation.durationInvalid" }),
    }),
    gender: z.enum(["male", "female", "other", "unspecified"]).default("unspecified"),
  })
  .strict();

export type CreateMailboxInput = z.infer<typeof CreateMailboxSchema>;

export const RecoverMailboxSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "errors.validation.nameRequired")
      .max(50, "errors.validation.nameTooLong"),
    username: usernameSchema,
    passcode: z
      .string()
      .length(PASSCODE_LENGTH, "errors.validation.passcodeLength")
      .regex(/^\d{6}$/, "errors.validation.passcodeDigits"),
  })
  .strict();

export type RecoverMailboxInput = z.infer<typeof RecoverMailboxSchema>;

export const UpdateSettingsSchema = z
  .object({
    acceptsBottles: z.boolean(),
  })
  .strict();

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const ExtendMailboxSchema = z
  .object({
    durationKey: z.enum(["24h", "3d", "5d", "7d"], {
      errorMap: () => ({ message: "errors.validation.durationInvalid" }),
    }),
  })
  .strict();

export type ExtendMailboxInput = z.infer<typeof ExtendMailboxSchema>;

const PaperStyleEnum = z.enum([
  "parchment",
  "midnight",
  "rose",
  "typewriter",
  "rainy",
]);

const StampEnum = z.enum(["wax", "topSecret", "memory", "heartbreak"]);

export const SendLetterSchema = z
  .object({
    recipient: usernameSchema,
    body: z
      .string()
      .min(LETTER_BODY_MIN, "errors.validation.bodyTooShort")
      .max(LETTER_BODY_MAX, "errors.validation.bodyTooLong"),
    paper: PaperStyleEnum,
    stamp: StampEnum,
    hints: z
      .array(z.string().min(1).max(HINT_MAX_LEN))
      .max(HINT_MAX_COUNT)
      .optional()
      .default([]),
    burnAfterReading: z.boolean().default(false),
    senderName: z.string().trim().max(50).optional().nullable(),
    isAnonymous: z.boolean().default(true),
    // Epoch ms when the letter becomes deliverable. Semantic checks
    // (> now + 60s, <= mailbox expiry) happen in sendLetter().
    scheduledFor: z.number().int().positive().optional().nullable(),
    // Letter ID (same recipient mailbox) this letter replies to.
    replyTo: z.string().min(1).max(64).optional().nullable(),
    mode: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }),
      z.object({
        kind: z.literal("capsule"),
        unlockAt: z.number().int().positive(),
      }),
      z.object({
        kind: z.literal("riddle"),
        question: z.string().min(1).max(RIDDLE_Q_MAX),
        answer: z.string().min(RIDDLE_ANSWER_MIN).max(RIDDLE_ANSWER_MAX),
      }),
    ]),
  })
  .strict();

export type SendLetterInput = z.infer<typeof SendLetterSchema>;

export const UnlockLetterSchema = z
  .object({
    answer: z
      .string()
      .min(1, "errors.validation.answerEmpty")
      .max(RIDDLE_ANSWER_MAX, "errors.validation.answerTooLong"),
  })
  .strict();

export const ReactLetterSchema = z
  .object({
    reaction: z.enum(["heart", "heartCrack"]),
  })
  .strict();

export const SendBottleSchema = z
  .object({
    body: z
      .string()
      .min(LETTER_BODY_MIN, "errors.validation.bodyTooShort")
      .max(LETTER_BODY_MAX, "errors.validation.bodyTooLong"),
    paper: PaperStyleEnum,
    stamp: StampEnum,
    hints: z
      .array(z.string().min(1).max(HINT_MAX_LEN))
      .max(HINT_MAX_COUNT)
      .optional()
      .default([]),
    target: z.enum(["anyone", "male", "female"]).default("anyone"),
    senderName: z.string().trim().max(50).optional().nullable(),
    senderUsername: usernameSchema.optional(),
    isAnonymous: z.boolean().default(true),
  })
  .strict();

export type SendBottleInput = z.infer<typeof SendBottleSchema>;

export const ReactFeedSchema = z
  .object({
    reaction: z.enum(["heart", "heartCrack"]),
  })
  .strict();

export const ReportSchema = z
  .object({
    targetType: z.enum(["letter", "feed"]),
    targetId: z.string().min(1).max(64),
    reason: z.enum(["harassment", "spam", "doxxing", "phishing", "other"]),
    note: z.string().max(300).optional(),
  })
  .strict();
