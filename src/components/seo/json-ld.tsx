// One place that turns a schema object into a <script> tag, because the
// escaping below is the kind of thing that is remembered once and forgotten
// in the next three copies.
//
// The product page had it. The article page did not, and its `excerpt` is
// free text an author types: a "</script>" anywhere in one would close this
// tag early and drop the rest of the article into the document as live
// markup. JSON.stringify does not escape "<" — it is a legal character in a
// JSON string — so the browser's HTML tokenizer sees the closing tag before
// the JSON parser ever gets the value. Turning every "<" into its <
// form is still valid JSON, decodes to the same string, and cannot terminate
// the element.
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
