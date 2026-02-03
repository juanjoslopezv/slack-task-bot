import { readFile } from 'fs/promises';
import { basename, dirname } from 'path';

export interface SchemaAttribute {
  type: string;
  relation?: string;
  target?: string;
  enum?: string[];
  default?: unknown;
  required?: boolean;
  multiple?: boolean;
  inversedBy?: string;
  mappedBy?: string;
}

export interface StrapiSchema {
  kind: string;
  collectionName: string;
  info: {
    singularName: string;
    pluralName: string;
    displayName: string;
    description?: string;
  };
  attributes: Record<string, SchemaAttribute>;
}

export interface ContentTypeSummary {
  name: string;
  kind: string;
  collectionName: string;
  fields: string[];
  relations: { field: string; type: string; target: string }[];
  enums: { field: string; values: string[] }[];
}

export async function parseSchemaFile(filePath: string): Promise<ContentTypeSummary> {
  const raw = await readFile(filePath, 'utf-8');
  const schema: StrapiSchema = JSON.parse(raw);
  const name = basename(dirname(filePath));

  const fields: string[] = [];
  const relations: ContentTypeSummary['relations'] = [];
  const enums: ContentTypeSummary['enums'] = [];

  for (const [field, attr] of Object.entries(schema.attributes)) {
    if (attr.type === 'relation' && attr.target) {
      relations.push({
        field,
        type: attr.relation || 'unknown',
        target: attr.target.replace('api::', '').split('.')[0],
      });
    } else if (attr.type === 'enumeration' && attr.enum) {
      enums.push({ field, values: attr.enum });
    } else {
      fields.push(`${field}: ${attr.type}`);
    }
  }

  return {
    name,
    kind: schema.kind,
    collectionName: schema.collectionName,
    fields,
    relations,
    enums,
  };
}

export function summarizeContentType(ct: ContentTypeSummary): string {
  const lines: string[] = [`## ${ct.name} (${ct.kind})`];

  if (ct.fields.length > 0) {
    lines.push(`Fields: ${ct.fields.join(', ')}`);
  }

  if (ct.relations.length > 0) {
    const relStrs = ct.relations.map(r => `${r.field} → ${r.target} (${r.type})`);
    lines.push(`Relations: ${relStrs.join(', ')}`);
  }

  if (ct.enums.length > 0) {
    const enumStrs = ct.enums.map(e => `${e.field}: [${e.values.join('|')}]`);
    lines.push(`Enums: ${enumStrs.join(', ')}`);
  }

  return lines.join('\n');
}
