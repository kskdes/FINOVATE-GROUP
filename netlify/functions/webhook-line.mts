import type {Config} from '@netlify/functions';

export const config: Config = {
  path: '/webhook/line',
};

interface LineEventSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
}

interface LineEvent {
  type: string;
  source: LineEventSource;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('OK', {status: 200});
  }

  try {
    const text = await req.text();
    if (text) {
      const body = JSON.parse(text) as {events: LineEvent[]};
      for (const event of body.events ?? []) {
        if (event.source?.userId) {
          console.log('=== LINE User ID ===');
          console.log('userId:', event.source.userId);
          if (event.source.groupId) console.log('groupId:', event.source.groupId);
          console.log('===================');
        }
      }
    }
  } catch (e) {
    console.error('webhook error:', e);
  }

  return new Response('OK', {status: 200});
}
