const rows = [
  ['a','あいうえお','a i u e o','あ行'], ['k','かきくけこ','ka ki ku ke ko','か行'], ['s','さしすせそ','sa shi su se so','さ行'],
  ['t','たちつてと','ta chi tsu te to','た行'], ['n','なにぬねの','na ni nu ne no','な行'], ['h','はひふへほ','ha hi fu he ho','は行'],
  ['m','まみむめも','ma mi mu me mo','ま行'], ['y','やゆよ','ya yu yo','や行'], ['r','らりるれろ','ra ri ru re ro','ら行'], ['w','わをん','wa wo n','わ行・ん'],
  ['g','がぎぐげご','ga gi gu ge go','が行'], ['z','ざじずぜぞ','za ji zu ze zo','ざ行'], ['d','だぢづでど','da ji zu de do','だ行'], ['b','ばびぶべぼ','ba bi bu be bo','ば行'], ['p','ぱぴぷぺぽ','pa pi pu pe po','ぱ行'],
];
const yoon = [['ky','きゃ きゅ きょ','kya kyu kyo'],['sh','しゃ しゅ しょ','sha shu sho'],['ch','ちゃ ちゅ ちょ','cha chu cho'],['ny','にゃ にゅ にょ','nya nyu nyo'],['hy','ひゃ ひゅ ひょ','hya hyu hyo'],['my','みゃ みゅ みょ','mya myu myo'],['ry','りゃ りゅ りょ','rya ryu ryo'],['gy','ぎゃ ぎゅ ぎょ','gya gyu gyo'],['j','じゃ じゅ じょ','ja ju jo'],['by','びゃ びゅ びょ','bya byu byo'],['py','ぴゃ ぴゅ ぴょ','pya pyu pyo']];
export const KANA_ROWS = [...rows.map(([id,text,roman,label], i) => ({id, label, group: i < 10 ? '清音' : '浊音・半浊音', chars: [...text], roman: roman.split(' ')})), ...yoon.map(([id,text,roman]) => ({id,label:text.replaceAll(' ','・'),group:'拗音',chars:text.split(' '),roman:roman.split(' ')}))];
const katakana = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
export function kanaWords(selectedRows, script = 'hiragana') {
  return KANA_ROWS.filter(row => selectedRows.includes(row.id)).flatMap(row => row.chars.flatMap((c, i) => {
    const scripts = script === 'both' ? ['hiragana','katakana'] : [script];
    return scripts.map(type => ({id:`kana-${row.id}-${i}-${type}`,lessonId:'kana',word:type==='katakana'?katakana(c):c,reading:c,romaji:row.roman[i],meaning:row.roman[i],list:1,pos:'假名',kana:true,row:row.label,script:type,example: null}));
  }));
}
export const kanaKatakana = katakana;
