const decodeXml = (value = "") =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const xmlText = (bytes) => new TextDecoder().decode(bytes || new Uint8Array());

async function openDocxArchive(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("The selected file is not a valid DOCX document.");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = {};
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The Word document archive is invalid.");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries[name] = {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    };
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    names: Object.keys(entries),
    async get(name) {
      const entry = entries[name];
      if (!entry) return null;
      const start = entry.localOffset + 30
        + view.getUint16(entry.localOffset + 26, true)
        + view.getUint16(entry.localOffset + 28, true);
      const compressed = bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return compressed;
      if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
        throw new Error("This browser does not support DOCX compression used by this file.");
      }
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
  };
}

function getRelationships(xmlBytes, basePath = "word/") {
  const result = {};
  const xml = xmlText(xmlBytes);
  (xml.match(/<Relationship\b[^>]*>/g) || []).forEach((tag) => {
    const id = (tag.match(/\bId="([^"]+)"/) || [])[1];
    const target = (tag.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) result[id] = target.startsWith("/") ? target.slice(1) : basePath + target.replace(/^\.\//, "");
  });
  return result;
}

function runText(run) {
  let value = "";
  (run.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\s*\/>|<w:br\s*\/?\s*>/g) || []).forEach((part) => {
    if (part.startsWith("<w:t")) {
      const decoded = decodeXml(part.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, ""));
      value += decoded.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    else if (part.startsWith("<w:tab")) value += "    ";
    else value += "<br>";
  });
  return value;
}

function docxXmlToHtml(xml, signatureRelationshipId) {
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  return paragraphs.map((paragraph) => {
    const align = (paragraph.match(/<w:jc\s+w:val="([^"]+)"/) || [])[1];
    const hasDrawing = /<w:drawing|<w:pict/.test(paragraph);
    let isSignature = false;
    if (hasDrawing && signatureRelationshipId) {
      isSignature = new RegExp('r:(?:embed|id)="' + signatureRelationshipId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"').test(paragraph);
    }
    let html = "";
    (paragraph.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || []).forEach((run) => {
      let content = runText(run);
      if (!content) return;
      if (/ <w:b\s*\/>|<w:b\s*\/>|<w:b\s+w:val="(?:1|true)"/.test(run)) content = `<strong>${content}</strong>`;
      if (/<w:i\s*\/>|<w:i\s+w:val="(?:1|true)"/.test(run)) content = `<em>${content}</em>`;
      if (/<w:u\s+w:val="(?!none)[^"]*"/.test(run) || /<w:u\s*\/>/.test(run)) content = `<u>${content}</u>`;
      const color = (run.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/) || [])[1];
      if (color) content = `<span style="color:#${color}">${content}</span>`;
      html += content;
    });
    if (hasDrawing && !html && !isSignature) return "";
    if (isSignature && !html.includes("{{Signature}}")) html += "{{Signature}}";
    const style = align === "center" || align === "right" || align === "both" ? ` style="text-align:${align === "both" ? "justify" : align}"` : "";
    return `<p${style}>${html || "<br>"}</p>`;
  }).filter(Boolean).join("");
}

function bytesToDataUrl(bytes, path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" }[ext];
  if (!mime) return null;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: path.split("/").pop(), data: `data:${mime};base64,${btoa(binary)}` };
}

async function extractDocxImages(zip, documentXml) {
  const documentRels = getRelationships(await zip.get("word/_rels/document.xml.rels"));
  const paragraphs = documentXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  const drawings = [];
  paragraphs.forEach((paragraph, index) => {
    if (!/<w:drawing|<w:pict/.test(paragraph)) return;
    paragraph.replace(/r:(?:embed|id)="([^"]+)"/g, (_match, id) => {
      if (documentRels[id] && /media\//.test(documentRels[id])) drawings.push({ index, id, path: documentRels[id] });
      return _match;
    });
  });

  let logoPath = null;
  const headers = zip.names.filter((name) => /^word\/header\d*\.xml$/.test(name)).sort();
  for (const header of headers) {
    if (logoPath) break;
    const headerXml = await zip.get(header);
    const relPath = `word/_rels/${header.split("/").pop()}.rels`;
    const headerRels = getRelationships(await zip.get(relPath));
    const headerText = xmlText(headerXml);
    headerText.replace(/r:(?:embed|id)="([^"]+)"/g, (_match, id) => {
      if (!logoPath && headerRels[id] && /media\//.test(headerRels[id])) logoPath = headerRels[id];
      return _match;
    });
  }

  const bodyImages = drawings.filter((item) => item.path !== logoPath);
  let signature = null;
  if (!logoPath && bodyImages.length >= 2) logoPath = bodyImages[0].path;
  if (bodyImages.length) signature = bodyImages[bodyImages.length - 1];
  if (!logoPath && bodyImages.length === 1) {
    if (bodyImages[0].index <= paragraphs.length * 0.25) logoPath = bodyImages[0].path;
    else signature = bodyImages[0];
  }

  const logoBytes = logoPath ? await zip.get(logoPath) : null;
  const signatureBytes = signature ? await zip.get(signature.path) : null;
  return {
    logo: logoBytes ? bytesToDataUrl(logoBytes, logoPath) : null,
    signature: signatureBytes ? bytesToDataUrl(signatureBytes, signature.path) : null,
    signatureRelationshipId: signature ? signature.id : null,
  };
}

/** Import text, basic formatting, and detectable logo/signature images from a DOCX. */
export async function importDocxDocument(file) {
  if (!file || !/\.docx$/i.test(file.name)) throw new Error("Please choose a .docx Word document.");
  const zip = await openDocxArchive(file);
  const documentBytes = await zip.get("word/document.xml");
  if (!documentBytes) throw new Error("The Word document does not contain document.xml.");
  const xml = xmlText(documentBytes);
  const images = await extractDocxImages(zip, xml);
  const html = docxXmlToHtml(xml, images.signatureRelationshipId);
  const text = html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("No readable text was found in this Word document.");
  return { html, text, logo: images.logo, signature: images.signature };
}

export function readImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type || !file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result || "") });
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}
