import { describe, expect, it } from 'vitest';
import {
  ANKI_QUEUE_SUSPENDED,
  ANKI_TYPE,
  convertSchedule,
  extractImageName,
  guessMapping,
  isCloze,
  parseMediaJson,
  parseMediaProtobuf,
  parseTextNotes,
  prepareNotes,
  splitFields,
  toPlainText,
  type AnkiCardRow,
} from './anki';
import { DEFAULT_EASE, MIN_EASE } from './scheduler';

const NOW = Date.UTC(2026, 8, 20, 10, 0, 0);
/** Collection créée le 1er janvier 2020, en secondes. */
const CRT = Math.floor(Date.UTC(2020, 0, 1) / 1000);

function ankiCard(overrides: Partial<AnkiCardRow> = {}): AnkiCardRow {
  return {
    id: 1, nid: 1, ord: 0, type: ANKI_TYPE.review, queue: 2,
    due: 0, ivl: 10, factor: 2500, reps: 5, lapses: 1,
    ...overrides,
  };
}

describe('champs d’une note', () => {
  it('sépare les champs sur le caractère d’Anki', () => {
    expect(splitFields('chat\u001fcat\u001fねこ')).toEqual(['chat', 'cat', 'ねこ']);
  });
});

describe('nettoyage d’un champ', () => {
  it('retire le HTML et normalise les espaces', () => {
    expect(toPlainText('<div>le <b>chat</b><br>roux</div>')).toBe('le chat roux');
  });

  it('décode les entités, nommées comme numériques', () => {
    expect(toPlainText('caf&eacute;&nbsp;noir')).toBe('café noir');
    expect(toPlainText('l&#39;&#xe9;t&#233;')).toBe("l'été");
    expect(toPlainText('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('décode aussi les accents en capitale et la ponctuation typographique', () => {
    expect(toPlainText('&Eacute;t&eacute; &laquo;&nbsp;chaud&nbsp;&raquo;')).toBe('Été « chaud »');
    expect(toPlainText('gro&szlig;&nbsp;&ndash; sch&ouml;n')).toBe('groß – schön');
  });

  it('supprime les références de son', () => {
    expect(toPlainText('neko [sound:neko.mp3]')).toBe('neko');
  });

  it('ne laisse pas de balise image dans le texte', () => {
    expect(toPlainText('chat <img src="cat.jpg">')).toBe('chat');
  });
});

describe('image d’une note', () => {
  it('retrouve le nom du fichier', () => {
    expect(extractImageName('<img src="paysage_01.jpg" alt="x">')).toBe('paysage_01.jpg');
    expect(extractImageName("<img src='a b.png'>")).toBe('a');
  });

  it('ignore une image distante, absente du paquet', () => {
    expect(extractImageName('<img src="https://exemple.org/a.jpg">')).toBeNull();
  });

  it('renvoie null quand il n’y a pas d’image', () => {
    expect(extractImageName('juste du texte')).toBeNull();
  });
});

describe('notes à trous', () => {
  it('les reconnaît', () => {
    expect(isCloze('Le {{c1::chat}} dort')).toBe(true);
    expect(isCloze('Le chat dort')).toBe(false);
  });
});

describe('reprise du planning Anki', () => {
  it('convertit intervalle, facilité, répétitions et oublis', () => {
    const schedule = convertSchedule(ankiCard({ ivl: 240, factor: 2300, reps: 12, lapses: 3 }), CRT, NOW);
    expect(schedule.state).toBe('review');
    expect(schedule.interval).toBe(240);
    expect(schedule.ease).toBeCloseTo(2.3, 10);
    expect(schedule.repetitions).toBe(12);
    expect(schedule.lapses).toBe(3);
  });

  it('place l’échéance en comptant les jours depuis la création de la collection', () => {
    // 2192 jours après le 1er janvier 2020 : le 1er janvier 2026.
    const days = Math.round((Date.UTC(2026, 0, 1) - Date.UTC(2020, 0, 1)) / 86_400_000);
    const schedule = convertSchedule(ankiCard({ due: days }), CRT, NOW);
    expect(new Date(schedule.due).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('ramène à aujourd’hui une échéance aberrante', () => {
    expect(convertSchedule(ankiCard({ due: 9_000_000 }), CRT, NOW).due).toBe(NOW);
    expect(convertSchedule(ankiCard({ due: -9_000_000 }), CRT, NOW).due).toBe(NOW);
  });

  it('ne descend pas sous la facilité plancher', () => {
    expect(convertSchedule(ankiCard({ factor: 900 }), CRT, NOW).ease).toBe(MIN_EASE);
  });

  it('retient la facilité par défaut quand Anki n’en a pas', () => {
    expect(convertSchedule(ankiCard({ factor: 0 }), CRT, NOW).ease).toBe(DEFAULT_EASE);
  });

  it('traite les cartes neuves et en apprentissage comme neuves', () => {
    for (const type of [ANKI_TYPE.new, ANKI_TYPE.learning]) {
      const schedule = convertSchedule(ankiCard({ type, ivl: 0 }), CRT, NOW);
      expect(schedule.state).toBe('new');
      expect(schedule.due).toBe(NOW);
      expect(schedule.interval).toBe(0);
    }
  });

  it('reprend une carte en ré-apprentissage qui a gardé un intervalle', () => {
    expect(convertSchedule(ankiCard({ type: ANKI_TYPE.relearning, ivl: 5 }), CRT, NOW).state).toBe(
      'review',
    );
  });

  it('conserve l’état suspendu', () => {
    expect(convertSchedule(ankiCard({ queue: ANKI_QUEUE_SUSPENDED }), CRT, NOW).suspended).toBe(true);
    expect(convertSchedule(ankiCard(), CRT, NOW).suspended).toBe(false);
  });
});

describe('export texte', () => {
  it('lit un fichier tabulé avec son en-tête', () => {
    const parsed = parseTextNotes(
      '#separator:tab\n#html:true\n#columns:Front\tBack\nchat\tcat\nchien\tdog\n',
    );
    expect(parsed.separator).toBe('\t');
    expect(parsed.columns).toEqual(['Front', 'Back']);
    expect(parsed.rows).toEqual([['chat', 'cat'], ['chien', 'dog']]);
  });

  it('devine le séparateur quand il n’est pas déclaré', () => {
    expect(parseTextNotes('chat;cat\nchien;dog').separator).toBe(';');
    expect(parseTextNotes('chat\tcat\nchien\tdog').separator).toBe('\t');
  });

  it('nomme les colonnes à défaut de déclaration', () => {
    expect(parseTextNotes('chat\tcat').columns).toEqual(['Colonne 1', 'Colonne 2']);
  });

  it('ignore les lignes vides et les commentaires', () => {
    expect(parseTextNotes('#deck:Test\n\nchat\tcat\n\n').rows).toHaveLength(1);
  });
});

describe('correspondance devinée', () => {
  it('s’appuie sur les noms de champs habituels', () => {
    expect(guessMapping(['Front', 'Back'])).toEqual({ term: 0, translation: 1, reading: null });
    expect(guessMapping(['Traduction', 'Mot', 'Lecture'])).toEqual({
      term: 1, translation: 0, reading: 2,
    });
  });

  it('se rabat sur les deux premières colonnes sans indice', () => {
    expect(guessMapping(['Colonne 1', 'Colonne 2'])).toEqual({
      term: 0, translation: 1, reading: null,
    });
  });
});

describe('préparation des notes', () => {
  const mapping = { term: 0, translation: 1, reading: 2 };

  it('retient les notes exploitables et nettoie leurs champs', () => {
    const result = prepareNotes(
      [{ id: 1, fields: ['<b>neko</b>', 'chat [sound:x.mp3]', 'ねこ'] }],
      mapping,
      new Set(),
    );
    expect(result.notes).toEqual([
      { term: 'neko', translation: 'chat', reading: 'ねこ', sourceId: 1 },
    ]);
  });

  it('écarte les notes vides, à trous et déjà connues, en les comptant', () => {
    const result = prepareNotes(
      [
        { id: 1, fields: ['chat', 'cat', ''] },
        { id: 2, fields: ['', 'vide', ''] },
        { id: 3, fields: ['Le {{c1::chat}}', 'x', ''] },
        { id: 4, fields: ['CHAT', 'doublon interne', ''] },
        { id: 5, fields: ['chien', 'dog', ''] },
      ],
      mapping,
      new Set(['chien']),
    );
    expect(result.notes.map((note) => note.term)).toEqual(['chat']);
    expect(result.skipped).toEqual({ empty: 1, cloze: 1, duplicate: 2 });
  });

  it('rattache l’image trouvée dans l’un ou l’autre champ', () => {
    const result = prepareNotes(
      [{ id: 1, fields: ['chat', 'cat <img src="cat.jpg">', ''] }],
      mapping,
      new Set(),
    );
    expect(result.notes[0]?.imageName).toBe('cat.jpg');
  });
});

describe('index des médias', () => {
  it('lit la table JSON des paquets classiques', () => {
    const map = parseMediaJson('{"0":"chat.jpg","1":"chien.mp3"}');
    expect(map.get('chat.jpg')).toBe('0');
    expect(map.get('chien.mp3')).toBe('1');
  });

  it('rend une table vide plutôt que d’échouer sur un contenu illisible', () => {
    expect(parseMediaJson('pas du json').size).toBe(0);
    expect(parseMediaJson('[1,2,3]').size).toBe(0);
  });

  it('lit la table protobuf des paquets récents', () => {
    // MediaEntries{ entries: [ {name:"chat.jpg"}, {name:"vue.png"} ] }
    const entry = (name: string) => {
      const bytes = new TextEncoder().encode(name);
      const inner = [0x0a, bytes.length, ...bytes];
      return [0x0a, inner.length, ...inner];
    };
    const payload = new Uint8Array([...entry('chat.jpg'), ...entry('vue.png')]);

    const map = parseMediaProtobuf(payload);
    expect(map.get('chat.jpg')).toBe('0');
    expect(map.get('vue.png')).toBe('1');
  });

  it('s’arrête proprement sur un protobuf tronqué', () => {
    expect(parseMediaProtobuf(new Uint8Array([0x0a, 0x40, 0x01])).size).toBe(0);
  });
});
