import { deflateRawSync } from "node:zlib";

/**
 * A minimal XLSX writer — real Excel files, no dependency.
 *
 * Why not a library: the two obvious candidates are a deprecated package with
 * open advisories and a 10 MB one, to emit a handful of tables. An .xlsx is a
 * ZIP of five small XML parts, and the subset we need (one sheet per report,
 * text and numbers, a bold header row, currency and date formats) is fully
 * specified below.
 *
 * Why not CSV: Polish Excel opens a comma-separated UTF-8 file as one column
 * unless the user goes through the import wizard, and a "raport.csv" that looks
 * broken on the operator's machine is not an export.
 *
 * Deliberately NOT supported: formulas, multiple fonts, merged cells, images.
 * If a report ever needs those, that is the moment to reach for a library —
 * not the moment to grow this file.
 */

export type CellValue = string | number | null | undefined;

export type Column = {
  header: string;
  /** Width in Excel's character units. */
  width?: number;
  /** How the cell is formatted; drives the numFmt applied to the column. */
  format?: "text" | "number" | "money" | "percent" | "date";
};

export type Sheet = {
  /** Excel forbids : \\ / ? * [ ] and caps the name at 31 characters. */
  name: string;
  columns: Column[];
  rows: CellValue[][];
};

/* ── XML helpers ──────────────────────────────────────────────────────────── */

/**
 * Escape for XML *and* strip the control characters XML 1.0 forbids.
 *
 * Excel rejects the whole workbook — with no useful message — if a single stray
 * control byte reaches the sheet, and admin-entered notes are exactly where one
 * arrives from a paste.
 */
function xml(value: string): string {
  return (
    value
      // Written as escape sequences, never as literal bytes: a regex holding
      // raw control characters is invisible in an editor and one careless
      // copy-paste silently turns the guard off.

      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** Column index → Excel's letters: 0 → A, 26 → AA. */
function colName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Style ids, matching the order of `cellXfs` in `styles.xml` below.
 * 0 = plain, 1 = bold header, 2 = money, 3 = percent, 4 = date, 5 = integer.
 */
const STYLE = {
  plain: 0,
  header: 1,
  money: 2,
  percent: 3,
  date: 4,
  number: 5,
} as const;

const STYLE_FOR: Record<NonNullable<Column["format"]>, number> = {
  text: STYLE.plain,
  number: STYLE.number,
  money: STYLE.money,
  percent: STYLE.percent,
  date: STYLE.date,
};

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="#,##0.00&quot; zł&quot;"/>
<numFmt numFmtId="165" formatCode="0%"/>
<numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`,
    )
    .join("");

  const header = `<row r="1">${sheet.columns
    .map(
      (c, i) =>
        `<c r="${colName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${xml(c.header)}</t></is></c>`,
    )
    .join("")}</row>`;

  const body = sheet.rows
    .map((row, ri) => {
      const cells = row
        .map((value, ci) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = `${colName(ci)}${ri + 2}`;
          const fmt = sheet.columns[ci]?.format ?? "text";
          const style = STYLE_FOR[fmt];
          // Numbers go in as numbers. A money column holding "1 234 zł" as text
          // is the single most common way an export becomes unusable: it cannot
          // be summed, sorted or charted on the other side.
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" s="${fmt === "date" ? STYLE.plain : style}" t="inlineStr"><is><t>${xml(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 2}">${cells}</row>`;
    })
    .join("");

  const lastCol = colName(Math.max(0, sheet.columns.length - 1));
  const lastRow = sheet.rows.length + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
}

/** Excel refuses a workbook whose sheet name breaks these rules. */
function safeSheetName(name: string, index: number): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, "-")
    .slice(0, 31)
    .trim();
  return cleaned || `Arkusz${index + 1}`;
}

/* ── ZIP container ────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Buffer };

/**
 * Build a ZIP archive.
 *
 * Every entry is deflated and stamped with a FIXED timestamp rather than the
 * current clock: two exports of unchanged data then produce byte-identical
 * files, which makes the output diffable and testable. Excel does not care what
 * the timestamp says.
 */
function zip(entries: ZipEntry[]): Buffer {
  const DOS_TIME = 0; // 1980-01-01 00:00
  const DOS_DATE = 0x21;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42); // local header offset, filled below
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/** Build an .xlsx workbook from one or more sheets. */
export function buildXlsx(sheets: Sheet[]): Buffer {
  const named = sheets.map((s, i) => ({
    ...s,
    name: safeSheetName(s.name, i),
  }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${named.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const utf8 = (s: string) => Buffer.from(s, "utf8");

  return zip([
    { name: "[Content_Types].xml", data: utf8(contentTypes) },
    { name: "_rels/.rels", data: utf8(rootRels) },
    { name: "xl/workbook.xml", data: utf8(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(workbookRels) },
    { name: "xl/styles.xml", data: utf8(stylesXml()) },
    ...named.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(sheetXml(s)),
    })),
  ]);
}

/** Grosze → the złoty amount Excel should store, as a real number. */
export const zl = (grosze: number) => Math.round(grosze) / 100;
