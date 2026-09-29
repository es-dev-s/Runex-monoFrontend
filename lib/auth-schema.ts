import { z } from "zod";

/**
 * These rules intentionally duplicate the backend's validation in
 * `backend/internal/api/auth.go`. Client-side checks are only a courtesy — the
 * server remains authoritative — but they must agree, or the form would accept
 * input the API then rejects with a less specific message.
 */

/** Backend: ^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$ */
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    USERNAME_PATTERN,
    "3–32 characters, starting with a letter or number. Letters, numbers, dot, underscore, or hyphen.",
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .email("Enter a valid email address.")
  // The backend additionally requires a dot in the domain.
  .refine((value) => value.includes("."), "Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .refine((value) => /\p{L}/u.test(value), "Include at least one letter.")
  .refine((value) => /\p{N}/u.test(value), "Include at least one number.");

export const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Sign-in accepts a username or an email, so the identifier is not narrowed. */
export const signInSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
