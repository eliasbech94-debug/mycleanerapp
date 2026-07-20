// scripts/realtime-load.mjs
//
// Multi-client Realtime smoke test. Opens N Supabase Realtime clients,
// subscribes each to `public.messages`, then has one client insert a message
// (via an edge function you provide) and asserts every other client
// receives the event within TIMEOUT_MS. Also runs a reconnect cycle.
//
// Usage:
//   VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... \
//   TEST_JWT=<user access token> \
//   CONVERSATION_ID=<uuid> \
//   CLIENTS=25 node scripts/realtime-load.mjs
//
// This is a functional smoke, not a soak test. For real load, wrap this in
// k6/Artillery with 100–1000 virtual users on staging.

import { createClient } from '@supabase/supabase-js';

const URL     = process.env.VITE_SUPABASE_URL;
const KEY     = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const JWT     = process.env.TEST_JWT;
const CONV    = process.env.CONVERSATION_ID;
const N       = Number(process.env.CLIENTS ?? 10);
const TIMEOUT = Number(process.env.TIMEOUT_MS ?? 5000);

if (!URL || !KEY || !JWT || !CONV) {
  console.error('Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, TEST_JWT, CONVERSATION_ID');
  process.exit(2);
}

const mkClient = (i) => {
  const c = createClient(URL, KEY, {
    global: { headers: { Authorization: `Bearer ${JWT}` } },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  c.__i = i;
  return c;
};

const subscribe = (c) =>
  new Promise((resolve, reject) => {
    const received = [];
    const ch = c
      .channel(`msgs-${c.__i}-${Date.now()}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages',
            filter: `conversation_id=eq.${CONV}` },
          (p) => received.push(p.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve({ ch, received });
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
  });

const send = async (c, body) => {
  const { error } = await c.functions.invoke('conversation-send-message', {
    body: { conversation_id: CONV, body, message_type: 'text' },
  });
  if (error) throw error;
};

(async () => {
  console.log(`Opening ${N} Realtime clients…`);
  const clients = Array.from({ length: N }, (_, i) => mkClient(i));
  const subs = await Promise.all(clients.map(subscribe));
  console.log('All subscribed. Sending broadcast message…');

  const marker = `rt-test-${Date.now()}`;
  await send(clients[0], marker);

  await new Promise((r) => setTimeout(r, TIMEOUT));

  const seen = subs.map((s) => s.received.some((m) => m.body === marker));
  const pass = seen.filter(Boolean).length;
  console.log(`Delivery: ${pass}/${N} clients received the message.`);

  // Reconnect test
  console.log('Forcing disconnect on client 0…');
  await clients[0].realtime.disconnect();
  await new Promise((r) => setTimeout(r, 1000));
  await clients[0].realtime.connect();
  await new Promise((r) => setTimeout(r, 1500));
  const marker2 = `rt-test-reconn-${Date.now()}`;
  await send(clients[1], marker2);
  await new Promise((r) => setTimeout(r, TIMEOUT));
  const reconnOk = subs[0].received.some((m) => m.body === marker2);
  console.log(`Reconnect delivery on client 0: ${reconnOk ? 'PASS' : 'FAIL'}`);

  await Promise.all(subs.map((s) => s.ch.unsubscribe()));
  process.exit(pass === N && reconnOk ? 0 : 1);
})();
