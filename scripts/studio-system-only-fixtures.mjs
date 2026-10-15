import { defaultSystem, STORAGE_KEY } from '../app/studio/tokens.ts';
import { createComposerDocument, createComposerFrame, createComposerPage } from '../app/studio/composer/model.ts';
import { COMPOSER_INDEX_KEY, COMPOSER_DOCUMENT_PREFIX, composerDocumentKey, serializeComposerEnvelope, serializeComposerIndex } from '../app/studio/composer/storage.ts';

export const keys = Object.freeze({ index: COMPOSER_INDEX_KEY, documents: COMPOSER_DOCUMENT_PREFIX, pageEditor: 'bambiui.examples.page-editor.bundle.v1', systems: 'bambiui.systems.v1', mirror: STORAGE_KEY });
export const targetId = 'qa-target';
export const otherId = 'qa-other';

export function systemsFixture() {
  const system = structuredClone(defaultSystem);
  system.name = 'QA target system';
  const other = structuredClone(defaultSystem);
  other.name = 'QA unrelated system';
  return { [keys.systems]: JSON.stringify({ version: 1, activeId: targetId, systems: [{ id: targetId, system }, { id: otherId, system: other }] }), [keys.mirror]: JSON.stringify(system) };
}

export function projectFixture(systemId = targetId, id = 'qa-project') {
  const document = createComposerDocument(id, systemId, 'QA legacy — İğne 🦌');
  const page = createComposerPage('qa-page');
  const frame = createComposerFrame('qa-frame', 'qa-root', 'mobile');
  frame.root.children = [{ id: 'qa-text', kind: 'text', text: 'Preserve Unicode, whitespace and quotes: İğne 🦌 " \\ \n' }];
  page.frames.push(frame);
  document.pages.push(page);
  return {
    [keys.index]: serializeComposerIndex({ version: 1, activeProjectId: id, projectIds: [id] }) + '\n ',
    [composerDocumentKey(id)]: serializeComposerEnvelope({ version: 1, revision: 7, document }, id) + '\n\t ',
  };
}

export function recoveryFixture() {
  return {
    ...systemsFixture(), ...projectFixture(),
    [keys.documents + 'raw-orphan']: ' \n{"broken":"İğne 🦌", "unfinished":\t',
    [keys.pageEditor]: '\t{ malformed legacy page: "雪 🦌" \n',
    'another-app.private': 'PRIVATE-CANARY-must-not-export',
    [keys.index + '.private']: 'PRIVATE-NEAR-MATCH',
    [keys.documents]: 'PRIVATE-EMPTY-SUFFIX',
    [keys.systems + '.private']: 'PRIVATE-SYSTEM-NEAR-MATCH',
  };
}

export function recoveryRecords(entries) {
  const exact = new Set([keys.index, keys.pageEditor, keys.systems, keys.mirror]);
  return Object.entries(entries).filter(([key]) => exact.has(key) || (key.startsWith(keys.documents) && key.length > keys.documents.length))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, raw]) => ({ key, raw }));
}

export function projectRecords(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => key === keys.index || key.startsWith(keys.documents) || key === keys.pageEditor));
}

export function deletionFixtures() {
  const linked = projectFixture();
  const documentKey = composerDocumentKey('qa-project');
  const inactive = { ...projectFixture(otherId), ...projectFixture(targetId, 'qa-inactive') };
  inactive[keys.index] = serializeComposerIndex({ version: 1, activeProjectId: 'qa-project', projectIds: ['qa-project', 'qa-inactive'] });
  return [
    ['linked project', linked],
    ['inactive linked project', inactive],
    ['malformed index', { [keys.index]: '{ broken index 🦌' }],
    ['missing registered document', { [keys.index]: linked[keys.index] }],
    ['malformed document', { ...linked, [documentKey]: '{ broken document 雪' }],
    ['future document', { ...linked, [documentKey]: JSON.stringify({ ...JSON.parse(linked[documentKey]), version: 99 }) }],
    ['orphan without index', { [documentKey]: linked[documentKey] }],
    ['partial document with empty index', { [keys.index]: serializeComposerIndex({ version: 1, activeProjectId: null, projectIds: [] }), [documentKey]: linked[documentKey] }],
  ];
}
