import type {ActionFunctionArgs} from '@remix-run/server-runtime';

interface LineEventSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

interface LineEvent {
  type: string;
  source: LineEventSource;
}

interface LineWebhookBody {
  events: LineEvent[];
}

export async function action({request}: ActionFunctionArgs) {
  try {
    const text = await request.text();
    if (!text) {
      return new Response(JSON.stringify({ok: true}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    }

    const body = JSON.parse(text) as LineWebhookBody;

    for (const event of body.events ?? []) {
      const source = event.source;
      if (source?.userId) {
        console.log('=== LINE User ID ===');
        console.log('userId:', source.userId);
        if (source.groupId) console.log('groupId:', source.groupId);
        console.log('===================');
      }
    }
  } catch (e) {
    console.error('Webhook parse error:', e);
  }

  return new Response(JSON.stringify({ok: true}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}
