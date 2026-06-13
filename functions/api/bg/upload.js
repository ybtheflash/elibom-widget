import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = 'risers-2.0';
const S3_FOLDER = 'elimob-bg';

export async function onRequestPost({ request, env }) {
  try {
    const { data, contentType } = await request.json();
    
    if (!env.S3_ACCESS_KEY_ID || !env.S3_ACCESS_SECRET || !env.S3_ENDPOINT) {
      return Response.json({ ok: false, error: 'S3 not configured' });
    }

    const s3Client = new S3Client({
      region: env.S3_REGION || 'ap-south-1',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_ACCESS_SECRET,
      },
      forcePathStyle: true,
    });

    const url = new URL(env.S3_ENDPOINT);
    const projectRef = url.hostname.split('.')[0];
    const publicUrlBase = `https://${projectRef}.supabase.co/storage/v1/object/public/`;

    // Decode base64
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    // Cloudflare Workers provide atob globally
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const key = `${S3_FOLDER}/bg-${Date.now()}.webp`;
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType || 'image/webp',
    }));

    const publicUrl = `${publicUrlBase}${S3_BUCKET}/${key}`;
    return Response.json({ ok: true, url: publicUrl, key });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
