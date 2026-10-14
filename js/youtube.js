// YouTube Data API in sola lettura: iscritti, like e commenti del canale.
import { gfetch } from './google.js';
import { JarvisError } from './errors.js';

const YT = 'https://www.googleapis.com/youtube/v3';

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const num = (v) => (v == null ? null : Number(v));

export async function channelSnapshot(handle) {
  const h = String(handle || '').trim();
  const params = { part: 'snippet,statistics,contentDetails' };
  if (h) params.forHandle = h.startsWith('@') ? h : '@' + h;
  else params.mine = 'true';
  const ch = await gfetch(`${YT}/channels`, params);
  const c = ch.items?.[0];
  if (!c) {
    throw new JarvisError(
      h ? `Non trovo il canale ${params.forHandle}.` : 'Nessun canale YouTube su questo account: indichi il nome del canale nelle impostazioni.',
    );
  }

  // Video caricati (fino a 200, i più recenti).
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const ids = [];
  let pageToken;
  for (let i = 0; uploads && i < 4; i++) {
    const r = await gfetch(`${YT}/playlistItems`, { part: 'contentDetails', playlistId: uploads, maxResults: 50, pageToken });
    ids.push(...(r.items || []).map((x) => x.contentDetails.videoId));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  const videos = [];
  for (const group of chunk(ids, 50)) {
    const r = await gfetch(`${YT}/videos`, { part: 'snippet,statistics', id: group.join(',') });
    videos.push(...(r.items || []));
  }
  const titles = Object.fromEntries(videos.map((v) => [v.id, v.snippet.title]));
  const sum = (key) => videos.reduce((t, v) => t + (Number(v.statistics?.[key]) || 0), 0);

  // Commenti recenti su tutto il canale.
  let commenti = [];
  let erroreCommenti;
  try {
    const r = await gfetch(`${YT}/commentThreads`, {
      part: 'snippet,replies',
      allThreadsRelatedToChannelId: c.id,
      maxResults: 30,
      order: 'time',
      textFormat: 'plainText',
    });
    commenti = (r.items || [])
      .map((t) => {
        const top = t.snippet.topLevelComment.snippet;
        return {
          autore: top.authorDisplayName,
          testo: top.textDisplay.length > 300 ? top.textDisplay.slice(0, 300) + '…' : top.textDisplay,
          video: titles[t.snippet.videoId] || t.snippet.videoId,
          data: top.publishedAt,
          like: top.likeCount,
          risposte: t.snippet.totalReplyCount,
          haRispostoLei: (t.replies?.comments || []).some((x) => x.snippet.authorChannelId?.value === c.id),
          mio: top.authorChannelId?.value === c.id,
        };
      })
      .filter((x) => !x.mio)
      .map(({ mio, ...rest }) => rest);
  } catch (e) {
    erroreCommenti = e.message;
  }

  const recenti = [...videos]
    .sort((a, b) => (a.snippet.publishedAt < b.snippet.publishedAt ? 1 : -1))
    .slice(0, 3)
    .map((v) => ({
      titolo: v.snippet.title,
      pubblicato: v.snippet.publishedAt,
      visualizzazioni: num(v.statistics?.viewCount),
      like: num(v.statistics?.likeCount),
      commenti: num(v.statistics?.commentCount),
    }));

  return {
    canale: c.snippet.title,
    iscritti: c.statistics.hiddenSubscriberCount ? null : num(c.statistics.subscriberCount),
    iscrittiNascosti: Boolean(c.statistics.hiddenSubscriberCount),
    video: num(c.statistics.videoCount),
    visualizzazioni: num(c.statistics.viewCount),
    like: sum('likeCount'),
    commenti: sum('commentCount'),
    videoAnalizzati: videos.length,
    ultimiVideo: recenti,
    commentiRecenti: commenti,
    erroreCommenti,
  };
}
