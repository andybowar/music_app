import { describe, expect, it } from 'vitest';

import { parseYouTubeId } from './youtube';

const ID = 'fakeVid0_-1';

describe('parseYouTubeId', () => {
  it.each([
    // watch
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&feature=share`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?feature=youtu.be&v=${ID}&t=30s&list=PLfake`],
    [`https://www.youtube.com/watch/?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}#t=1m`],
    [`https://WWW.YouTube.COM/watch?v=${ID}`],
    // youtu.be
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc123&t=42`],
    [`https://www.youtu.be/${ID}/`],
    // shorts
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    // embed
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/embed/${ID}?start=10&autoplay=1`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://youtube-nocookie.com/embed/${ID}`],
    // live, legacy /v/
    [`https://www.youtube.com/live/${ID}?si=x`],
    [`https://www.youtube.com/v/${ID}`],
    // whitespace, missing scheme
    [`   https://youtu.be/${ID}  \n`],
    [`youtu.be/${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
  ])('accepts %s', (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });

  it.each([
    // empty / unparseable
    [''],
    ['   '],
    ['not a url'],
    ['https://'],
    // not YouTube
    [`https://example.com/watch?v=${ID}`],
    [`https://vimeo.com/${ID}`],
    [`https://youtube.com.evil.example/watch?v=${ID}`],
    [`https://notyoutube.com/watch?v=${ID}`],
    [`https://youtube.com@evil.example/watch?v=${ID}`],
    [`https://evil.example/?u=https://youtu.be/${ID}`],
    [`https://evil.example/youtu.be/${ID}`],
    // wrong scheme
    [`ftp://youtube.com/watch?v=${ID}`],
    [`javascript:alert('https://youtu.be/${ID}')`],
    // YouTube, but not a single video
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/watch'],
    ['https://www.youtube.com/watch?list=PLfake'],
    ['https://www.youtube.com/playlist?list=PLfake'],
    ['https://www.youtube.com/@somechannel'],
    ['https://www.youtube.com/channel/UCfakefakefake'],
    ['https://youtu.be/'],
    [`https://youtu.be/${ID}/extra`],
    ['https://www.youtube.com/shorts/'],
    [`https://www.youtube.com/shorts/${ID}/extra`],
    [`https://www.youtube.com/watch/extra?v=${ID}`],
    [`https://www.youtube.com/results?v=${ID}`],
    [`https://www.youtube.com/?v=${ID}`],
    // malformed ids
    ['https://www.youtube.com/watch?v=short'],
    [`https://www.youtube.com/watch?v=${ID}x`],
    ['https://youtu.be/bad!chars!!'],
    ['https://www.youtube.com/embed/abc'],
  ])('rejects %s', (url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });
});
