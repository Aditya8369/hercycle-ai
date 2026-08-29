import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin.js'
import { auth } from '@clerk/nextjs/server'
import { validateEntry } from '@/lib/symptom-journal.js'
import { logger } from '@/lib/logger.js'

export async function GET(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 90)
    const offset = Number(url.searchParams.get('offset')) || 0

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('symptom_journal')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('[symptom-journal] GET error', error)
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (err) {
    logger.error('[symptom-journal] GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const errors = validateEntry(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const record = {
      user_id: userId,
      date: body.date,
      mood: body.mood || null,
      energy: body.energy || null,
      flow: body.flow || null,
      symptoms: body.symptoms || [],
      notes: body.notes || '',
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('symptom_journal')
      .upsert(record, { onConflict: 'user_id,date' })
      .select()
      .single()

    if (error) {
      logger.error('[symptom-journal] POST error', error)
      return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (err) {
    logger.error('[symptom-journal] POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const date = url.searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('symptom_journal')
      .delete()
      .eq('user_id', userId)
      .eq('date', date)

    if (error) {
      logger.error('[symptom-journal] DELETE error', error)
      return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('[symptom-journal] DELETE error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
