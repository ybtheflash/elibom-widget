import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { init as initAdmin, tx } from '@instantdb/admin';

let s3Client = null;
let publicUrlBase = null;
const S3_BUCKET = 'risers-2.0';
const S3_FOLDER = 'elimob-bg';

function getS3(env) {
  if (!s3Client && env.S3_ACCESS_KEY_ID && env.S3_ACCESS_SECRET && env.S3_ENDPOINT) {
    s3Client = new S3Client({
      region: env.S3_REGION || 'ap-south-1',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_ACCESS_SECRET,
      },
      forcePathStyle: true,
    });
    // Derive public URL: https://<ref>.supabase.co/storage/v1/object/public/
    const url = new URL(env.S3_ENDPOINT);
    const projectRef = url.hostname.split('.')[0];
    publicUrlBase = `https://${projectRef}.supabase.co/storage/v1/object/public/`;
  }
  return { s3: s3Client, publicUrlBase };
}

function collectBody(req, maxSize = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) { reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const APP_ID = '3a46f5e4-5e7b-4e3c-a689-64a0a7ae4786';
const CONFIG_ID = '11111111-1111-1111-1111-111111111111';

const spotifyPlugin = (env) => {
  let adminDb = null;
  if (env.INSTANT_DB_ADMIN) {
    adminDb = initAdmin({ appId: APP_ID, adminToken: env.INSTANT_DB_ADMIN });
  }

  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {

        // ─── Auth verification ───
        if (req.url === '/api/auth/verify' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { passkey } = JSON.parse(body);
              const editPasskey = env.EDIT_PASSKEY;
              res.setHeader('Content-Type', 'application/json');
              if (passkey && editPasskey && passkey === editPasskey) {
                res.end(JSON.stringify({ ok: true }));
              } else {
                res.end(JSON.stringify({ ok: false, error: 'Invalid passkey' }));
              }
            } catch (e) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Bad request' }));
            }
          });
          return;
        }

        // ─── InstantDB Secure Update ───
        if (req.url === '/api/db/update' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const { passkey, updates } = JSON.parse(body.toString());
            
            if (!env.EDIT_PASSKEY || passkey !== env.EDIT_PASSKEY) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
              return;
            }

            if (!adminDb) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Admin DB not configured' }));
              return;
            }

            await adminDb.transact(tx.config[CONFIG_ID].update(updates));
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e) {
            console.error('DB update error:', e);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: e.message }));
            return;
          }
        }

        // ─── InstantDB Secure Read (Polling fallback) ───
        if (req.url === '/api/db/read' && req.method === 'GET') {
          try {
            if (!adminDb) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Admin DB not configured' }));
              return;
            }
            const result = await adminDb.query({ config: {} });
            const configs = result.config || [];
            const cfg = configs.find(c => c.id === CONFIG_ID) || configs[0] || null;
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, config: cfg }));
            return;
          } catch(e) {
            console.error('DB read error:', e);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: e.message }));
            return;
          }
        }

        // ─── BG Upload to S3 ───
        if (req.url === '/api/bg/upload' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const { data, contentType } = JSON.parse(body.toString());

            const { s3, publicUrlBase: pubBase } = getS3(env);
            if (!s3) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'S3 not configured' }));
              return;
            }

            // Decode base64 (strip data URI prefix if present)
            const base64Data = data.includes(',') ? data.split(',')[1] : data;
            const buffer = Buffer.from(base64Data, 'base64');

            const key = `${S3_FOLDER}/bg-${Date.now()}.webp`;
            await s3.send(new PutObjectCommand({
              Bucket: S3_BUCKET,
              Key: key,
              Body: buffer,
              ContentType: contentType || 'image/webp',
            }));

            const publicUrl = `${pubBase}${S3_BUCKET}/${key}`;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, url: publicUrl, key }));
            return;
          } catch (e) {
            console.error('BG upload error:', e);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: e.message }));
            return;
          }
        }

        // ─── BG Delete from S3 ───
        if (req.url === '/api/bg/delete' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const { key } = JSON.parse(body.toString());

            const { s3 } = getS3(env);
            if (!s3) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'S3 not configured' }));
              return;
            }

            if (key) {
              await s3.send(new DeleteObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
              }));
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e) {
            console.error('BG delete error:', e);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: e.message }));
            return;
          }
        }

        // ─── Spotify Now Playing ───
        if (req.url === '/api/spotify/now-playing') {
          try {
            const clientId = env.SPOTIFY_CLIENT_ID;
            const clientSecret = env.SPOTIFY_CLIENT_SECRET;
            const refreshToken = env.SPOTIFY_REFRESH_TOKEN;
            
            if (!clientId || !clientSecret || !refreshToken) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, isPlaying: false, error: "Missing config" }));
              return;
            }

            const basic = btoa(`${clientId}:${clientSecret}`);
            const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
              method: "POST",
              headers: {
                Authorization: `Basic ${basic}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
              }),
            });
            const tokenJson = await tokenRes.json();
            const token = tokenJson.access_token;
            
            if (!token) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, isPlaying: false, error: "No token" }));
              return;
            }

            const npRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
              headers: { Authorization: `Bearer ${token}` }
            });

            res.setHeader('Content-Type', 'application/json');
            
            if (npRes.status === 204) {
              res.end(JSON.stringify({ ok: true, isPlaying: false }));
              return;
            }
            
            if (!npRes.ok) {
              res.end(JSON.stringify({ ok: true, isPlaying: false }));
              return;
            }

            const song = await npRes.json();
            const isPlaying = song?.is_playing === true;
            if (!isPlaying || !song?.item) {
              res.end(JSON.stringify({ ok: true, isPlaying: false }));
              return;
            }

            const title = song.item.name;
            const artist = Array.isArray(song.item.artists)
              ? song.item.artists.map(a => a.name).filter(Boolean).join(", ")
              : "";
            const albumImageUrl = song.item.album?.images?.[0]?.url;
            const progressMs = song.progress_ms;
            const durationMs = song.item.duration_ms;

            res.end(JSON.stringify({
              ok: true,
              isPlaying: true,
              title,
              artist,
              albumImageUrl,
              progressMs,
              durationMs
            }));
            return;
          } catch (e) {
            console.error(e);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, isPlaying: false, error: e.message }));
            return;
          }
        }
        next();
      });
    }
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    server: {
      port: 5173,
      host: true
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), 'index.html'),
          edit: resolve(process.cwd(), 'edit.html'),
        }
      }
    },
    plugins: [spotifyPlugin(env)]
  };
});
