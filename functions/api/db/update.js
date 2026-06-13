import { init as initAdmin, tx } from '@instantdb/admin';

const APP_ID = '3a46f5e4-5e7b-4e3c-a689-64a0a7ae4786';
const CONFIG_ID = '11111111-1111-1111-1111-111111111111';

export async function onRequestPost({ request, env }) {
  try {
    const { passkey, updates } = await request.json();
    
    if (!env.EDIT_PASSKEY || passkey !== env.EDIT_PASSKEY) {
      return Response.json({ ok: false, error: 'Unauthorized' });
    }

    if (!env.INSTANT_DB_ADMIN) {
      return Response.json({ ok: false, error: 'Admin DB not configured' });
    }

    const adminDb = initAdmin({ appId: APP_ID, adminToken: env.INSTANT_DB_ADMIN });
    await adminDb.transact(tx.config[CONFIG_ID].update(updates));
    
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
