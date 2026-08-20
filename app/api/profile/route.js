import { z } from 'zod'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'

const profileSchema = z.object({
  age: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => (val === '' || val === null || val === undefined ? null : Number(val)))
    .refine((val) => val === null || (Number.isFinite(val) && val >= 1 && val <= 120), {
      message: 'Age must be a valid number between 1 and 120',
    }),
  weight_kg: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => (val === '' || val === null || val === undefined ? null : Number(val)))
    .refine((val) => val === null || (Number.isFinite(val) && val >= 1 && val <= 500), {
      message: 'Weight must be a valid number between 1 and 500 kg',
    }),
  height_cm: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => (val === '' || val === null || val === undefined ? null : Number(val)))
    .refine((val) => val === null || (Number.isFinite(val) && val >= 1 && val <= 300), {
      message: 'Height must be a valid number between 1 and 300 cm',
    }),
  cycleLength: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((val) => (val === '' || val === null || val === undefined ? null : Number(val)))
    .refine((val) => val === null || (Number.isFinite(val) && val >= 15 && val <= 60), {
      message: 'Cycle length must be between 15 and 60 days',
    }),
  known_conditions: z.array(z.string()).optional().default([]),
  cycle_goal: z.string().nullable().optional(),
  allow_ai_analysis: z.boolean().optional().default(true),
})

export async function GET(request) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching user profile:', error)
      return jsonError('Database error', 500)
    }

    return jsonSuccess({ profile: data || {}, ...(data || {}) })
  } catch (err) {
    logger.error('Profile GET error:', err)
    return jsonError('Internal Server Error', 500)
  }
}

export async function POST(request) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in profile POST: ${parseError.message}`)
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('Invalid payload', 400)
    }

    const parseResult = profileSchema.safeParse(body)
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0]
      return jsonError(firstIssue?.message || 'Invalid payload', 400)
    }

    const validatedData = parseResult.data

    const profileRecord = {
      user_id: userId,
      age: validatedData.age,
      weight_kg: validatedData.weight_kg,
      height_cm: validatedData.height_cm,
      known_conditions: validatedData.known_conditions || [],
      cycle_goal: validatedData.cycle_goal || null,
      allow_ai_analysis: validatedData.allow_ai_analysis,
      updated_at: new Date().toISOString()
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profileRecord, { onConflict: 'user_id' })
      .select()

    if (error) {
      logger.error('Error saving user profile:', error)
      return jsonError('Database error', 500)
    }

    const savedProfile = Array.isArray(data) ? (data[0] || profileRecord) : (data || profileRecord)

    return jsonSuccess({ profile: savedProfile, ...savedProfile })
  } catch (err) {
    logger.error('Profile POST error:', err)
    return jsonError('Internal Server Error', 500)
  }
}

