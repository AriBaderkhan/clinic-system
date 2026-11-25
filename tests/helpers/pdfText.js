// Reads the printed text out of a PDF made by pdfmake with the built-in Helvetica font
// (the content streams are zlib-compressed; text is written as <hex> strings).
import zlib from 'zlib';

export function pdfText(buffer) {
    const raw = buffer.toString('latin1');
    const lines = [];
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(raw))) {
        const start = m.index + m[0].length;
        const end = raw.indexOf('endstream', start);
        if (end < 0) break;
        let content;
        try { content = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'); } catch { continue; }
        // one text object = one printed piece
        for (const bt of content.split(/\bBT\b/).slice(1)) {
            const body = bt.split(/\bET\b/)[0];
            const parts = [...body.matchAll(/<([0-9a-fA-F]*)>|\((.*?)\)/g)].map((x) => x[1] !== undefined ? Buffer.from(x[1], 'hex').toString('latin1') : x[2]);
            const text = parts.join('');
            if (text.trim()) lines.push(text);
        }
    }
    return lines;
}
