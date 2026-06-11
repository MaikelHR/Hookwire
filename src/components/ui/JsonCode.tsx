import type { ReactNode } from 'react';
import type { JsonObject } from '../../lib/data-service';

/* Syntax highlight del payload: keys accent, strings amber, números azules,
   booleans/null rojos, puntuación faint (los colores están en index.css, clase .hw-code). */
export function JsonCode({ obj }: { obj: JsonObject }) {
  const json = JSON.stringify(obj, null, 2);
  const nodes: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={k++} className="jp">
          {json.slice(last, m.index)}
        </span>,
      );
    }
    const [full, str, colon, keyword] = m;
    if (str !== undefined) {
      nodes.push(
        <span key={k++} className={colon ? 'jk' : 'js'}>
          {str}
        </span>,
      );
      if (colon) {
        nodes.push(
          <span key={k++} className="jp">
            {colon}
          </span>,
        );
      }
    } else if (keyword !== undefined) {
      nodes.push(
        <span key={k++} className="jb">
          {keyword}
        </span>,
      );
    } else {
      nodes.push(
        <span key={k++} className="jn">
          {full}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < json.length) {
    nodes.push(
      <span key={k++} className="jp">
        {json.slice(last)}
      </span>,
    );
  }
  return (
    <pre className="hw-code bg-inset border border-line rounded-ctl px-3.5 py-3 font-mono text-[11.5px] leading-[1.6] overflow-x-auto whitespace-pre m-0">
      {nodes}
    </pre>
  );
}
