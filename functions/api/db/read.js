import { init as initAdmin } from '@instantdb/admin';

const APP_ID = '3a46f5e4-5e7b-4e3c-a689-64a0a7ae4786';
const CONFIG_ID = '11111111-1111-1111-1111-111111111111';

export async function onRequestGet({ env }) {
  try {
    if (!env.INSTANT_DB_ADMIN) {
      return Response.json({ ok: false, error: 'Admin DB not configured' });
    }
    
    const adminDb = initAdmin({ appId: APP_ID, adminToken: env.INSTANT_DB_ADMIN });
    const result = await adminDb.query({ config: {} });
    const configs = result.config || [];
    const cfg = configs.find(c => c.id === CONFIG_ID) || configs[0] || null;
    
    return Response.json({ ok: true, config: cfg });
  } catch(e) {
    return Response.json({ ok: false, error: e.message });
  }
}
