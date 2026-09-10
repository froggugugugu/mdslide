import { readFileSync } from "node:fs";
import JSZip from "jszip";

/** A 1x1 red PNG. */
export const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

/**
 * The sample master with decorations a real corporate master would have, injected as OOXML:
 *  - master: an accent bar across the top, a logo picture bottom-right, a grey "CONFIDENTIAL" text box bottom-left,
 *    and a two-shape group (used to check group transforms)
 *  - Cover layout: dark solid background, white left-aligned title
 *  - Section layout: showMasterSp="0" (master shapes hidden)
 */
export async function decoratedMaster(): Promise<Blob> {
  const zip = await JSZip.loadAsync(readFileSync("examples/sample-master.pptx"));
  const masterPath = "ppt/slideMasters/slideMaster1.xml";
  let master = await zip.file(masterPath)!.async("string");
  const decor = `
<p:sp><p:nvSpPr><p:cNvPr id="90" name="Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="228600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="91" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="10668000" y="6096000"/><a:ext cx="1219200" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>
<p:sp><p:nvSpPr><p:cNvPr id="92" name="Conf"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="304800" y="6248400"/><a:ext cx="3048000" cy="304800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="900" b="1"><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:rPr><a:t>CONFIDENTIAL &amp; INTERNAL</a:t></a:r></a:p></p:txBody></p:sp>
<p:grpSp><p:nvGrpSpPr><p:cNvPr id="93" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="6096000" y="3048000"/><a:ext cx="2000000" cy="1000000"/><a:chOff x="0" y="0"/><a:chExt cx="1000000" cy="500000"/></a:xfrm></p:grpSpPr>
  <p:sp><p:nvSpPr><p:cNvPr id="94" name="Dot"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="250000"/><a:ext cx="500000" cy="250000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill></p:spPr></p:sp>
</p:grpSp>`;
  master = master.replace("</p:spTree>", `${decor}</p:spTree>`);
  zip.file(masterPath, master);
  const relsPath = "ppt/slideMasters/_rels/slideMaster1.xml.rels";
  const rels = await zip.file(relsPath)!.async("string");
  zip.file(relsPath, rels.replace("</Relationships>", `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo-test.png"/></Relationships>`));
  zip.file("ppt/media/logo-test.png", PNG_1x1, { base64: true });

  for (const f of Object.keys(zip.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n))) {
    let xml = await zip.file(f)!.async("string");
    const name = xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)?.[1];
    if (name === "Cover") {
      xml = xml.replace("<p:spTree>", `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="1D3557"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>`);
      // white, left-aligned title: a first-level default run colour on the ctrTitle placeholder
      const sp = xml.match(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?type="ctrTitle"(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/)?.[0];
      if (!sp) throw new Error("Cover layout without a ctrTitle placeholder");
      const styled = sp.replace(/<a:lstStyle\/>|<a:lstStyle>/, `<a:lstStyle><a:lvl1pPr algn="l"><a:defRPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:lvl1pPr>`);
      xml = xml.replace(sp, styled.includes("</a:lstStyle>") ? styled : styled.replace("<a:lvl1pPr", "<a:lvl1pPr").replace("</a:lvl1pPr>", "</a:lvl1pPr></a:lstStyle>"));
    }
    if (name === "Section") xml = xml.replace(/<p:sldLayout\b/, '<p:sldLayout showMasterSp="0"');
    zip.file(f, xml);
  }
  return zip.generateAsync({ type: "blob" });
}
