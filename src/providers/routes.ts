import { Router, Request, Response } from 'express';
import { getZokoAnimeServers, getZokoAnimeStream } from './zokoanime';
import { proxiedHlsUrl, proxiedSubtitleUrl } from '../routes';

const router = Router();

function safeError(error: any) {
  return error?.response?.status
    ? 'Upstream returned HTTP ' + error.response.status
    : error?.message || 'Provider request failed';
}

router.get('/zokoanime/servers', async (req: Request, res: Response) => {
  try {
    const episode = Number(req.query.ep);
    if (!Number.isSafeInteger(episode) || episode < 1) return res.status(400).json({ error: 'Required query param: ?ep={episodeNumber}' });
    const anilistId = Number(req.query.anilistId);
    if (Number.isSafeInteger(anilistId) && anilistId > 0) {
      const servers = getZokoAnimeServers(String(anilistId), episode, 'anilist');
      return res.json({ source: 'zokoanime', anilistId, episode, count: servers.length, servers });
    }
    const malId = String(req.query.malId || '');
    if (!/^\\d+$/.test(malId)) return res.status(400).json({ error: 'Provide a valid ?anilistId= or ?malId=' });
    const servers = getZokoAnimeServers(malId, episode, 'mal');
    return res.json({ source: 'zokoanime', malId: Number(malId), episode, count: servers.length, servers });
  } catch (error) {
    return res.status(502).json({ error: safeError(error) });
  }
});

router.get('/zokoanime/watch', async (req: Request, res: Response) => {
  const sourceId = String(req.query.serverId || '');
  if (!sourceId) return res.status(400).json({ error: 'Missing ?serverId=' });
  try {
    const stream = await getZokoAnimeStream(sourceId);
    if (!stream) return res.status(400).json({ error: 'Invalid ZokoAnime server ID' });
    const parts = sourceId.split('::');
    const hasIdType = parts.length === 4 && (parts[0] === 'mal' || parts[0] === 'anilist');
    const idType = hasIdType ? parts[0] : 'mal';
    const id = hasIdType ? parts[1] : parts[0];
    const episode = hasIdType ? parts[2] : parts[1];
    const type = hasIdType ? parts[3] : parts[2];
    return res.json({
      source: 'zokoanime',
      ...(idType === 'anilist' ? { anilistId: Number(id) } : { malId: Number(id) }),
      episode: Number(episode),
      type,
      ...stream,
      // The shared HLS proxy rewrites every nested playlist/segment URI and
      // forwards ZokoAnime's required Referer and Origin headers.
      hlsProxyUrl: proxiedHlsUrl(req, stream.m3u8, stream.embedUrl),
      subtitles: stream.subtitles.map((track) => ({
        ...track,
        url: proxiedSubtitleUrl(req, track.src, stream.embedUrl),
      })),
      iframeOnly: false,
    });
  } catch (error) {
    return res.status(502).json({ source: 'zokoanime', error: safeError(error) });
  }
});

export default router;
