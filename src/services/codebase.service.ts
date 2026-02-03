import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import {
  ContentTypeSummary,
  parseSchemaFile,
  summarizeContentType,
} from '../utils/strapi-schema';

interface RouteDefinition {
  apiName: string;
  routes: { method: string; path: string; handler: string }[];
}

interface AIContextDoc {
  filename: string;
  content: string;
}

interface CodebaseIndex {
  contentTypes: ContentTypeSummary[];
  customRoutes: RouteDefinition[];
  aiContext: AIContextDoc[];
}

let cachedIndex: CodebaseIndex | null = null;

const apiDir = join(config.strapi.projectPath, 'src', 'api');

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function indexContentTypes(): Promise<ContentTypeSummary[]> {
  const apis = await readdir(apiDir);
  const summaries: ContentTypeSummary[] = [];

  for (const api of apis) {
    const schemaPath = join(apiDir, api, 'content-types', api, 'schema.json');
    if (await fileExists(schemaPath)) {
      try {
        summaries.push(await parseSchemaFile(schemaPath));
      } catch (err) {
        console.warn(`Failed to parse schema for ${api}:`, err);
      }
    }
  }

  return summaries;
}

async function indexCustomRoutes(): Promise<RouteDefinition[]> {
  const apis = await readdir(apiDir);
  const routeDefs: RouteDefinition[] = [];

  for (const api of apis) {
    const routesDir = join(apiDir, api, 'routes');
    if (!(await dirExists(routesDir))) continue;

    const routeFiles = await readdir(routesDir);
    const customFiles = routeFiles.filter(f => f.startsWith('01-') || f.startsWith('02-'));

    for (const file of customFiles) {
      try {
        const content = await readFile(join(routesDir, file), 'utf-8');
        const routes = parseRoutesFromSource(content);
        if (routes.length > 0) {
          routeDefs.push({ apiName: api, routes });
        }
      } catch (err) {
        console.warn(`Failed to parse routes for ${api}/${file}:`, err);
      }
    }
  }

  return routeDefs;
}

function parseRoutesFromSource(source: string): { method: string; path: string; handler: string }[] {
  const routes: { method: string; path: string; handler: string }[] = [];
  const routeRegex = /method:\s*['"](\w+)['"].*?path:\s*['"]([^'"]+)['"].*?handler:\s*['"]([^'"]+)['"]/gs;

  let match;
  while ((match = routeRegex.exec(source)) !== null) {
    routes.push({
      method: match[1],
      path: match[2],
      handler: match[3],
    });
  }

  return routes;
}

async function loadAIContext(): Promise<AIContextDoc[]> {
  const contextDir = join(config.strapi.projectPath, 'ai-context');
  if (!(await dirExists(contextDir))) {
    console.warn('No ai-context folder found in project');
    return [];
  }

  const files = await readdir(contextDir);
  const mdFiles = files.filter(f => f.endsWith('.md')).sort();
  const docs: AIContextDoc[] = [];

  for (const file of mdFiles) {
    try {
      const content = await readFile(join(contextDir, file), 'utf-8');
      docs.push({ filename: file, content });
    } catch (err) {
      console.warn(`Failed to read ai-context/${file}:`, err);
    }
  }

  return docs;
}

export async function getCodebaseIndex(): Promise<CodebaseIndex> {
  if (cachedIndex) return cachedIndex;

  console.log('Indexing strapi.rovr codebase...');
  const [contentTypes, customRoutes, aiContext] = await Promise.all([
    indexContentTypes(),
    indexCustomRoutes(),
    loadAIContext(),
  ]);

  cachedIndex = { contentTypes, customRoutes, aiContext };
  console.log(
    `Indexed ${contentTypes.length} content types, ${customRoutes.length} APIs with custom routes, ${aiContext.length} AI context docs`
  );

  return cachedIndex;
}

function buildAIContextSection(docs: AIContextDoc[]): string {
  if (docs.length === 0) return '';

  const sections = ['# Business Context\n'];
  for (const doc of docs) {
    sections.push(doc.content);
    sections.push('');
  }
  return sections.join('\n');
}

export function buildContextForAreas(
  index: CodebaseIndex,
  affectedAreas: string[]
): string {
  const normalizedAreas = affectedAreas.map(a => a.toLowerCase().replace(/\s+/g, '-'));

  const relevantTypes = index.contentTypes.filter(ct => {
    const name = ct.name.toLowerCase();
    return normalizedAreas.some(
      area => name.includes(area) || area.includes(name)
    );
  });

  // Always include closely related types (those referenced by relations)
  const relatedNames = new Set<string>();
  for (const ct of relevantTypes) {
    for (const rel of ct.relations) {
      relatedNames.add(rel.target);
    }
  }

  const relatedTypes = index.contentTypes.filter(
    ct => relatedNames.has(ct.name) && !relevantTypes.includes(ct)
  );

  const relevantRoutes = index.customRoutes.filter(r => {
    const name = r.apiName.toLowerCase();
    return normalizedAreas.some(
      area => name.includes(area) || area.includes(name)
    );
  });

  const sections: string[] = [];

  const aiContext = buildAIContextSection(index.aiContext);
  if (aiContext) {
    sections.push(aiContext);
  }

  if (relevantTypes.length > 0) {
    sections.push('# Directly Affected Content Types\n');
    sections.push(...relevantTypes.map(summarizeContentType));
  }

  if (relatedTypes.length > 0) {
    sections.push('\n# Related Content Types (via relations)\n');
    sections.push(...relatedTypes.map(summarizeContentType));
  }

  if (relevantRoutes.length > 0) {
    sections.push('\n# Custom Routes\n');
    for (const r of relevantRoutes) {
      sections.push(`## ${r.apiName}`);
      for (const route of r.routes) {
        sections.push(`  ${route.method} ${route.path} → ${route.handler}`);
      }
    }
  }

  return sections.join('\n');
}

export function buildFullContextSummary(index: CodebaseIndex): string {
  const sections: string[] = ['# strapi.rovr Project Summary\n'];

  const aiContext = buildAIContextSection(index.aiContext);
  if (aiContext) {
    sections.push(aiContext);
  }

  sections.push('## All Content Types\n');
  for (const ct of index.contentTypes) {
    sections.push(summarizeContentType(ct));
    sections.push('');
  }

  sections.push('\n## All Custom Routes\n');
  for (const r of index.customRoutes) {
    sections.push(`### ${r.apiName}`);
    for (const route of r.routes) {
      sections.push(`  ${route.method} ${route.path} → ${route.handler}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

export async function readFileContent(relativePath: string): Promise<string | null> {
  const fullPath = join(config.strapi.projectPath, relativePath);
  try {
    return await readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
