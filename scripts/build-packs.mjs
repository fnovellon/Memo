// Fabrique les packs thématiques servis par l'écran « Packs ».
//
// Aucun mot n'est classé à la main : les thèmes viennent des fichiers
// lexicographiques d'Open English WordNet, les traductions du dictionnaire
// anglais-français de FreeDict, et l'ordre des listes de fréquence OpenSubtitles.
// Un mot n'est retenu que s'il est présent dans les trois.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = '/tmp/memo-pack-cache';
const OUT = 'public/packs';
const MAX_PER_THEME = 150;

const WORDNET = 'https://raw.githubusercontent.com/globalwordnet/english-wordnet/main/src/yaml';
const FREEDICT = 'https://raw.githubusercontent.com/freedict/fd-dictionaries/master/eng-fra/eng-fra.tei';
const FREQUENCY = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';

/**
 * Tous les domaines de WordNet. On a besoin du décompte complet des sens d'un mot,
 * pas seulement de ceux du thème visé : sans cela « must » entre dans Nourriture
 * parce qu'un de ses sens désigne le moût de raisin.
 */
const ALL_LEXNAMES = [
  'noun.Tops', 'noun.act', 'noun.animal', 'noun.artifact', 'noun.attribute', 'noun.body',
  'noun.cognition', 'noun.communication', 'noun.event', 'noun.feeling', 'noun.food',
  'noun.group', 'noun.location', 'noun.motive', 'noun.object', 'noun.person',
  'noun.phenomenon', 'noun.plant', 'noun.possession', 'noun.process', 'noun.quantity',
  'noun.relation', 'noun.shape', 'noun.state', 'noun.substance', 'noun.time',
  'verb.body', 'verb.change', 'verb.cognition', 'verb.communication', 'verb.competition',
  'verb.consumption', 'verb.contact', 'verb.creation', 'verb.emotion', 'verb.motion',
  'verb.perception', 'verb.possession', 'verb.social', 'verb.stative', 'verb.weather',
  // Les domaines adjectivaux et adverbiaux ne fournissent aucun thème, mais leur
  // absence du décompte ferait passer « quick » ou « entire » pour des noms
  // thématiques, leur unique sens nominal dominant alors à 100 %.
  'adj.all', 'adj.pert', 'adj.ppl', 'adv.all',
];

/**
 * Part minimale des sens d'un mot devant appartenir au thème pour qu'il y soit
 * retenu. À 60 %, « water » reste dans Nourriture mais « heart » en sort.
 */
const DOMINANCE = 0.6;
/** Au-delà, le mot est trop polysémique pour appartenir vraiment à un thème. */
const MAX_SENSES = 6;

/** Domaines WordNet retenus, avec leur nom français. */
const THEMES = [
  { lex: 'noun.food', id: 'food', title: 'Nourriture' },
  { lex: 'noun.animal', id: 'animal', title: 'Animaux' },
  { lex: 'noun.body', id: 'body', title: 'Corps humain' },
  { lex: 'noun.artifact', id: 'artifact', title: 'Objets du quotidien' },
  { lex: 'noun.person', id: 'person', title: 'Gens et métiers' },
  { lex: 'noun.plant', id: 'plant', title: 'Plantes' },
  { lex: 'noun.location', id: 'location', title: 'Lieux' },
  { lex: 'noun.time', id: 'time', title: 'Temps et calendrier' },
  { lex: 'noun.feeling', id: 'feeling', title: 'Émotions' },
  { lex: 'verb.motion', id: 'motion', title: 'Verbes de mouvement' },
  { lex: 'verb.communication', id: 'communication', title: 'Verbes de parole' },
];

async function fetchCached(url, name) {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, name);
  if (existsSync(path)) return readFileSync(path, 'utf8');
  process.stdout.write(`  téléchargement ${name}… `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  const text = await response.text();
  writeFileSync(path, text);
  console.log(`${Math.round(text.length / 1024)} Ko`);
  return text;
}

/** Compte les sens de chaque lemme dans un fichier : un lemme peut y figurer plusieurs fois. */
function countSenses(yaml) {
  const counts = new Map();
  for (const lemma of readMemberList(yaml)) {
    counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
  }
  return counts;
}

/** Ne garde que les listes `members:` des fichiers WordNet. */
function readMemberList(yaml) {
  const members = [];
  let key = null;
  for (const line of yaml.split('\n')) {
    const section = /^ {2}(\w+):\s*$/.exec(line);
    if (section) {
      key = section[1];
      continue;
    }
    if (/^ {2}\w+:\s+\S/.test(line)) {
      key = null;
      continue;
    }
    const item = /^ {2}- (.+)$/.exec(line);
    if (item && key === 'members') members.push(item[1].trim().toLowerCase());
    else if (!item && /^\S/.test(line)) key = null;
  }
  return members;
}

/** Associe chaque entrée anglaise à ses traductions françaises, dans l'ordre du dictionnaire. */
function readDictionary(tei) {
  const dictionary = new Map();
  for (const [, block] of tei.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const orth = /<orth>([^<]+)<\/orth>/.exec(block)?.[1]?.trim().toLowerCase();
    if (!orth) continue;
    const quotes = [...block.matchAll(/<quote>([^<]+)<\/quote>/g)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    if (quotes.length === 0) continue;
    const existing = dictionary.get(orth) ?? [];
    dictionary.set(orth, [...existing, ...quotes]);
  }
  return dictionary;
}

function readFrequency(text) {
  const ranks = new Map();
  let rank = 0;
  for (const line of text.split('\n')) {
    const word = line.split(' ')[0]?.trim().toLowerCase();
    if (!word) continue;
    rank += 1;
    if (!ranks.has(word)) ranks.set(word, rank);
  }
  return ranks;
}

const WORDNET_CREDIT =
  'Thèmes : Open English WordNet (CC BY 4.0), dérivé de Princeton WordNet.';
const FREEDICT_CREDIT = 'Traductions : dictionnaire anglais-français FreeDict (GPL v2+).';
const FREQUENCY_CREDIT = 'Ordre : listes de fréquence OpenSubtitles, hermitdave (CC BY-SA 4.0).';

/** Decks ouverts recensés, téléchargés depuis leur dépôt au moment de l'installation. */
const REMOTE_PACKS = [
  ...[5, 4, 3, 2, 1].map((level) => ({
    id: `ja-jlpt-n${level}`,
    title: `Japonais — JLPT N${level}`,
    lang: 'ja',
    glossLang: 'en',
    theme: `JLPT N${level}`,
    remote: `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n${level}.csv`,
    format: 'csv',
    columns: { term: 0, reading: 1, translation: 2 },
    skipHeader: true,
    license: 'MIT',
    attribution: 'open-anki-jlpt-decks, Jamie Sinclair (MIT).',
  })),
];

async function main() {
  console.log('Sources :');
  const [tei, frequencyText] = await Promise.all([
    fetchCached(FREEDICT, 'eng-fra.tei'),
    fetchCached(FREQUENCY, 'en_50k.txt'),
  ]);

  const dictionary = readDictionary(tei);
  const ranks = readFrequency(frequencyText);
  console.log(`  ${dictionary.size} entrées de dictionnaire, ${ranks.size} rangs de fréquence`);

  mkdirSync(OUT, { recursive: true });
  const index = [];

  // Décompte global des sens, tous domaines confondus.
  console.log('Lecture des domaines WordNet :');
  const sensesByTheme = new Map();
  const totalSenses = new Map();
  for (const lex of ALL_LEXNAMES) {
    const yaml = await fetchCached(`${WORDNET}/${lex}.yaml`, `${lex}.yaml`);
    const counts = countSenses(yaml);
    sensesByTheme.set(lex, counts);
    for (const [lemma, count] of counts) {
      totalSenses.set(lemma, (totalSenses.get(lemma) ?? 0) + count);
    }
  }
  console.log(`  ${totalSenses.size} lemmes, ${ALL_LEXNAMES.length} domaines`);

  for (const theme of THEMES) {
    const counts = sensesByTheme.get(theme.lex);

    const entries = [...counts.keys()]
      .filter((lemma) => dictionary.has(lemma))
      .filter((lemma) => {
        const total = totalSenses.get(lemma) ?? 0;
        if (total === 0 || total > MAX_SENSES) return false;
        // Le mot doit appartenir au thème par l'essentiel de ses sens, sinon il
        // n'est thématique que par accident.
        return counts.get(lemma) / total >= DOMINANCE;
      })
      .map((lemma) => ({ lemma, rank: ranks.get(lemma) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_PER_THEME)
      .map(({ lemma }) => ({
        term: lemma,
        // Trois traductions au plus : le mode écriture les accepte toutes, mais
        // au-delà la carte devient illisible.
        translation: [...new Set(dictionary.get(lemma))].slice(0, 3).join(', '),
      }));

    if (entries.length < 20) {
      console.log(`  ${theme.lex} : ${entries.length} mots seulement, thème écarté`);
      continue;
    }

    const pack = {
      id: `en-${theme.id}`,
      title: `Anglais — ${theme.title}`,
      lang: 'en',
      glossLang: 'fr',
      theme: theme.title,
      count: entries.length,
      license: 'CC BY 4.0 · GPL v2+ · CC BY-SA 4.0',
      attribution: `${WORDNET_CREDIT} ${FREEDICT_CREDIT} ${FREQUENCY_CREDIT}`,
      entries,
    };

    writeFileSync(join(OUT, `${pack.id}.json`), JSON.stringify(pack));
    index.push({
      id: pack.id, title: pack.title, lang: pack.lang, glossLang: pack.glossLang,
      theme: pack.theme, count: pack.count, license: pack.license,
      attribution: pack.attribution, file: `${pack.id}.json`,
    });
    console.log(`  ${pack.title} : ${entries.length} mots`);
  }

  index.push(...REMOTE_PACKS);
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ packs: index }, null, 2));
  console.log(`\n${index.length} packs dans le catalogue.`);
}

await main();
