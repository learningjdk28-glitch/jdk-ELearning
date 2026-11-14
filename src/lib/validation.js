import { z } from 'zod';

// Single source for field rules shared by forms and services.
// The database enforces the same rules (supabase/migrations/20261115_phase0_ownership_profiles.sql);
// tests/phase0.test.mjs runs the same sample values through both so they cannot drift apart.

export const PATTERNS = {
  phone: /^\+?[0-9][0-9 ()-]{6,19}$/,
  schoolId: /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/,
  studentNumber: /^S-[0-9]{4}-[0-9]{4,}$/,
};

export const LIMITS = { displayName: 60, addressMin: 5, addressMax: 300, email: 254 };

/** Optional text field: empty input becomes null so the column is cleared, not set to "". */
const optional = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable());

export const emailSchema = z.string().trim().max(LIMITS.email, 'Email is too long.').email('Enter a valid email address.');
export const passwordSchema = z.string().min(8, 'Use at least 8 characters.');
export const displayNameSchema = z.string().trim().min(1, 'Enter a name.').max(LIMITS.displayName, `Use ${LIMITS.displayName} characters or fewer.`);

export const phoneSchema = optional(
  z.string().trim().regex(PATTERNS.phone, 'Enter a phone number with 7 to 20 digits, for example +63 912 345 6789.'),
);
export const addressSchema = optional(
  z.string().trim()
    .min(LIMITS.addressMin, `Address must be at least ${LIMITS.addressMin} characters.`)
    .max(LIMITS.addressMax, `Use ${LIMITS.addressMax} characters or fewer.`),
);
export const schoolIdSchema = optional(
  z.string().trim().regex(PATTERNS.schoolId, 'School ID may use letters, numbers and dashes (up to 40), starting with a letter or number.'),
);

/** Fields a user may edit on their own profile. The student number is assigned by the database. */
export const profileFieldsSchema = z.object({
  display_name: displayNameSchema,
  phone: phoneSchema,
  address: addressSchema,
  school_id: schoolIdSchema,
});
