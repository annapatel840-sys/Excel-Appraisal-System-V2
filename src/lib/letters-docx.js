
const decodeXml = (value = "") =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

async function openDocxZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);

  let eocd = bytes.length - 22;

  while (
    eocd >= 0 &&
    view.getUint32(eocd, true) !== 0x06054b50
  ) {
    eocd -= 1;
  }

  if (eocd < 0) {
    throw new Error("This is not a valid DOCX file.");
  }

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries = {};

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid DOCX archive.");
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);

    const name = new TextDecoder().decode(
      bytes.subarray(
        offset + 46,
        offset + 46 + nameLength
      )
    );

    entries[name] = {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    };

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    async get(name) {
      const entry = entries[name];

      if (!entry) return null;

      const start =
        entry.localOffset +
        30 +
        view.getUint16(entry.localOffset + 26, true) +
        view.getUint16(entry.localOffset + 28, true);

      const compressed = bytes.subarray(
        start,
        start + entry.compressedSize
      );

      if (entry.method === 0) {
        return compressed;
      }

      if (
        entry.method !== 8 ||
        typeof DecompressionStream === "undefined"
      ) {
        throw new Error(
          "This browser cannot decompress this DOCX file."
        );
      }

      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(
          new DecompressionStream("deflate-raw")
        );

      return new Uint8Array(
        await new Response(stream).arrayBuffer()
      );
    },
  };
}

function paragraphText(paragraph) {
  let text = "";

  const runs =
    paragraph.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];

  runs.forEach((run) => {
    run.replace(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g,
      (match, value) => {
        if (value !== undefined) {
          text += decodeXml(value);
        } else if (match.startsWith("<w:tab")) {
          text += "\t";
        } else {
          text += "\n";
        }

        return match;
      }
    );
  });

  return text;
}

/**
 * Extract readable text from a DOCX file.
 * Preserves paragraph breaks and text-based template tags.
 */
export async function importDocxText(file) {
  if (!file || !/\.docx$/i.test(file.name)) {
    throw new Error(
      "Please choose a .docx Word document."
    );
  }

  const zip = await openDocxZip(file);

  const documentXml = await zip.get(
    "word/document.xml"
  );

  if (!documentXml) {
    throw new Error(
      "The Word document does not contain document.xml."
    );
  }

  const xml = new TextDecoder().decode(documentXml);

  const paragraphs =
    xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];

  const body = paragraphs
    .map(paragraphText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!body) {
    throw new Error(
      "No readable text was found in this Word document."
    );
  }

  return body;
}

/**
 * Reads uploaded logo or signature images.
 */
export function readImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return resolve(null);
    }

    if (!file.type || !file.type.startsWith("image/")) {
      reject(
        new Error("Please choose an image file.")
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name,
        data: String(reader.result || ""),
      });
    };

    reader.onerror = () => {
      reject(
        new Error("The selected image could not be read.")
      );
    };

    reader.readAsDataURL(file);
  });
}
