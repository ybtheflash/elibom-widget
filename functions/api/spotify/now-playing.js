export async function onRequest({ env }) {
  try {
    const clientId = env.SPOTIFY_CLIENT_ID;
    const clientSecret = env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = env.SPOTIFY_REFRESH_TOKEN;
    
    if (!clientId || !clientSecret || !refreshToken) {
      return Response.json({ ok: true, isPlaying: false, error: "Missing config" });
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
      return Response.json({ ok: true, isPlaying: false, error: "No token" });
    }

    const npRes = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (npRes.status === 204) {
      return Response.json({ ok: true, isPlaying: false });
    }
    
    if (!npRes.ok) {
      return Response.json({ ok: true, isPlaying: false });
    }

    const song = await npRes.json();
    const isPlaying = song?.is_playing === true;
    if (!isPlaying || !song?.item) {
      return Response.json({ ok: true, isPlaying: false });
    }

    const title = song.item.name;
    const artist = Array.isArray(song.item.artists)
      ? song.item.artists.map(a => a.name).filter(Boolean).join(", ")
      : "";
    const albumImageUrl = song.item.album?.images?.[0]?.url;
    const progressMs = song.progress_ms;
    const durationMs = song.item.duration_ms;

    return Response.json({
      ok: true,
      isPlaying: true,
      title,
      artist,
      albumImageUrl,
      progressMs,
      durationMs
    });
  } catch (e) {
    return Response.json({ ok: true, isPlaying: false, error: e.message });
  }
}
