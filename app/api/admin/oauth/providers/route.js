import { NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    return NextResponse.json({ success: false, error: 'Too many requests, please slow down.' }, { status: 429 });
  }

  try {
    const { isAdmin, userId, reason } = await verifyAdminAccess();
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: reason || 'Forbidden: Admin access required' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: providers, error } = await supabase
      .from('oauth_providers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      logger.error(`[Admin OAuth GET] Failed to fetch providers: ${error.message}`);
      return NextResponse.json({ success: false, error: 'Failed to fetch OAuth providers' }, { status: 500 });
    }

    // Mask client secrets before returning to client UI
    const maskedProviders = (providers || []).map((p) => ({
      ...p,
      hasSecret: Boolean(p.client_secret && p.client_secret.trim()),
      client_secret_masked: p.client_secret ? '••••••••' + p.client_secret.slice(-4) : '',
    }));

    return NextResponse.json({ success: true, providers: maskedProviders });
  } catch (error) {
    logger.error(`[Admin OAuth GET] Exception: ${error.message || error}`);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    return NextResponse.json({ success: false, error: 'Too many requests, please slow down.' }, { status: 429 });
  }

  try {
    const { isAdmin, userId, reason } = await verifyAdminAccess();
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: reason || 'Forbidden: Admin access required' }, { status: 403 });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { id, name, client_id, client_secret, is_enabled, scopes } = body;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ success: false, error: 'Provider ID is required' }, { status: 400 });
    }

    const sanitizedId = id.trim().toLowerCase();
    const supabase = getSupabaseAdmin();

    // Fetch existing provider record to compare changes
    const { data: existing } = await supabase
      .from('oauth_providers')
      .select('*')
      .eq('id', sanitizedId)
      .maybeSingle();

    const sanitizedScopes = Array.isArray(scopes)
      ? scopes.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : existing?.scopes || [];

    const updatePayload = {
      id: sanitizedId,
      name: typeof name === 'string' && name.trim() ? name.trim() : existing?.name || sanitizedId,
      client_id: client_id !== undefined ? (typeof client_id === 'string' ? client_id.trim() : '') : existing?.client_id || '',
      is_enabled: is_enabled !== undefined ? Boolean(is_enabled) : existing?.is_enabled || false,
      scopes: sanitizedScopes,
      updated_at: new Date().toISOString(),
    };

    // Only update client_secret if provided and not masked
    if (typeof client_secret === 'string' && client_secret.trim() && !client_secret.startsWith('••••')) {
      updatePayload.client_secret = client_secret.trim();
    }

    const { data: updated, error } = await supabase
      .from('oauth_providers')
      .upsert(updatePayload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error(`[Admin OAuth POST] Failed to update provider ${sanitizedId}: ${error.message}`);
      return NextResponse.json({ success: false, error: 'Failed to update OAuth provider' }, { status: 500 });
    }

    // Determine event type for auth_logs
    let eventType = 'CREDENTIALS_UPDATED';
    let eventStatus = 'info';
    let eventMsg = `OAuth credentials updated for ${updated.name || sanitizedId}`;

    if (existing && existing.is_enabled !== updated.is_enabled) {
      eventType = updated.is_enabled ? 'PROVIDER_ENABLED' : 'PROVIDER_DISABLED';
      eventStatus = updated.is_enabled ? 'success' : 'warning';
      eventMsg = `OAuth provider ${updated.name || sanitizedId} ${updated.is_enabled ? 'enabled' : 'disabled'}`;
    }

    // Insert log entry into auth_logs
    await supabase.from('auth_logs').insert([
      {
        provider: sanitizedId,
        event: eventType,
        status: eventStatus,
        message: eventMsg,
        user_id: userId,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      success: true,
      provider: {
        ...updated,
        hasSecret: Boolean(updated.client_secret && updated.client_secret.trim()),
        client_secret_masked: updated.client_secret ? '••••••••' + updated.client_secret.slice(-4) : '',
      },
    });
  } catch (error) {
    logger.error(`[Admin OAuth POST] Exception: ${error.message || error}`);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req) {
  return POST(req);
}
