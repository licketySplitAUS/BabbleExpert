'use strict';
// Reproducible edit. Raw desktop captures stay here; only selected product
// footage is exported to src/tour/media. Requires FFmpeg with libvpx-vp9.
const fs = require('node:fs'), path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const ffmpeg = process.env.TOUR_FFMPEG || 'C:/Program Files/Virtual Desktop Streamer/ffmpeg.exe';
const ffprobe = process.env.TOUR_FFPROBE || 'C:/Program Files/Virtual Desktop Streamer/ffprobe.exe';
const output = path.resolve(__dirname, '../../src/tour/media');
const edits = [
  ['fresh','fresh-grid',0,6,1], ['babble-type','babble-type',24,12,1],
  ['babble-tiles','babble-tiles',0,35,3], ['selfserve-type','selfserve-type',8,22,2],
  ['selfserve-tiles','selfserve-tiles',0,35,3], ['add','lickety-add',13,17,1.6],
  ['duplicate','add-duplicate',10,8,1], ['rejected','add-rejected',3,10,1],
  ['chat','chat-draft',0,13,1.2], ['sources','source-switch',0,22,2],
  ['lickety-type','lickety-type-final',0,19,1.5], ['lickety-tiles','lickety-tiles',0,29,2.5],
  ['off','clues-off',0,6,1], ['clue-lookup','clue-resource',0,9,1],
  ['resource-open','resource-open',13,18,1.7], ['resource-click','resource-click',34,10,1],
  ['resource-type','resource-type-final',58,12,1.2,'wide'],
  ['resource-plus','resource-ensure-plus',3,18,1.5,'changing'],
  ['resource-minus','resource-minus',14,10,1],
  ['divider','layout-divider',5,11,1], ['move-add','layout-add-final',24,7,1],
  ['fun-open','fun-word-play',0,15,1.3,'fun'], ['fun','fun-react',33,10,1,'fun'],
  ['chill','chill-vibes',2,14,1,'fun'], ['create-option','options-create',0,17,1.6],
  ['create','create-popup-final',0,9.5,1,'popup'], ['retry','create-retry-final',0,8,1,'popup'],
  ['edit-clue','create-edit',0,8,1,'popup'], ['clue-source-popup','create-from-lickety',0,12,1]
];
fs.mkdirSync(output, { recursive: true });
function run(args) { return new Promise((resolve, reject) => {
  const child = spawn(ffmpeg, args, { windowsHide: true }); let error = '';
  child.stderr.on('data', data => { error += data; });
  child.on('error', reject); child.on('exit', code => code ? reject(Error(error)) : resolve());
}); }
async function edit([id, source, start, length, rate, kind]) {
  const input = path.join(__dirname, 'raw', source + '.webm');
  const info = JSON.parse(execFileSync(ffprobe, ['-v','error','-show_entries','stream=width,height','-of','json',input], { encoding:'utf8' })).streams[0];
  // Remove the desktop taskbar from full-display captures. Earlier canvas
  // captures were already cropped to the application window.
  const crop = info.height === 1440 ? 'crop=2560:1368:0:0,' : '';
  let filters = `[0:v]${crop}scale=1920:1026,setpts=(PTS-STARTPTS)/${rate},fps=24,setsar=1[base];`;
  let current = 'base', count = 0;
  function blur(x,y,w,h,enable='1') {
    const i = ++count;
    filters += `[${current}]split=2[b${i}][p${i}];[p${i}]crop=${w}:${h}:${x}:${y},gblur=sigma=16[q${i}];[b${i}][q${i}]overlay=${x}:${y}:enable='${enable}'[s${i}];`;
    current = 's' + i;
  }
  // Soften unrelated public chat and the logged-in account banner. Restore
  // the real clue popup after masking when it overlaps the chat column.
  if (kind !== 'fun') {
    if (kind === 'wide') blur(1352,270,80,540);
    else if (kind === 'changing') {
      blur(1352,270,80,540,'lt(t,3.6)');
      blur(1370,275,370,540,'gte(t,3.6)');
      blur(1440,62,355,75,'gte(t,3.6)');
    } else { blur(1420,275,380,540); blur(1440,62,355,75); }
  }
  if (kind === 'popup') {
    // These popup takes use the same 1707x912 application framing.
    filters += `[0:v]${crop}scale=1920:1026,setpts=(PTS-STARTPTS)/${rate},fps=24,crop=510:382:1179:437[popup];[${current}][popup]overlay=1179:437[restored];`;
    current = 'restored';
  }
  filters = filters.replace(/;$/, '');
  await run(['-hide_banner','-loglevel','error','-ss',String(start),'-i',input,'-t',String(length/rate),
    '-filter_complex',filters,'-map',`[${current}]`,'-an','-c:v','libvpx-vp9','-deadline','realtime',
    '-cpu-used','6','-threads','2','-crf','29','-b:v','0','-g','48','-y',path.join(output,id+'.webm')]);
  console.log('Exported '+id);
}
(async () => {
  const requested=process.argv.slice(2),jobs=requested.length?edits.filter(([id])=>requested.includes(id)):edits;
  if(!jobs.length)throw Error('No matching clip IDs');
  let next = 0;
  await Promise.all([0,1].map(async () => { while (next < jobs.length) await edit(jobs[next++]); }));
  const manifest = {};
  for (const [id] of edits) {
    const file = path.join(output, id+'.webm');
    const info = JSON.parse(execFileSync(ffprobe, ['-v','error','-show_entries','format=duration','-of','json',file], { encoding:'utf8' }));
    manifest[id] = { src:'media/'+id+'.webm', duration:Number(info.format.duration), bytes:fs.statSync(file).size };
  }
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'manifest.mjs'),'export default '+JSON.stringify(manifest,null,2)+';\n');
  console.log('Finished '+edits.length+' selected clips.');
})().catch(error => { console.error(error); process.exitCode=1; });
