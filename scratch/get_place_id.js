async function test() {
  const url = 'https://www.google.com/maps/place/%E5%AE%BD%E7%AA%84%E5%B0%8F%E5%8E%A8/@1.3501963,103.6969398,12z/data=!4m7!3m6!1s0x31da1719d3ffa6e1:0xf2f47b43091b66d2!8m2!3d1.3501963!4d103.8411354!15sCg_lrr3nqoTnopfnopfppplaFCIS5a6956qEIOeilyDnopcg6aaZkgESY2hpbmVzZV9yZXN0YXVyYW50mgFEQ2k5RFFVbFJRVU52WkVOb2RIbGpSamx2VDJ4d2NsZEdSbmhWVkVKWlUyMUdOV1F4YkhwaFZFNUdXbXN4V0dOSFl4QULgAQD6AQQIChAb!16s%2Fg%2F11xlkj7rkw?entry=tts&g_ep=EgoyMDI2MDUyMC4wIPu8ASoASAFQAw%3D%3D&skid=bf912a97-fbff-4305-9968-603c90fd99b2';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });
  const body = await res.text();
  console.log('HTML Length:', body.length);
  const regex = /ChI[a-zA-Z0-9_-]{24}/g;
  const matches = body.match(regex);
  if (matches) {
    console.log('Found matches:', [...new Set(matches)]);
  } else {
    console.log('No matches found.');
    // Search for ChI case-insensitive or just ChI
    const idx = body.indexOf('ChI');
    if (idx !== -1) {
      console.log('Sub:', body.substring(idx - 10, idx + 40));
    }
  }
}
test();
