import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = 'risers-2.0';

export async function onRequestPost({ request, env }) {
  try {
    const { key } = await request.json();

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

    if (key) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }));
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
