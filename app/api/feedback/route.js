import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';

const feedbackSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  type: z.string().optional().default('General Feedback'),
});

export async function POST(req) {
  try {
    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress || 'Unknown User';
    
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Bad Request: Invalid JSON payload' }, { status: 400 });
    }

    const parseResult = feedbackSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues[0]?.message || 'Invalid feedback payload' },
        { status: 400 }
      );
    }

    const { message, type } = parseResult.data;

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error("DISCORD_WEBHOOK_URL is not configured.");
      return NextResponse.json({ success: false, error: 'Discord webhook not configured' }, { status: 500 });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**New ${type} Report from ${userEmail}**\n> ${message}`
      })
    });

    if (!res.ok) {
      throw new Error(`Discord API error: ${res.status}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
