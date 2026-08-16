import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'

export async function GET(request) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching user profile:', error)
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, profile: data || {} }, { status: 200 })
  } catch (err) {
    logger.error('Profile GET error:', err)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in profile POST: ${parseError.message}`)
      return NextResponse.json({ success: false, error: 'Bad Request: Invalid JSON payload' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    const { age, weight_kg, height_cm, known_conditions, cycle_goal, allow_ai_analysis, cycleLength } = body

    let parsedAge = null
    if (age !== undefined && age !== null && age !== '') {
      parsedAge = Number(age)
      if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        return NextResponse.json({ success: false, error: 'Age must be a valid number between 1 and 120' }, { status: 400 })
      }
    }

    let parsedWeight = null
    if (weight_kg !== undefined && weight_kg !== null && weight_kg !== '') {
      parsedWeight = Number(weight_kg)
      if (!Number.isFinite(parsedWeight) || parsedWeight < 1 || parsedWeight > 500) {
        return NextResponse.json({ success: false, error: 'Weight must be a valid number between 1 and 500 kg' }, { status: 400 })
      }
    }

    let parsedHeight = null
    if (height_cm !== undefined && height_cm !== null && height_cm !== '') {
      parsedHeight = Number(height_cm)
      if (!Number.isFinite(parsedHeight) || parsedHeight < 1 || parsedHeight > 300) {
        return NextResponse.json({ success: false, error: 'Height must be a valid number between 1 and 300 cm' }, { status: 400 })
      }
    }

    if (cycleLength !== undefined && cycleLength !== null && cycleLength !== '') {
      const parsedCycleLength = Number(cycleLength)
      if (!Number.isFinite(parsedCycleLength) || parsedCycleLength < 15 || parsedCycleLength > 60) {
        return NextResponse.json({ success: false, error: 'Cycle length must be between 15 and 60 days' }, { status: 400 })
      }
    }

    const profileRecord = {
      user_id: userId,
      age: parsedAge,
      weight_kg: parsedWeight,
      height_cm: parsedHeight,
      known_conditions: Array.isArray(known_conditions) ? known_conditions : [],
      cycle_goal: cycle_goal || null,
      allow_ai_analysis: typeof allow_ai_analysis === 'boolean' ? allow_ai_analysis : true,
      updated_at: new Date().toISOString()
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profileRecord, { onConflict: 'user_id' })
      .select()

    if (error) {
      logger.error('Error saving user profile:', error)
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    }

    const savedProfile = Array.isArray(data) ? (data[0] || profileRecord) : (data || profileRecord)

    return NextResponse.json({ success: true, profile: savedProfile }, { status: 200 })
  } catch (err) {
    logger.error('Profile POST error:', err)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

