"use client";

import { useState } from "react";
import { Plus, X, Link as LinkIcon } from "lucide-react";
import { InlineEditField } from "@/components/product/inline-edit-field";
import { upsertProductSpecAction, upsertRawSpecAction } from "@/actions/admin-products";
import { DIMENSION_PATTERN } from "@/lib/product-content";

type Attribute = { id: string; key: string; label: string; unit: string | null };
// Each value carries its own attribute's label/unit directly — this is
// public spec-table content (not admin-only data), so a regular visitor
// can render the table without needing the separate admin-only `attributes`
// (full category attribute list) prop at all.
type AttributeValue = { id: string; attributeId: string; value: string; attribute: { key: string; label: string; unit: string | null } };

// Groups the flat attribute list into the three sections a real specs page
// uses (general identity, technical performance, physical dimensions) —
// same real attributes, just organized instead of one long list. Classifies
// by keyword pattern on the attribute's own key/label so it works the same
// way across every category, not just one hardcoded per-category list.
// DIMENSION_PATTERN is shared with the overview tab's מידות section so both
// agree on what counts as a dimension.
const IDENTITY_PATTERN = /צבע|חומר|תוצרת|יצרן|סוג|דגם|מותג|color|material|brand|model|manufacturer/i;

type SpecGroup = "general" | "performance" | "dimensions";
const SPEC_GROUP_LABELS: Record<SpecGroup, string> = { general: "נתונים כלליים", performance: "ביצועים", dimensions: "מידות" };
const SPEC_GROUP_ORDER: SpecGroup[] = ["general", "performance", "dimensions"];

function classifySpecGroup(key: string, label: string): SpecGroup {
  const text = `${key} ${label}`;
  if (DIMENSION_PATTERN.test(text)) return "dimensions";
  if (IDENTITY_PATTERN.test(text)) return "general";
  return "performance";
}

function groupSpecItems<T>(items: T[], classify: (item: T) => SpecGroup): { group: SpecGroup; items: T[] }[] {
  const byGroup = new Map<SpecGroup, T[]>();
  for (const item of items) {
    const group = classify(item);
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }
  return SPEC_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({ group, items: byGroup.get(group)! }));
}

function SpecGroupHeading({ group }: { group: SpecGroup }) {
  return <h4 className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">{SPEC_GROUP_LABELS[group]}</h4>;
}

// Non-admins see exactly the old behavior (only populated fields, or the
// raw-text fallback) — the full every-field-including-empty view, plus the
// custom-field editor, is an admin-only editing surface.
export function ProductSpecsEditor({
  productId,
  attributes,
  initialValues,
  rawSpecs,
  isAdmin,
  specSourceUrl,
}: {
  productId: string;
  attributes: Attribute[];
  initialValues: AttributeValue[];
  rawSpecs: Record<string, string> | null;
  isAdmin: boolean;
  // Where the spec data was scraped from, set via /api/integrations/
  // product-enrich's specSourceUrl. Only ever shown in the isAdmin branch
  // below — a non-admin visitor never sees this component render it.
  specSourceUrl?: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialValues.map((v) => [v.attributeId, v.value]))
  );
  const [customFields, setCustomFields] = useState<Record<string, string>>(rawSpecs ?? {});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  if (!isAdmin) {
    if (initialValues.length > 0) {
      const groups = groupSpecItems(initialValues, (v) => classifySpecGroup(v.attribute.key, v.attribute.label));
      return (
        <div className="flex max-w-2xl flex-col gap-5">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <SpecGroupHeading group={group} />
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {items.map((v) => (
                  <div key={v.id} className="border-border flex justify-between border-b py-2.5 text-sm">
                    <dt className="text-muted-foreground">
                      {v.attribute.label} {v.attribute.unit && `(${v.attribute.unit})`}
                    </dt>
                    <dd className="font-medium">{v.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      );
    }
    if (rawSpecs) {
      const groups = groupSpecItems(Object.entries(rawSpecs), ([key]) => classifySpecGroup(key, key));
      return (
        <div className="flex max-w-2xl flex-col gap-5">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <SpecGroupHeading group={group} />
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {items.map(([key, value]) => (
                  <div key={key} className="border-border flex justify-between border-b py-2.5 text-sm">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      );
    }
    return <p className="text-muted-foreground text-sm">אין מפרט טכני זמין למוצר זה.</p>;
  }

  function handleAddCustom() {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) return;
    setAddError(null);
    upsertRawSpecAction(productId, key, value).then((result) => {
      if (result.success) {
        setCustomFields((prev) => ({ ...prev, [key]: value }));
        setNewKey("");
        setNewValue("");
      } else {
        setAddError(result.error ?? "שגיאה בהוספת שדה");
      }
    });
  }

  const adminGroups = groupSpecItems(attributes, (attr) => classifySpecGroup(attr.key, attr.label));

  return (
    <div className="flex flex-col gap-6">
      {specSourceUrl && (
        <a
          href={specSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-brand -mb-2 flex w-fit items-center gap-1 text-xs"
        >
          <LinkIcon className="size-3" />
          מקור המפרט: {specSourceUrl}
        </a>
      )}
      {attributes.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-5">
          {adminGroups.map(({ group, items }) => (
            <div key={group}>
              <SpecGroupHeading group={group} />
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {items.map((attr) => (
                  <div key={attr.id} className="border-border flex items-start justify-between gap-3 border-b py-2.5 text-sm">
                    <dt className="text-muted-foreground shrink-0">
                      {attr.label} {attr.unit && `(${attr.unit})`}
                    </dt>
                    <dd className="font-medium">
                      <InlineEditField
                        value={values[attr.id] ?? ""}
                        onSave={async (value) => {
                          const result = await upsertProductSpecAction(productId, attr.id, value);
                          if (result.success) setValues((prev) => ({ ...prev, [attr.id]: value }));
                          return result;
                        }}
                        className="justify-end"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-muted-foreground mb-2 text-xs font-semibold">שדות מפרט מותאמים אישית</h3>
        <dl className="grid max-w-2xl grid-cols-1 gap-x-8 sm:grid-cols-2">
          {Object.entries(customFields).map(([key, value]) => (
            <div key={key} className="border-border flex items-start justify-between gap-3 border-b py-2.5 text-sm">
              <dt className="text-muted-foreground flex shrink-0 items-center gap-1.5">
                {key}
                <button
                  type="button"
                  onClick={() => {
                    upsertRawSpecAction(productId, key, "").then((result) => {
                      if (result.success) {
                        setCustomFields((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    });
                  }}
                  className="text-destructive/70 hover:text-destructive"
                  aria-label="הסר שדה"
                >
                  <X className="size-3" />
                </button>
              </dt>
              <dd className="font-medium">
                <InlineEditField
                  value={value}
                  onSave={async (v) => {
                    const result = await upsertRawSpecAction(productId, key, v);
                    if (result.success) setCustomFields((prev) => ({ ...prev, [key]: v }));
                    return result;
                  }}
                  className="justify-end"
                />
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="שם שדה"
            className="border-input w-32 rounded-lg border px-2 py-1 text-sm outline-none"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
            placeholder="ערך"
            className="border-input w-40 rounded-lg border px-2 py-1 text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="text-amber-600 hover:bg-amber-500/10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
          >
            <Plus className="size-3.5" /> הוסף שדה
          </button>
        </div>
        {addError && <p className="text-destructive mt-1 text-xs">{addError}</p>}
      </div>
    </div>
  );
}
