// Optional authoring tool for regenerating bundled Mandarin narration on macOS.
// Playback in production uses the committed MP3 files and needs no speech service.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const texts = require('../assets/stories/texts.json');
const root = path.resolve(__dirname, '../assets/stories');
if (texts.length !== 100) throw Error('The builtin catalog must contain 100 stories');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'liuyu-narration-'));
try {
  const catalog = texts.map(([title, text], index) => {
    const code = `builtin-${String(index + 1).padStart(3, '0')}`;
    const aiff = path.join(temporary, code + '.aiff');
    const audio = path.join(root, code + '.mp3');
    execFileSync('say', ['-v', 'Tingting', '-r', '190', '-o', aiff, `${title}。${text}`]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-codec:a', 'libmp3lame', '-b:a', '48k', '-ar', '24000', '-ac', '1', audio]);
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audio], { encoding:'utf8' }).trim());
    // MP3 container padding must not require listening beyond the media end.
    return { code, title, text, audio:code + '.mp3', durationMs:Math.floor(seconds * 1000), audioHash:crypto.createHash('sha256').update(fs.readFileSync(audio)).digest('hex') };
  });
  fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Generated ${catalog.length} narrated stories`);
} finally {
  fs.rmSync(temporary, { recursive:true, force:true });
}
