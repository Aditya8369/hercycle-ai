import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: true });

    if (error) {
      logger.error(`[Events GET] Error fetching events for ${userId}: ${error.message}`);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    return NextResponse.json({ success: true, events: events || [] });
  } catch (error) {
    logger.error(`[Events GET] Exception: ${error.message || error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const ALLOWED_CATEGORIES = ['reminder', 'habit', 'donation', 'health'];
const ALLOWED_RECURRENCE = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const time = new Date(dateStr).getTime();
  return !Number.isNaN(time);
}

export async function POST(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 });
  }

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseErr) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const {
      title,
      description = '',
      start_time,
      end_time = null,
      recurrence_rule = 'none',
      category = 'reminder',
      time_zone = 'UTC',
    } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Event title is required' }, { status: 400 });
    }

    if (!start_time || !isValidDate(start_time)) {
      return NextResponse.json({ error: 'Valid event start time is required' }, { status: 400 });
    }

    if (end_time && !isValidDate(end_time)) {
      return NextResponse.json({ error: 'Invalid event end time' }, { status: 400 });
    }

    const validCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'reminder';
    const validRecurrence = ALLOWED_RECURRENCE.includes(recurrence_rule) ? recurrence_rule : 'none';

    const supabase = getSupabaseAdmin();
    const { data: event, error } = await supabase
      .from('events')
      .insert([
        {
          user_id: userId,
          title: title.trim(),
          description: typeof description === 'string' ? description.trim() : '',
          start_time,
          end_time: end_time || null,
          recurrence_rule: validRecurrence,
          category: validCategory,
          time_zone: typeof time_zone === 'string' ? time_zone : 'UTC',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      logger.error(`[Events POST] Error creating event for ${userId}: ${error.message}`);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    logger.error(`[Events POST] Exception: ${error.message || error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 });
  }

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { id, title, description, start_time, end_time, recurrence_rule, category, time_zone } = body;

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    if (start_time !== undefined && !isValidDate(start_time)) {
      return NextResponse.json({ error: 'Invalid event start time' }, { status: 400 });
    }

    if (end_time !== undefined && end_time !== null && !isValidDate(end_time)) {
      return NextResponse.json({ error: 'Invalid event end time' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const updatePayload = {};

    if (title !== undefined) updatePayload.title = typeof title === 'string' ? title.trim() : '';
    if (description !== undefined) updatePayload.description = typeof description === 'string' ? description.trim() : '';
    if (start_time !== undefined) updatePayload.start_time = start_time;
    if (end_time !== undefined) updatePayload.end_time = end_time;
    if (recurrence_rule !== undefined) {
      updatePayload.recurrence_rule = ALLOWED_RECURRENCE.includes(recurrence_rule) ? recurrence_rule : 'none';
    }
    if (category !== undefined) {
      updatePayload.category = ALLOWED_CATEGORIES.includes(category) ? category : 'reminder';
    }
    if (time_zone !== undefined) updatePayload.time_zone = typeof time_zone === 'string' ? time_zone : 'UTC';

    const { data: updated, error } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error(`[Events PUT] Error updating event ${id} for ${userId}: ${error.message}`);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }

    return NextResponse.json({ success: true, event: updated });
  } catch (error) {
    logger.error(`[Events PUT] Exception: ${error.message || error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 });
  }

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch (e) {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      logger.error(`[Events DELETE] Error deleting event ${id} for ${userId}: ${error.message}`);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    logger.error(`[Events DELETE] Exception: ${error.message || error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
