/**
 * Splits a letter body into reader pages.
 *
 * Packing strategy: whole paragraphs first (split on blank lines); a
 * paragraph that alone exceeds the budget is packed word by word; a
 * single word longer than the budget is hard-split so pagination can
 * never stall. Short bodies return a single page unchanged, so most
 * letters see no pagination UI at all.
 */
export function paginateLetterBody(body: string, charsPerPage = 600): string[] {
  if (!body) return [""];
  if (body.length <= charsPerPage) return [body];

  const paragraphs = body.split(/\n{2,}/);
  const pages: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      pages.push(current);
      current = "";
    }
  };

  const packWords = (text: string) => {
    const words = text.split(/(?<=\s)/).filter((w) => w.length > 0);
    for (const word of words) {
      if (word.length > charsPerPage) {
        // Hard-split an over-long token (long URL, unbroken string).
        let rest = word;
        while (rest.length > charsPerPage) {
          const room = charsPerPage - current.length;
          if (room <= 0) {
            flush();
            continue;
          }
          current += rest.slice(0, room);
          rest = rest.slice(room);
          flush();
        }
        current += rest;
        continue;
      }
      if (current.length + word.length > charsPerPage && current.trim()) {
        flush();
      }
      current += word;
    }
  };

  for (const para of paragraphs) {
    const piece = current ? `\n\n${para}` : para;
    if (current.length + piece.length <= charsPerPage) {
      current += piece;
    } else if (para.length <= charsPerPage) {
      flush();
      current = para;
    } else {
      // Long paragraph: top up the current page, then keep packing.
      if (current) {
        current += "\n\n";
        if (current.length >= charsPerPage) flush();
      }
      packWords(para);
    }
  }
  flush();

  return pages.length > 0 ? pages : [body];
}
