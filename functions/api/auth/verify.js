export async function onRequestPost({ request, env }) {
  try {
    const { passkey } = await request.json();
    const editPasskey = env.EDIT_PASSKEY;
    if (passkey && editPasskey && passkey === editPasskey) {
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: 'Invalid passkey' });
  } catch (e) {
    return Response.json({ ok: false, error: 'Bad request' });
  }
}
