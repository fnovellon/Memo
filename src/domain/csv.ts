/**
 * Lecteur CSV minimal mais correct sur les guillemets : un champ entre guillemets
 * peut contenir le séparateur, un retour à la ligne, et des guillemets doublés.
 * Un découpage naïf casserait une traduction comme « "Ah!, Oh!" ».
 */
export function parseCsv(content: string, separator = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    // Une ligne vide ne porte aucune donnée.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  const text = content.replace(/\r\n?/g, '\n');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && !started) {
      quoted = true;
      started = true;
    } else if (character === separator) {
      endField();
    } else if (character === '\n') {
      endRow();
    } else {
      field += character;
      started = true;
    }
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}
