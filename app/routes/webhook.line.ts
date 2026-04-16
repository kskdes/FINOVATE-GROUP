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
  message?: {type: string; text?: string};
}

interface LineWebhookBody {
  events: LineEvent[];
}

// POST /webhook/line
// LINE Developers Console の Webhook URL にこのURLを設定する
// ボットに話しかけると console にユーザーIDが出力される
export async function action({request}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {status: 405});
  }

  const body = (await request.json()) as LineWebhookBody;

  for (const event of body.events ?? []) {
    const source = event.source;
    if (source.userId) {
      // Netlify / サーバーログで確認できる
      console.log('=== LINE User ID ===');
      console.log('userId:', source.userId);
      if (source.groupId) console.log('groupId:', source.groupId);
      console.log('===================');
    }
  }

  return new Response(JSON.stringify({ok: true}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}
